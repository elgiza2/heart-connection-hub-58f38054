import { useState } from "react";

/**
 * Encapsulates state for the current conversation metadata (id, title,
 * first-visit flag) that's shared across many subsystems. Extracted from
 * ChatPage to reduce re-render surface.
 */
export function useConversationMeta() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState("");
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  return {
    conversationId,
    setConversationId,
    conversationTitle,
    setConversationTitle,
    isFirstVisit,
    setIsFirstVisit,
    loadingMessages,
    setLoadingMessages,
  };
}
