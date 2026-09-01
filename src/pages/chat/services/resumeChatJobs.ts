import { supabase } from "@/integrations/supabase/client";
import { resumeJob as resumeBgJob, failStaleJob } from "@/lib/jobs/client";
import {
  getActiveChatJobs,
  hydrateActiveChatJobs,
  removeActiveChatJob,
} from "@/lib/jobs/chatResume";
import type { Message } from "../chatConstants";

interface Args {
  conversationId: string;
  msgs: any[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  ownInsertedIdsRef: React.MutableRefObject<Set<string>>;
  saveMessage: (
    conversationId: string,
    role: "user" | "assistant",
    content: string,
    images?: string[],
  ) => Promise<string | null | undefined>;
}

type Entry = { jobId: string; messageId?: string; clientId?: string; userInput: string };

/**
 * Re-attaches to any in-flight deep-research chat jobs after the user
 * navigates to (or reloads) a conversation. Two sources of truth:
 *
 *  1. `messages` rows with `metadata.kind === "researchPending"` — durable
 *     across devices/sessions because they live in the DB.
 *  2. In-memory `getActiveChatJobs(id)` entries that were hydrated from
 *     `background_jobs` on mount — covers the same-tab race before the
 *     placeholder row lands in `messages`.
 *
 * For each entry we ensure a UI placeholder bubble exists, then stream
 * deltas / images / final text via `resumeBgJob`. The final assistant
 * text is persisted exactly once (idempotent via the `saved` guard) and
 * old placeholder rows are deleted so reload won't show duplicates.
 */
export async function resumeChatJobs({
  conversationId,
  msgs,
  setMessages,
  ownInsertedIdsRef,
  saveMessage,
}: Args): Promise<void> {
  try {
    await hydrateActiveChatJobs(conversationId);
    const entries: Entry[] = [];

    for (const m of msgs) {
      const meta = (m.metadata || {}) as any;
      if (meta?.kind === "researchPending" && meta?.chatJobId) {
        entries.push({
          jobId: meta.chatJobId,
          messageId: m.id,
          userInput: meta.query || "Deep Research",
        });
      }
    }

    const localPending = getActiveChatJobs(conversationId);
    for (const p of localPending) {
      if (entries.some((e) => e.jobId === p.jobId)) continue;
      entries.push({
        jobId: p.jobId,
        clientId: p.clientId,
        userInput: p.userInput,
      });
    }

    for (const entry of entries) {
      const clientId = entry.clientId || `assistant-resume-${entry.jobId}`;
      setMessages((prev) => {
        const byIdOrJob = prev.find(
          (m) =>
            (entry.messageId && m.id === entry.messageId) || (m as any).chatJobId === entry.jobId,
        );
        if (byIdOrJob) {
          return prev.map((m) =>
            m === byIdOrJob ? ({ ...m, chatJobId: entry.jobId, mode: "deep-research" } as any) : m,
          );
        }
        return [
          ...prev,
          {
            role: "user",
            content: entry.userInput,
            clientId: `user-resume-${entry.jobId}`,
            mode: "deep-research",
          },
          {
            role: "assistant",
            content: "",
            clientId,
            chatJobId: entry.jobId,
            mode: "deep-research",
            id: entry.messageId,
          } as any,
        ];
      });

      let assistantText = "";
      let resumeImages: string[] = [];
      let saved = false;
      const persist = async () => {
        if (saved) return;
        const finalText = assistantText.trim();
        if (!finalText) return;
        saved = true;
        if (entry.messageId) {
          try {
            await supabase.from("messages").delete().eq("id", entry.messageId);
          } catch {
            /* ignore */
          }
        }
        const aId = await saveMessage(
          conversationId,
          "assistant",
          finalText,
          resumeImages.length ? resumeImages : undefined,
        );
        if (aId) ownInsertedIdsRef.current.add(aId);
        setMessages((prev) =>
          prev.map((m) =>
            (entry.messageId && m.id === entry.messageId) || m.clientId === clientId
              ? {
                  ...m,
                  id: aId || m.id,
                  content: finalText,
                  images: resumeImages.length ? resumeImages : m.images,
                  chatJobId: undefined,
                }
              : m,
          ),
        );
      };

      resumeBgJob(entry.jobId, {
        onDelta: (_chunk, full) => {
          assistantText = full;
          setMessages((prev) =>
            prev.map((m) =>
              (entry.messageId && m.id === entry.messageId) || m.clientId === clientId
                ? { ...m, content: full }
                : m,
            ),
          );
        },
        onMeta: (meta) => {
          if (Array.isArray(meta?.images)) {
            resumeImages = meta.images;
            setMessages((prev) =>
              prev.map((m) =>
                (entry.messageId && m.id === entry.messageId) || m.clientId === clientId
                  ? { ...m, images: meta.images }
                  : m,
              ),
            );
          }
        },
        onDone: async () => {
          await persist();
          removeActiveChatJob(entry.jobId);
        },
        onError: async (msg) => {
          if (!assistantText.trim()) {
            setMessages((prev) =>
              prev.map((m) =>
                (entry.messageId && m.id === entry.messageId) || m.clientId === clientId
                  ? { ...m, content: `Deep Research stopped: ${msg}`, chatJobId: undefined }
                  : m,
              ),
            );
            if (entry.messageId) {
              try {
                await supabase.from("messages").delete().eq("id", entry.messageId);
              } catch {}
            }
          } else {
            await persist();
          }
          removeActiveChatJob(entry.jobId);
        },
        onStale: async (row) => {
          // Worker died mid-run. Mark the job failed so it leaves the active
          // list, then either persist whatever partial text we have or drop
          // the placeholder row entirely.
          try {
            await failStaleJob(entry.jobId);
          } catch {
            /* ignore */
          }
          const partial = (row.stream_text || assistantText || "").trim();
          if (partial) {
            assistantText = partial;
            await persist();
          } else {
            setMessages((prev) =>
              prev.map((m) =>
                (entry.messageId && m.id === entry.messageId) || m.clientId === clientId
                  ? {
                      ...m,
                      content: "Deep Research stopped unexpectedly. You can run it again.",
                      chatJobId: undefined,
                    }
                  : m,
              ),
            );
            if (entry.messageId) {
              try {
                await supabase.from("messages").delete().eq("id", entry.messageId);
              } catch {}
            }
          }
          removeActiveChatJob(entry.jobId);
        },
      });
    }
  } catch (e) {
    console.warn("[chat-resume] failed", e);
  }
}
