import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cancelJob } from "@/lib/jobs/client";
import type { Message, ChatMode } from "../chatConstants";

interface Args {
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  activeResearchJobId: string | null;
  setActiveResearchJobId: (id: string | null) => void;
  chatMode: ChatMode;
  setChatMode: (mode: ChatMode) => void;
  setSearchEnabled: (v: boolean) => void;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  slidesGenerationTokenRef: React.MutableRefObject<number>;
  clearSlidesTimeout: (jobId: string) => void;
  failStaleJob: (jobId: string, msg: string) => Promise<void>;
  conversationId: string | null;
  setIsLoading: (v: boolean) => void;
  setIsThinking: (v: boolean) => void;
  resetToolUi: () => void;
  saveMessage: (
    conversationId: string,
    role: "assistant" | "user",
    content: string,
  ) => Promise<unknown>;
}

const STOPPED_MARK = "_Message cancelled._";

/**
 * Cancels the in-flight assistant turn:
 *  - Aborts the streaming fetch controller
 *  - Cancels any active deep-research job
 *  - For slides modes: bumps the generation token, ends timers and marks
 *    pending placeholder messages as cancelled in the DB
 *  - Appends a "Message cancelled." marker to the last assistant bubble
 *    and persists it (when not in slides mode)
 */
export function useChatCancel(args: Args) {
  const {
    abortControllerRef,
    activeResearchJobId,
    setActiveResearchJobId,
    chatMode,
    setChatMode,
    setSearchEnabled,
    messages,
    setMessages,
    slidesGenerationTokenRef,
    clearSlidesTimeout,
    failStaleJob,
    conversationId,
    setIsLoading,
    setIsThinking,
    resetToolUi,
    saveMessage,
  } = args;

  return useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Cancel any server-side background chat jobs attached to running
    // assistant bubbles. Aborting the local fetch alone does not stop the
    // worker, which keeps burning tokens/credits after the user hit Stop.
    const runningChatJobIds = Array.from(
      new Set(
        messages
          .map((m) => (m as any).chatJobId as string | undefined)
          .filter((v): v is string => Boolean(v)),
      ),
    );
    for (const jobId of runningChatJobIds) {
      void cancelJob(jobId).catch(() => {});
    }
    if (activeResearchJobId) setActiveResearchJobId(null);
    const wasSlidesMode = chatMode === "slides" || chatMode === "slides-images";
    const runningSlideJobIds = messages.map((m) => m.slidesJobId).filter(Boolean) as string[];
    if (wasSlidesMode) {
      slidesGenerationTokenRef.current += 1;
      setChatMode("normal");
      setSearchEnabled(true);
      for (const jobId of runningSlideJobIds) {
        clearSlidesTimeout(jobId);
        void failStaleJob(jobId, "Slides generation was cancelled.").catch(() => {});
      }
      if (conversationId) {
        void supabase
          .from("conversations")
          .update({ mode: "chat", updated_at: new Date().toISOString() } as any)
          .eq("id", conversationId);
        void supabase
          .from("messages")
          .update({
            content: "Slides generation was cancelled.",
            metadata: { kind: "slidesError", cancelled: true } as any,
          })
          .eq("conversation_id", conversationId)
          .eq("role", "assistant")
          .contains("metadata", { kind: "slidesPending" } as any);
      }
    }
    setIsLoading(false);
    setIsThinking(false);
    resetToolUi();
    let finalContent = "";
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last?.role !== "assistant") return prev;
      const existing = (last.content || "").trim();
      finalContent = existing ? `${existing}\n\n${STOPPED_MARK}` : STOPPED_MARK;
      const next = prev.slice();
      next[next.length - 1] = { ...last, content: finalContent };
      return next;
    });
    if (conversationId && finalContent && !wasSlidesMode) {
      void saveMessage(conversationId, "assistant", finalContent).catch(() => {});
    }
  }, [
    abortControllerRef,
    activeResearchJobId,
    setActiveResearchJobId,
    chatMode,
    setChatMode,
    setSearchEnabled,
    messages,
    setMessages,
    slidesGenerationTokenRef,
    clearSlidesTimeout,
    failStaleJob,
    conversationId,
    setIsLoading,
    setIsThinking,
    resetToolUi,
    saveMessage,
  ]);
}
