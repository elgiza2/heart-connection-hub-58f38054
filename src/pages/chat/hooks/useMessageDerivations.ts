import { useMemo } from "react";
import type { Message } from "../chatConstants";

interface MemberLike {
  id: string;
  name?: string;
  avatar?: string;
}

interface Args<M extends MemberLike> {
  members: M[];
  chatUserId: string | null;
  userName: string;
  messages: Message[];
  messageReads: Record<string, { user_id: string }[]>;
}

/**
 * Memoized derivations used by the message list:
 *  - memberMap        — id → { name, avatar } lookup, including self
 *  - readersByMessageId — visible read receipts (excludes self) per message
 *  - lastAssistantIdx — index of last assistant message (-1 if none)
 *  - showReadersIdx   — index where read avatars should render
 *  - hasMembers       — quick boolean
 *
 * Extracted from ChatPage so typing in the composer (which mutates only
 * `input`) doesn't recompute these per row.
 */
export function useMessageDerivations<M extends MemberLike>({
  members,
  chatUserId,
  userName,
  messages,
  messageReads,
}: Args<M>) {
  const memberMap = useMemo(() => {
    const m: Record<string, { name?: string; avatar?: string }> = {};
    members.forEach((mb) => {
      m[mb.id] = { name: mb.name, avatar: mb.avatar };
    });
    if (chatUserId) m[chatUserId] = { name: userName || "You", avatar: undefined };
    return m;
  }, [members, chatUserId, userName]);

  const readersByMessageId = useMemo(() => {
    const result: Record<string, { user_id: string; name?: string; avatar?: string }[]> = {};
    Object.entries(messageReads).forEach(([messageId, readers]) => {
      const visibleReaders = readers
        .filter((r) => r.user_id !== chatUserId)
        .map((r) => ({
          user_id: r.user_id,
          name: memberMap[r.user_id]?.name,
          avatar: memberMap[r.user_id]?.avatar,
        }));
      if (visibleReaders.length > 0) result[messageId] = visibleReaders;
    });
    return result;
  }, [messageReads, chatUserId, memberMap]);

  const lastMessageIdx = messages.length - 1;

  const lastAssistantIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return i;
    }
    return -1;
  }, [messages]);

  const showReadersIdx = useMemo(() => {
    const last = messages[messages.length - 1];
    if (!last) return -1;
    return messages.length - 1 - (last.role === "assistant" ? 1 : 0);
  }, [messages]);

  const hasMembers = members.length > 0;

  return {
    memberMap,
    readersByMessageId,
    lastMessageIdx,
    lastAssistantIdx,
    showReadersIdx,
    hasMembers,
  };
}
