// Frontend client for background jobs (server-side execution).
// Continues even if the user closes the tab. On return we resume via Realtime.

import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_MODEL } from "@/lib/defaultModel";

export type JobKind =
  | "chat"
  | "docs"
  | "slides"
  | "deep_research"
  | "image"
  | "video"
  | "code_build";
export type JobStatus = "queued" | "running" | "needs_input" | "done" | "error" | "canceled";

export interface JobRow {
  id: string;
  user_id: string;
  conversation_id: string | null;
  message_id: string | null;
  kind: JobKind;
  status: JobStatus;
  phase: string | null;
  progress: number;
  status_text: string | null;
  input: any;
  output: any;
  stream_text: string;
  meta: any;
  clarify: any;
  error: string | null;
  last_heartbeat_at?: string | null;
  updated_at?: string | null;
}

// Watchdog (jobs-watchdog) runs every minute and re-queues anything without a
// heartbeat for >90s. Give it a generous grace window before the client gives
// up so transient edge-function restarts heal silently instead of showing
// "Job stopped unexpectedly" to the user.
const STALE_JOB_MS = 4 * 60_000;
const CODE_BUILD_STALE_MS = 4 * 60_000;
const DEEP_RESEARCH_STALE_MS = 15 * 60_000;

function staleWindowForKind(kind: JobKind): number {
  if (kind === "slides") return 16 * 60_000;
  if (kind === "deep_research") return DEEP_RESEARCH_STALE_MS;
  if (kind === "code_build") return CODE_BUILD_STALE_MS;
  return STALE_JOB_MS;
}

export function isJobStale(
  row: Pick<JobRow, "status" | "last_heartbeat_at" | "updated_at">,
  staleMs = STALE_JOB_MS,
): boolean {
  if (row.status !== "running" && row.status !== "queued") return false;
  const stamp = row.last_heartbeat_at || row.updated_at;
  if (!stamp) return false;
  return Date.now() - new Date(stamp).getTime() > staleMs;
}

export interface JobHandlers {
  onStatus?: (text: string) => void;
  onProgress?: (progress: number, phase?: string | null) => void;
  onMeta?: (meta: any) => void;
  onDelta?: (chunk: string, fullSoFar: string) => void;
  onClarify?: (clarify: any) => void;
  onOutput?: (output: any) => void;
  onDone?: (row: JobRow) => void;
  onError?: (message: string) => void;
  onStale?: (row: JobRow) => void;
}

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

/**
 * Fetch with automatic retry on transient edge-runtime cold-start errors
 * (502/503/504 from the Supabase functions proxy). The first request after a
 * function has been idle can return 502 before the worker is ready; a quick
 * retry almost always succeeds, so we hide this from the user.
 */
