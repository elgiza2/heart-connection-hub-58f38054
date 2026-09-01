/**
 * Fire-and-forget logger for chat interaction events (regenerate, edit, stop,
 * branch, feedback, tool_denied, ...). Rows land in `chat_interaction_events`
 * so we can measure friction and improve UX. Never blocks the UI.
 */
import { supabase } from "@/integrations/supabase/client";

export type ChatInteractionEvent =
  | "regenerate"
  | "edit_user_message"
  | "stop"
  | "branch"
  | "feedback_like"
  | "feedback_dislike"
  | "tool_approved"
  | "tool_denied"
  | "model_switch"
  | "copy_message";

export function trackChatInteraction(
  event: ChatInteractionEvent,
  opts: {
    userId?: string | null;
    conversationId?: string | null;
    messageId?: string | null;
    metadata?: Record<string, unknown>;
  } = {},
): void {
  const { userId, conversationId, messageId, metadata } = opts;
  if (!userId) return;
  void supabase
    .from("chat_interaction_events")
    .insert({
      user_id: userId,
      conversation_id: conversationId ?? null,
      message_id: messageId ?? null,
      event_type: event,
      metadata: (metadata ?? {}) as never,
    })
    .then(() => undefined, () => undefined);
}
