import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TypingUser = {
  id: string;
  name: string;
  avatar: string | null;
};

export type SystemEvent = { id: string; text: string; at: number };

/**
 * Encapsulates state for chat presence: typing indicators, online users,
 * system events, unread counts, and the presence channel ref. Extracted
 * from ChatPage to reduce re-render surface.
 */
export function useChatPresence() {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [remoteAiBusy, setRemoteAiBusy] = useState<{ name: string } | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [newMessagesCount, setNewMessagesCount] = useState(0);

  const originalTitleRef = useRef<string>("");
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const markedReadRef = useRef<Set<string>>(new Set());

  return {
    typingUsers,
    setTypingUsers,
    remoteAiBusy,
    setRemoteAiBusy,
    onlineUsers,
    setOnlineUsers,
    systemEvents,
    setSystemEvents,
    unreadCount,
    setUnreadCount,
    newMessagesCount,
    setNewMessagesCount,
    originalTitleRef,
    presenceChannelRef,
    markedReadRef,
  };
}
