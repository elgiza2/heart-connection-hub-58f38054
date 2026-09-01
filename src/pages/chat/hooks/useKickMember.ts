import { useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface MemberLike {
  id: string;
  name?: string;
}

interface Args<M extends MemberLike> {
  conversationId: string | null;
  members: M[];
  setMembers: React.Dispatch<React.SetStateAction<M[]>>;
}

/**
 * Returns a kick-member handler that confirms via a non-blocking toast
 * (rather than window.confirm) and removes the member from the
 * conversation_members table. Used by group chats.
 */
export function useKickMember<M extends MemberLike>({
  conversationId,
  members,
  setMembers,
}: Args<M>) {
  return useCallback(
    async (memberId: string) => {
      if (!conversationId) return;
      const member = members.find((m) => m.id === memberId);
      const label = member?.name
        ? `Remove ${member.name} from this chat?`
        : "Remove this member from the chat?";
      toast(label, {
        action: {
          label: "Remove",
          onClick: async () => {
            const { error } = await supabase
              .from("conversation_members")
              .delete()
              .eq("conversation_id", conversationId)
              .eq("user_id", memberId);
            if (error) {
              toast.error("Couldn't remove them — try again");
              return;
            }
            setMembers((prev) => prev.filter((m) => m.id !== memberId));
            toast.success("Member removed");
          },
        },
        cancel: { label: "Keep", onClick: () => {} },
      });
    },
    [conversationId, members, setMembers],
  );
}
