import { useCallback, useState } from "react";
import { trackChatInteraction } from "../services/trackInteraction";

/**
 * Encapsulates state for the "edit a previously-sent user message" flow.
 * Tracks the index/original-text being edited and provides handlers to
 * start/cancel the edit. Extracted from ChatPage to reduce re-render surface.
 */
export function useMessageEdit(opts: {
  setInput: (v: string) => void;
  userId?: string | null;
  conversationId?: string | null;
}) {
  const { setInput, userId, conversationId } = opts;
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingOriginal, setEditingOriginal] = useState<string>("");

  const handleEditUserMessageAt = useCallback(
    (index: number, messageText: string) => {
      setEditingIndex(index);
      setEditingOriginal(messageText);
      setInput(messageText);
      trackChatInteraction("edit_user_message", {
        userId,
        conversationId,
        metadata: { index, length: messageText.length },
      });
      // Focus textarea on next tick
      setTimeout(() => {
        const ta = document.querySelector<HTMLTextAreaElement>("textarea");
        if (ta) {
          ta.focus();
          ta.setSelectionRange(ta.value.length, ta.value.length);
        }
      }, 50);
    },
    [setInput, userId, conversationId],
  );

  const cancelEdit = useCallback(() => {
    setEditingIndex(null);
    setEditingOriginal("");
    setInput("");
  }, [setInput]);

  return {
    editingIndex,
    setEditingIndex,
    editingOriginal,
    setEditingOriginal,
    handleEditUserMessageAt,
    cancelEdit,
  };
}

