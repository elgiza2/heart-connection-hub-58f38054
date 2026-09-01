import { useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Args {
  conversationId: string | null;
  setIsDeleting: (v: boolean) => void;
  onDeleted: () => void;
}

/**
 * Confirm-delete handler for the current conversation. Removes both
 * messages and the conversation row, surfaces toasts on failure, and
 * resets the chat to a fresh state via the supplied callback.
 */
export function useDeleteConversation({ conversationId, setIsDeleting, onDeleted }: Args) {
  return useCallback(async () => {
    if (!conversationId) return;
    setIsDeleting(true);
    const { error: msgErr } = await supabase
      .from("messages")
      .delete()
      .eq("conversation_id", conversationId);
    const { error: convErr } = await supabase
      .from("conversations")
      .delete()
      .eq("id", conversationId);
    setIsDeleting(false);
    if (msgErr || convErr) {
      toast.error("Failed to delete");
      return;
    }
    toast.success("Chat deleted");
    onDeleted();
  }, [conversationId, setIsDeleting, onDeleted]);
}
