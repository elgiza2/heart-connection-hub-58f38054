import { supabase } from "@/integrations/supabase/client";

export interface MemberRow {
  id: string;
  email: string;
  role: string;
  name?: string;
  avatar?: string;
}

/**
 * Fetches the conversation_members rows + their profile names/avatars in
 * two queries (members, then profiles by id list) and returns the merged
 * shape consumed by the members sidebar. Returns [] when there are none.
 */
export async function loadConversationMembers(conversationId: string): Promise<MemberRow[]> {
  const { data: memberRows } = await supabase
    .from("conversation_members")
    .select("user_id, role")
    .eq("conversation_id", conversationId);

  if (!memberRows || memberRows.length === 0) return [];

  const ids = memberRows.map((m: any) => m.user_id);
  const { data: profs } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", ids);

  const profMap: Record<string, any> = {};
  (profs || []).forEach((p: any) => {
    profMap[p.id] = p;
  });

  return memberRows.map((m: any) => ({
    id: m.user_id,
    email: "",
    role: m.role,
    name: profMap[m.user_id]?.display_name,
    avatar: profMap[m.user_id]?.avatar_url,
  }));
}
