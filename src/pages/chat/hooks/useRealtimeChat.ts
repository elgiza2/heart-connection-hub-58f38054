import { useEffect, type MutableRefObject } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Message } from "../chatConstants";
import type { TypingUser } from "./useChatPresence";

/**
 * Wires the chat to Supabase realtime for the active conversation:
 *
 *  - Subscribes to new `messages` rows, merging server-authored ids onto
 *    local pending entries (avoids duplicate cards) and choosing between
 *    auto-scroll, "new messages" badge, and unread-tab notification.
 *  - Joins the presence channel and forwards `typing` / `stop_typing` /
 *    `ai_busy` broadcasts to the UI hooks, plus presence sync into the
 *    online-users set. The live `RealtimeChannel` is parked on
 *    `presenceChannelRef` so other places (typing throttler, send) can
 *    broadcast.
 */
export function useRealtimeChat(params: {
  conversationId: string | null;
  chatUserId: string | null;
  messagesContainerRef: MutableRefObject<HTMLDivElement | null>;
  ownInsertedIdsRef: MutableRefObject<Set<string>>;
  presenceChannelRef: MutableRefObject<RealtimeChannel | null>;
  scrollToBottom: () => void;
  playNotificationSound: () => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setNewMessagesCount: React.Dispatch<React.SetStateAction<number>>;
  setUnreadCount: React.Dispatch<React.SetStateAction<number>>;
  setTypingUsers: React.Dispatch<React.SetStateAction<TypingUser[]>>;
  setRemoteAiBusy: (next: { name: string } | null) => void;
  setOnlineUsers: (next: Set<string>) => void;
}) {
  const {
    conversationId,
    chatUserId,
    messagesContainerRef,
    ownInsertedIdsRef,
    presenceChannelRef,
    scrollToBottom,
    playNotificationSound,
    setMessages,
    setNewMessagesCount,
    setUnreadCount,
    setTypingUsers,
    setRemoteAiBusy,
    setOnlineUsers,
  } = params;

  useEffect(() => {
    if (!conversationId || !chatUserId) return;

    const msgChannel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newMsg = payload.new as any;
          if (newMsg.id && ownInsertedIdsRef.current.has(newMsg.id)) return;

          let senderName: string | null = null;
          let senderAvatar: string | null = null;
          if (newMsg.user_id) {
            const { data: prof } = await supabase
              .from("profiles")
              .select("display_name, avatar_url")
              .eq("id", newMsg.user_id)
              .maybeSingle();
            senderName = (prof as any)?.display_name || null;
            senderAvatar = (prof as any)?.avatar_url || null;
          }

          setMessages((prev) => {
            if (newMsg.id && prev.some((m) => m.id === newMsg.id)) return prev;
            const isAssistantEcho = !newMsg.user_id && newMsg.role === "assistant";
            const isOwnUserEcho = newMsg.user_id && newMsg.user_id === chatUserId;
            const localPendingIndex =
              isOwnUserEcho || isAssistantEcho
                ? prev.findIndex(
                    (m) => !m.id && m.role === newMsg.role && m.content === newMsg.content,
                  )
                : -1;
            if (localPendingIndex >= 0) {
              const next = prev.slice();
              next[localPendingIndex] = {
                ...next[localPendingIndex],
                images: newMsg.images || next[localPendingIndex].images,
                id: newMsg.id,
                user_id: newMsg.user_id,
                senderName,
                senderAvatar,
              };
              return next;
            }
            return [
              ...prev,
              {
                role: newMsg.role,
                content: newMsg.content,
                images: newMsg.images || undefined,
                id: newMsg.id,
                user_id: newMsg.user_id,
                senderName,
                senderAvatar,
              },
            ];
          });

          const el = messagesContainerRef.current;
          const nearBottom = el ? el.scrollHeight - el.scrollTop - el.clientHeight < 200 : true;
          if (nearBottom) {
            setTimeout(() => scrollToBottom(), 100);
          } else if (newMsg.user_id !== chatUserId) {
            setNewMessagesCount((c) => c + 1);
          }
          if (newMsg.user_id && newMsg.user_id !== chatUserId) {
            if (typeof document !== "undefined" && document.hidden) {
              setUnreadCount((c) => c + 1);
              playNotificationSound();
            } else if (!nearBottom) {
              playNotificationSound();
            }
          }
        },
      )
      .subscribe();

    const presence = supabase.channel(`presence-${conversationId}`, {
      config: { broadcast: { self: false }, presence: { key: chatUserId } },
    });
    presence
      .on("broadcast", { event: "typing" }, ({ payload }: any) => {
        if (!payload?.user_id || payload.user_id === chatUserId) return;
        setTypingUsers((prev) => {
          const next = prev.filter((u) => u.id !== payload.user_id);
          return [
            ...next,
            {
              id: payload.user_id,
              name: payload.name || "Someone",
              avatar: payload.avatar || null,
            },
          ];
        });
        setTimeout(() => {
          setTypingUsers((prev) => prev.filter((u) => u.id !== payload.user_id));
        }, 3500);
      })
      .on("broadcast", { event: "stop_typing" }, ({ payload }: any) => {
        setTypingUsers((prev) => prev.filter((u) => u.id !== payload?.user_id));
      })
      .on("broadcast", { event: "ai_busy" }, ({ payload }: any) => {
        if (!payload || payload.user_id === chatUserId) return;
        setRemoteAiBusy(payload.busy ? { name: payload.name || "Someone" } : null);
      })
      .on("presence", { event: "sync" }, () => {
        const state = presence.presenceState() as Record<string, any>;
        setOnlineUsers(new Set(Object.keys(state)));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presence.track({
            user_id: chatUserId,
            online_at: new Date().toISOString(),
          });
        }
      });
    presenceChannelRef.current = presence;

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(presence);
      presenceChannelRef.current = null;
      setOnlineUsers(new Set());
    };
  }, [conversationId, chatUserId]); // eslint-disable-line react-hooks/exhaustive-deps
}
