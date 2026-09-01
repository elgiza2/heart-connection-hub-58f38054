import { useEffect, type MutableRefObject } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Message } from "../chatConstants";

export type ReadRecord = { user_id: string; name?: string; avatar?: string };
export type ReactionRecord = { id: string; emoji: string; user_id: string };

/**
 * Loads the read-receipts + emoji-reactions for the active conversation,
 * subscribes to realtime INSERTs/DELETEs to keep them in sync, and writes
 * read-receipts for any visible messages the local user hasn't acked yet.
 *
 * Pulled out of ChatPage so the giant component doesn't carry ~120 lines
 * of realtime plumbing inline.
 */
export function useReadsAndReactions(params: {
  conversationId: string | null;
  chatUserId: string | null;
  messages: Message[];
  markedReadRef: MutableRefObject<Set<string>>;
  setMessageReads: React.Dispatch<React.SetStateAction<Record<string, ReadRecord[]>>>;
  setMessageReactions: React.Dispatch<React.SetStateAction<Record<string, ReactionRecord[]>>>;
}) {
  const {
    conversationId,
    chatUserId,
    messages,
    markedReadRef,
    setMessageReads,
    setMessageReactions,
  } = params;

  useEffect(() => {
    if (!conversationId || !chatUserId) return;
    let cancelled = false;
    (async () => {
      const [{ data: reads }, { data: reactions }] = await Promise.all([
        supabase
          .from("message_reads" as any)
          .select("message_id, user_id")
          .eq("conversation_id", conversationId),
        supabase
          .from("message_reactions" as any)
          .select("id, message_id, user_id, emoji")
          .eq("conversation_id", conversationId),
      ]);
      if (cancelled) return;
      const readsMap: Record<string, ReadRecord[]> = {};
      (reads || []).forEach((r: any) => {
        (readsMap[r.message_id] ||= []).push({ user_id: r.user_id });
      });
      setMessageReads(readsMap);
      const reactMap: Record<string, ReactionRecord[]> = {};
      (reactions || []).forEach((r: any) => {
        (reactMap[r.message_id] ||= []).push({
          id: r.id,
          emoji: r.emoji,
          user_id: r.user_id,
        });
      });
      setMessageReactions(reactMap);
    })();

    const ch = supabase
      .channel(`reads-reactions-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_reads",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const r = payload.new as any;
          setMessageReads((prev) => {
            const list = prev[r.message_id] || [];
            if (list.some((x) => x.user_id === r.user_id)) return prev;
            return { ...prev, [r.message_id]: [...list, { user_id: r.user_id }] };
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_reactions",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const r = payload.new as any;
          setMessageReactions((prev) => {
            const list = prev[r.message_id] || [];
            if (list.some((x) => x.id === r.id)) return prev;
            return {
              ...prev,
              [r.message_id]: [...list, { id: r.id, emoji: r.emoji, user_id: r.user_id }],
            };
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "message_reactions",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const old = payload.old as any;
          setMessageReactions((prev) => {
            const list = prev[old.message_id] || [];
            return { ...prev, [old.message_id]: list.filter((x) => x.id !== old.id) };
          });
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
      markedReadRef.current.clear();
    };
  }, [conversationId, chatUserId, markedReadRef, setMessageReads, setMessageReactions]);

  // Mark visible messages as read.
  useEffect(() => {
    if (!conversationId || !chatUserId || messages.length === 0) return;
    if (typeof document !== "undefined" && document.hidden) return;
    const toMark = messages
      .filter((m) => m.id && m.user_id !== chatUserId && !markedReadRef.current.has(m.id))
      .map((m) => m.id!);
    if (toMark.length === 0) return;
    toMark.forEach((id) => markedReadRef.current.add(id));
    const t = setTimeout(() => {
      supabase
        .from("message_reads" as any)
        .insert(
          toMark.map((mid) => ({
            message_id: mid,
            user_id: chatUserId,
            conversation_id: conversationId,
          })),
        )
        .then(({ error }: any) => {
          if (error) toMark.forEach((id) => markedReadRef.current.delete(id));
        });
    }, 500);
    return () => clearTimeout(t);
  }, [messages, conversationId, chatUserId, markedReadRef]);
}