async function fetchWithRetry(input: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const resp = await fetch(input, init);
      if (resp.status === 502 || resp.status === 503 || resp.status === 504) {
        if (i < attempts - 1) {
          await new Promise((r) => setTimeout(r, 600 * (i + 1)));
          continue;
        }
      }
      return resp;
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 600 * (i + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr ?? new Error("Network error");
}

const KIND_TO_PATH: Record<JobKind, string> = {
  chat: "/chat",
  docs: "/docs-generate",
  slides: "/chat-slides-stream",
  deep_research: "/chat",
  image: "/generate-image",
  video: "/generate-video",
  code_build: "/code-build",
};

/**
 * Return a valid user access token, refreshing the session when needed.
 * Background-job edge functions require a JWT with a `sub` claim; the public
 * anon key is only a project key and is rejected as `auth_required`. If there
 * is no signed-in user we ask them to register/sign in instead of failing
 * silently with a cryptic error.
 */
async function requireAccessToken(): Promise<string> {
  let {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session;
  }
  if (!session?.access_token) {
    throw new Error("Please sign in to continue.");
  }
  return session.access_token;
}

export async function startJob(kind: JobKind, payload: any): Promise<{ jobId: string }> {
  const token = await requireAccessToken();
  const path = KIND_TO_PATH[kind];
  // Idempotency key: `fetchWithRetry` re-sends the POST on 502/503/504 from
  // the functions proxy. Without this header a transient timeout could enqueue
  // the same paid job twice (double image/video/deep-research charges). Server
  // handlers that recognise the header will dedupe; those that don't ignore it.
  const idempotencyKey =
    (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const resp = await fetchWithRetry(`${FN_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": idempotencyKey,
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ model: DEFAULT_MODEL, ...payload, idempotency_key: idempotencyKey }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(t || `HTTP ${resp.status}`);
  }
  const data = await resp.json();
  if (!data?.jobId) throw new Error("Server did not return jobId");
  return { jobId: data.jobId as string };
}

/**
 * Start a Plus AI standard-tier presentation job.
 * Hits the `plusai-presentation` edge function which writes progress + the final
 * PPTX URL to `background_jobs` (kind="slides") — subscribe with `subscribeJob`.
 */
export async function startPlusAIPresentation(payload: {
  topic: string;
  templateId?: string;
  conversation_id?: string | null;
  message_id?: string | null;
  language?: string;
  numberOfSlides?: number;
}): Promise<{ jobId: string }> {
  const { findSlidesTemplate } = await import("@/lib/slidesTemplates");
  const tpl = findSlidesTemplate(payload.templateId);
  const token = await requireAccessToken();
  const resp = await fetchWithRetry(`${FN_BASE}/chat-slides-stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      ...payload,
      provider: "plusai",
      stylePrompt: tpl.stylePrompt ?? "",
      templateName: tpl.name,
      templateColors: tpl.colors,
    }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(t || `HTTP ${resp.status}`);
  }
  const data = await resp.json();
  if (!data?.jobId) throw new Error("Server did not return jobId");
  return { jobId: data.jobId as string };
}

/** Read a job row once. */
export async function getJob(jobId: string): Promise<JobRow | null> {
  const { data, error } = await supabase
    .from("background_jobs" as any)
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw error;
  return (data as any) ?? null;
}

/** List the current user's still-running jobs for a given kind (newest first). */
export async function listActiveJobs(kind: JobKind, limit = 5): Promise<JobRow[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("background_jobs" as any)
    .select("*")
    .eq("user_id", user.id)
    .eq("kind", kind)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  const staleMs = staleWindowForKind(kind);
  return (((data as any) || []) as JobRow[]).filter((row) => !isJobStale(row, staleMs));
}

export async function failStaleJob(
  jobId: string,
  message = "Job stopped unexpectedly. Progress was saved.",
): Promise<void> {
  await supabase
    .from("background_jobs" as any)
    .update({
      status: "error",
      error: message,
      status_text: "Stopped",
      progress: 100,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .in("status", ["queued", "running"]);
}

/** Subscribe to a job row via Realtime. Returns an unsubscribe function. */
export function subscribeJob(jobId: string, handlers: JobHandlers): () => void {
  let lastStreamLen = 0;
  let lastMetaJson = "";
  let lastClarifyJson = "";
  let lastOutputJson = "";
  let lastStatus: JobStatus | null = null;
  let cleanup: () => void = () => {};

  const emit = (row: JobRow) => {
    // status text
    if (row.status_text) handlers.onStatus?.(row.status_text);
    // progress
    if (typeof row.progress === "number") handlers.onProgress?.(row.progress, row.phase);
    // meta
    if (row.meta && Object.keys(row.meta).length) {
      const j = JSON.stringify(row.meta);
      if (j !== lastMetaJson) {
        lastMetaJson = j;
        handlers.onMeta?.(row.meta);
      }
    }
    // delta
    const cur = row.stream_text ?? "";
    if (cur.length > lastStreamLen) {
      const chunk = cur.slice(lastStreamLen);
      lastStreamLen = cur.length;
      handlers.onDelta?.(chunk, cur);
    }
    // clarify
    if (row.clarify) {
      const j = JSON.stringify(row.clarify);
      if (j !== lastClarifyJson) {
        lastClarifyJson = j;
        handlers.onClarify?.(row.clarify);
      }
    }
    // output
    if (row.output && Object.keys(row.output).length) {
      const j = JSON.stringify(row.output);
      if (j !== lastOutputJson) {
        lastOutputJson = j;
        handlers.onOutput?.(row.output);
      }
    }
    // stale running jobs: the edge worker likely died after saving partial state.
    // Code-build UX must fail fast instead of looking like it is thinking forever.
    const staleMs = staleWindowForKind(row.kind);
    if (isJobStale(row, staleMs)) {
      if (handlers.onStale) handlers.onStale(row);
      else handlers.onError?.("The job stopped unexpectedly. Please try again.");
      cleanup();
      return;
    }
    // terminal
    if (row.status !== lastStatus) {
      lastStatus = row.status;
      if (row.status === "done" || row.status === "needs_input") {
        handlers.onDone?.(row);
        cleanup();
      } else if (row.status === "error") {
        handlers.onError?.(row.error || "Unknown error");
        cleanup();
      } else if (row.status === "canceled") {
        handlers.onError?.("canceled");
        cleanup();
      }
    }
  };

  // Initial fetch + then subscribe
  let unsubscribed = false;
  let pollId: ReturnType<typeof setInterval> | null = null;
  const channelTopic = `job:${jobId}:${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`;
  const channel = supabase
    .channel(channelTopic)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "background_jobs", filter: `id=eq.${jobId}` },
      (payload) => {
        if (unsubscribed) return;
        emit(payload.new as JobRow);
      },
    )
    .subscribe();

  // Hydrate current state immediately so we don't miss anything before subscription.
  getJob(jobId)
    .then((row) => {
      if (row && !unsubscribed) emit(row);
    })
    .catch(() => {});
  pollId = setInterval(() => {
    getJob(jobId)
      .then((row) => {
        if (row && !unsubscribed) emit(row);
      })
      .catch(() => {});
  }, 5000);

  cleanup = () => {
    unsubscribed = true;
    if (pollId) clearInterval(pollId);
    try {
      supabase.removeChannel(channel);
    } catch {
      /* ignore */
    }
  };

  return cleanup;
}

/** Resume a job: read current state immediately and subscribe for the rest. */
export function resumeJob(jobId: string, handlers: JobHandlers): () => void {
  return subscribeJob(jobId, handlers);
}

/** Mark a job canceled. The runner will exit at its next checkpoint. */
export async function cancelJob(jobId: string): Promise<void> {
  await supabase
    .from("background_jobs" as any)
    .update({ status: "canceled" })
    .eq("id", jobId);
}
