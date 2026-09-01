import { useState } from "react";

/**
 * Encapsulates state for the chat user's identity and conversation ownership.
 * Extracted from ChatPage to reduce re-render surface.
 */
export function useChatIdentity() {
  const [conversationOwnerId, setConversationOwnerId] = useState<string | null>(null);
  const [chatUserId, setChatUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");

  return {
    conversationOwnerId,
    setConversationOwnerId,
    chatUserId,
    setChatUserId,
    userName,
    setUserName,
  };
}
