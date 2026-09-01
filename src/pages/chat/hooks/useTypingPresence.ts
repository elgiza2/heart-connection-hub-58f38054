import { useEffect, useRef, type MutableRefObject } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Broadcasts throttled "typing" / "stop_typing" presence events while the
 * user is composing a message. Lives in its own hook so the heavy
 * ChatPage component doesn't keep this effect inline.
 */
export function useTypingPresence(params: {
  input: string;
  chatUserId: string | null;
  userName: string;
  presenceChannelRef: MutableRefObject<RealtimeChannel | null>;
}) {
  const { input, chatUserId, userName, presenceChannelRef } = params;
  const lastTypingSentRef = useRef(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!presenceChannelRef.current || !chatUserId || !input.trim()) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 1500) return;
    lastTypingSentRef.current = now;
    presenceChannelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { user_id: chatUserId, name: userName, avatar: null },
    });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      presenceChannelRef.current?.send({
        type: "broadcast",
        event: "stop_typing",
        payload: { user_id: chatUserId },
      });
    }, 2000);
  }, [input, chatUserId, userName, presenceChannelRef]);

  useEffect(
    () => () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    },
    [],
  );

  return { lastTypingSentRef, typingTimeoutRef };
}
