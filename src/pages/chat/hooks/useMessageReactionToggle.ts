import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Reactor } from "./useChatReactions";

type Setter<T> = (updater: (prev: T) => T) => void;

interface Args {
  conversationId: string | null;
  chatUserId: string | null;
  messageReactions: Record<string, Reactor[]>;
  setMessageReactions: Setter<Record<string, Reactor[]>>;
  setReactionPickerFor: (v: string | null) => void;
}

/**
 * Toggle (add/remove) an emoji reaction for the current user on a message.
 * Optimistic — applies UI changes immediately and rolls back on error.
 * Extracted from ChatPage to keep the giant component lighter.
 */
export function useMessageReactionToggle({
  conversationId,
  chatUserId,
  messageReactions,
  setMessageReactions,
  setReactionPickerFor,
}: Args) {
  return useCallback(
    async (messageId: string, emoji: string) => {
      if (!conversationId || !chatUserId) return;
      const existing = (messageReactions[messageId] || []).find(
        (r) => r.user_id === chatUserId && r.emoji === emoji,
      );
      if (existing) {
        setMessageReactions((prev) => ({
          ...prev,
          [messageId]: (prev[messageId] || []).filter((r) => r.id !== existing.id),
        }));
        await supabase
          .from("message_reactions" as any)
          .delete()
          .eq("id", existing.id);
      } else {
        const tempId = `tmp-${Date.now()}`;
        setMessageReactions((prev) => ({
          ...prev,
          [messageId]: [...(prev[messageId] || []), { id: tempId, emoji, user_id: chatUserId }],
        }));
        const { data, error } = await supabase
          .from("message_reactions" as any)
          .insert({
            message_id: messageId,
            user_id: chatUserId,
            conversation_id: conversationId,
            emoji,
          })
          .select("id")
          .single();
        if (error) {
          setMessageReactions((prev) => ({
            ...prev,
            [messageId]: (prev[messageId] || []).filter((r) => r.id !== tempId),
          }));
        } else if (data) {
          setMessageReactions((prev) => ({
            ...prev,
            [messageId]: (prev[messageId] || []).map((r) =>
              r.id === tempId ? { ...r, id: (data as any).id } : r,
            ),
          }));
        }
      }
      setReactionPickerFor(null);
    },
    [conversationId, chatUserId, messageReactions, setMessageReactions, setReactionPickerFor],
  );
}
