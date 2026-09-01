// Client helper: starts a docs-generate background job and subscribes to its
// progress via Realtime. The job continues server-side even if the user closes
// the tab; when they return, call `resumeDocJob(jobId, handlers)`.
import type { DocsClarifyQuestion, DocsClarifyUi } from "./types";
import {
  startJob,
  resumeJob as resumeJobBase,
  type JobHandlers,
  getJob,
  failStaleJob,
} from "@/lib/jobs/client";

export type DocsStreamHandlers = {
  onStatus?: (text: string) => void;
  onMeta?: (m: { title: string; doc_type: string }) => void;
  onHtmlDelta?: (chunk: string, fullSoFar: string) => void;
  onHtmlDone?: (fullHtml: string, friendlyMessage?: string) => void;
  onClarify?: (c: { reason: string; questions: DocsClarifyQuestion[]; ui?: DocsClarifyUi }) => void;
  onError?: (msg: string) => void;
  onJobId?: (jobId: string) => void;
  signal?: AbortSignal;
};

function toJobHandlers(h: DocsStreamHandlers): JobHandlers {
  return {
    onStatus: (t) => h.onStatus?.(t),
    onMeta: (m) => {
      if (m && (m.title || m.doc_type)) {
        h.onMeta?.({
          title: String(m.title ?? "Document"),
          doc_type: String(m.doc_type ?? "document"),
        });
      }
    },
    onDelta: (chunk, full) => h.onHtmlDelta?.(chunk, full),
    onClarify: (c) =>
      h.onClarify?.({
        reason: c?.reason ?? "",
        questions: (c?.questions ?? []) as DocsClarifyQuestion[],
        ui: (c?.ui ?? undefined) as DocsClarifyUi | undefined,
      }),
    onDone: (row) => {
      const html = (row.output?.html as string) || row.stream_text || "";
      const friendly = (row.output?.friendly_message as string) || "";
      if (html) h.onHtmlDone?.(html, friendly || undefined);
    },
    onError: (msg) => h.onError?.(msg),
    // The edge worker can be preempted mid-stream (Supabase shuts down the
    // function and the job row stays in "running" forever with no heartbeat).
    // When the realtime subscriber detects that, mark the row as failed and
    // surface a clear, retryable error to the user instead of an endless
    // "Streaming document live…" status.
    onStale: (row) => {
      void failStaleJob(row.id, "The document generation stopped unexpectedly. Please try again.");
      h.onError?.("The document generation stopped unexpectedly. Please try again.");
    },
  };
}

/**
 * Start a new server-side docs job and stream its progress.
 * Resolves when the job reaches a terminal state (done, needs_input, or error).
 * The job continues server-side even if the user closes the tab. To pick it
 * up again later, persist the jobId (from `onJobId`) and call `resumeDocJob`.
 */
export async function streamDoc(
  opts: {
    prompt: string;
    history?: { role: string; content: string }[];
    clarifications?: Record<string, string>;
    conversationId?: string | null;
    messageId?: string | null;
  },
  handlers: DocsStreamHandlers,
): Promise<void> {
  let jobId: string;
  try {
    const r = await startJob("docs", {
      prompt: opts.prompt,
      history: opts.history ?? [],
      clarifications: opts.clarifications,
      conversation_id: opts.conversationId ?? null,
      message_id: opts.messageId ?? null,
    });
    jobId = r.jobId;
  } catch (e) {
    handlers.onError?.(e instanceof Error ? e.message : String(e));
    return;
  }
  handlers.onJobId?.(jobId);

  await new Promise<void>((resolve, reject) => {
    let resolved = false;
    let unsubscribe: () => void = () => {};
    let terminalError: unknown = null;
    const finish = () => {
      if (!resolved) {
        resolved = true;
        try {
          unsubscribe();
        } catch {
          /* ignore unsubscribe errors */
        }
        if (terminalError) reject(terminalError);
        else resolve();
      }
    };
    const safely = <T extends unknown[]>(cb: ((...args: T) => void) | undefined, ...args: T) => {
      try {
        cb?.(...args);
      } catch (e) {
        terminalError = e;
      } finally {
        finish();
      }
    };
    const wrapped: DocsStreamHandlers = {
      ...handlers,
      onHtmlDone: (full, friendly) => safely(handlers.onHtmlDone, full, friendly),
      onClarify: (c) => safely(handlers.onClarify, c),
      onError: (m) => safely(handlers.onError, m),
    };
    unsubscribe = resumeDocJob(jobId, wrapped);
    if (handlers.signal) {
      if (handlers.signal.aborted) finish();
      else handlers.signal.addEventListener("abort", finish, { once: true });
    }
  });
}

/** Resume an existing docs job (e.g. after page reload or coming back to chat). */
export function resumeDocJob(jobId: string, handlers: DocsStreamHandlers): () => void {
  return resumeJobBase(jobId, toJobHandlers(handlers));
}

/** One-shot fetch of the current docs job state. */
export async function fetchDocJob(jobId: string) {
  return await getJob(jobId);
}
