import { supabase } from "@/integrations/supabase/client";
import { friendlyUserMessage, reportError } from "@/lib/errors";
import type { Message } from "../chatConstants";

interface Args {
  msgs: any[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

/**
 * Scans the loaded message rows for in-flight `docsPending` jobs and
 * re-attaches each one to its background generator via `resumeDocJob`.
 * Streamed HTML deltas, clarifications and final markdown messages are
 * patched into the matching UI message AND persisted to the messages
 * table so reload picks them up. Safe to call concurrently per id;
 * errors are logged but never thrown.
 */
export async function resumeDocsJobs({ msgs, setMessages }: Args): Promise<void> {
  try {
    const { resumeDocJob } = await import("@/lib/agent/docs/docsGenerator");
    const { saveDocHtml } = await import("@/lib/agent/docs/htmlCache");

    for (const m of msgs) {
      const meta = (m.metadata || {}) as any;
      if (meta?.kind !== "docsPending" || !meta?.docsJobId) continue;
      const jobId = meta.docsJobId as string;
      const messageId = m.id as string;
      const artifactId = meta?.docsArtifact?.artifactId || jobId;
      const originalPrompt = String(
        meta?.originalPrompt || meta?.docsClarify?.originalPrompt || "",
      );
      let title = meta?.docsArtifact?.title || "Document";
      let docType = meta?.docsArtifact?.docType || "document";

      resumeDocJob(jobId, {
        onMeta: (mm) => {
          title = mm.title;
          docType = mm.doc_type;
        },
        onHtmlDelta: (_chunk, full) => {
          setMessages((prev) =>
            prev.map((x) =>
              x.id === messageId
                ? {
                    ...x,
                    content: "",
                    docsArtifact: { artifactId, title, docType, html: full },
                  }
                : x,
            ),
          );
        },
        onHtmlDone: async (full, friendly) => {
          saveDocHtml(artifactId, full);
          let msg = friendly || "";
          if (!msg) {
            const { buildDocReadyMessageAI } = await import("@/lib/agent/docs/readyMessage");
            msg = await buildDocReadyMessageAI({
              title,
              html: full,
              docType,
              prompt: originalPrompt,
            });
          }
          setMessages((prev) =>
            prev.map((x) =>
              x.id === messageId
                ? {
                    ...x,
                    content: msg,
                    docsArtifact: { artifactId, title, docType, html: full },
                  }
                : x,
            ),
          );
          try {
            await supabase
              .from("messages")
              .update({
                content: msg,
                metadata: {
                  kind: "docsArtifact",
                  docsArtifact: { artifactId, title, docType, html: full },
                },
              })
              .eq("id", messageId);
          } catch {
            /* server already does this; best-effort */
          }
        },
        onClarify: async (c) => {
          setMessages((prev) =>
            prev.map((x) =>
              x.id === messageId
                ? {
                    ...x,
                    content: c.reason,
                    docsArtifact: undefined,
                    docsClarify: { ...c, originalPrompt },
                  }
                : x,
            ),
          );
          try {
            await supabase
              .from("messages")
              .update({
                content: c.reason,
                metadata: { kind: "docsClarify", docsClarify: { ...c, originalPrompt } },
              })
              .eq("id", messageId);
          } catch {}
        },
        onError: (msg) => {
          const safe = friendlyUserMessage(
            msg,
            "We couldn't generate the document. Please try again.",
          );
          void reportError(msg, { source: "docs-resume", context: { messageId } });
          setMessages((prev) =>
            prev.map((x) => (x.id === messageId ? { ...x, content: safe } : x)),
          );
        },
      });
    }
  } catch (e) {
    console.warn("[docs] resume failed", e);
  }
}
