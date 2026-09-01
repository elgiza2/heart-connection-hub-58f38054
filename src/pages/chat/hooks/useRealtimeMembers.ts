import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { SystemEvent } from "./useChatPresence";

type Member = {
  id: string;
  email: string;
  role: string;
  name?: string;
  avatar?: string;
};

/**
 * Subscribes to realtime INSERT/DELETE on `conversation_members` for the
 * active conversation, updating the member list and pushing system events
 * ("Aly joined", "Sam left"). If the local user is removed, the chat is
 * reset via `onSelfRemoved`.
 */
export function useRealtimeMembers(params: {
  conversationId: string | null;
  chatUserId: string | null;
  setMembers: React.Dispatch<React.SetStateAction<Member[]>>;
  setSystemEvents: React.Dispatch<React.SetStateAction<SystemEvent[]>>;
  onSelfRemoved: () => void;
}) {
  const { conversationId, chatUserId, setMembers, setSystemEvents, onSelfRemoved } = params;

  useEffect(() => {
    if (!conversationId) return;
    const enrichMember = async (userId: string, role: string): Promise<Member> => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", userId)
        .maybeSingle();
      return {
        id: userId,
        email: "",
        role,
        name: (prof as any)?.display_name || undefined,
        avatar: (prof as any)?.avatar_url || undefined,
      };
    };

    const channel = supabase
      .channel(`members-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_members",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const m = payload.new as any;
          const enriched = await enrichMember(m.user_id, m.role);
          setMembers((prev) => (prev.some((x) => x.id === m.user_id) ? prev : [...prev, enriched]));
          if (m.user_id !== chatUserId) {
            setSystemEvents((prev) => [
              ...prev,
              {
                id: `j-${m.user_id}-${Date.now()}`,
                text: `${enriched.name || "Someone"} joined the conversation`,
                at: Date.now(),
              },
            ]);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "conversation_members",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const old = payload.old as any;
          let leftName = "Someone";
          setMembers((prev) => {
            const found = prev.find((m) => m.id === old.user_id);
            if (found?.name) leftName = found.name;
            return prev.filter((m) => m.id !== old.user_id);
          });
          if (old.user_id === chatUserId) {
            toast.error("You were removed from this chat");
            onSelfRemoved();
          } else {
            setSystemEvents((prev) => [
              ...prev,
              {
                id: `l-${old.user_id}-${Date.now()}`,
                text: `${leftName} left the conversation`,
                at: Date.now(),
              },
            ]);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, chatUserId, setMembers, setSystemEvents, onSelfRemoved]);
}
