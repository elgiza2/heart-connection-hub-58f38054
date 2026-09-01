import { supabase } from "@/integrations/supabase/client";

/**
 * Branch (fork) a conversation at a given message index.
 * Creates a new conversation owned by the current user and copies messages
 * [0..upToIndex] (inclusive) from the source conversation. Returns the new
 * conversation id.
 */
export async function branchConversation(
  sourceConversationId: string,
  upToIndex: number,
): Promise<string | null> {
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) return null;

  const { data: src } = await supabase
    .from("conversations")
    .select("title, mode, model, workspace_id")
    .eq("id", sourceConversationId)
    .maybeSingle();

  const baseTitle = (src?.title as string | undefined) || "New Chat";
  const branchTitle =
    baseTitle.length > 40 ? baseTitle.slice(0, 40) + "… (branch)" : baseTitle + " (branch)";

  const { data: newConv, error: insertErr } = await supabase
    .from("conversations")
    .insert({
      title: branchTitle,
      mode: (src?.mode as string) || null,
      model: (src?.model as string) || null,
      user_id: user.id,
      ...(src?.workspace_id ? { workspace_id: src.workspace_id } : {}),
    } as any)
    .select("id")
    .single();

  if (insertErr || !newConv) return null;

  const { data: msgs } = await supabase
    .from("messages")
    .select("role, content, images, metadata, created_at")
    .eq("conversation_id", sourceConversationId)
    .order("created_at", { ascending: true })
    .limit(1000);

  const toCopy = (msgs || []).slice(0, upToIndex + 1);
  if (toCopy.length > 0) {
    const rows = toCopy.map((m: any) => ({
      conversation_id: newConv.id,
      role: m.role,
      content: m.content,
      images: m.images ?? null,
      metadata: m.metadata ?? null,
      user_id: user.id,
    }));
    await supabase.from("messages").insert(rows as any);
  }

  return newConv.id as string;
}
