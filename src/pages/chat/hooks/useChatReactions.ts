import { useState } from "react";

export type Reactor = { id: string; emoji: string; user_id: string };
export type Reader = { user_id: string; name?: string; avatar?: string };

/**
 * Encapsulates state for chat message reactions, read receipts, and the
 * reaction picker overlay. Extracted from ChatPage to reduce re-render surface.
 */
export function useChatReactions() {
  const [messageReads, setMessageReads] = useState<Record<string, Reader[]>>({});
  const [messageReactions, setMessageReactions] = useState<Record<string, Reactor[]>>({});
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);

  return {
    messageReads,
    setMessageReads,
    messageReactions,
    setMessageReactions,
    reactionPickerFor,
    setReactionPickerFor,
  };
}
