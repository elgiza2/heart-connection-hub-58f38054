import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getCachedUser } from "@/lib/cachedUser";
import { getActiveWorkspaceId } from "@/lib/activeWorkspace";
import type { Location, NavigateFunction } from "react-router-dom";
import { MEGSY_MODEL } from "../chatConstants";
import type { Message } from "../chatConstants";

/**
 * Handles the three "entry-point" side effects fired once when ChatPage mounts:
 *   1. Sidebar navigation handoff (`location.state.loadConversationId`).
 *   2. Deep links (`?conv=…` and `?invite=…`).
 *   3. Seeding the welcome-demo conversation for brand-new users.
 *
 * Encapsulating this keeps the giant ChatPage focused on rendering & state and
 * makes the boot sequence easy to read.
 */
export function useChatEntryEffects(params: {
  conversationId: string | null;
  location: Location;
  navigate: NavigateFunction;
  loadConversation: (id: string) => void;
  setConversationId: (id: string) => void;
  setConversationTitle: (title: string) => void;
  setMessages: (messages: Message[]) => void;
}) {
  const {
    conversationId,
    location,
    navigate,
    loadConversation,
    setConversationId,
    setConversationTitle,
    setMessages,
  } = params;

  useEffect(() => {
    const stateCid = (location.state as any)?.loadConversationId as string | undefined;
    if (stateCid && stateCid !== conversationId) {
      loadConversation(stateCid);
      navigate(location.pathname, { replace: true, state: {} });
      return;
    }
    const params = new URLSearchParams(window.location.search);

    const convParam = params.get("conv");
    if (convParam && !conversationId) {
      // Keep `?conv=` in the URL so a reload restores the same conversation
      // and Back/Forward can move between them (see useChatUrlState).
      loadConversation(convParam);
      return;
    }

    const inviteToken = params.get("invite");
    if (inviteToken) {
      (async () => {
        const user = await getCachedUser();
        if (!user) {
          toast.error("Please sign in to accept invite");
          return;
        }
        const { data: invite } = await supabase
          .from("conversation_invites")
          .select("*")
          .eq("invite_token", inviteToken)
          .eq("status", "pending")
          .single();
        if (!invite) {
          toast.error("Invalid or expired invite");
          return;
        }
        await supabase.from("conversation_members").insert({
          conversation_id: (invite as any).conversation_id,
          user_id: user.id,
          role: "member",
        } as any);
        await supabase
          .from("conversation_invites")
          .update({ status: "accepted", accepted_by: user.id } as any)
          .eq("id", (invite as any).id);
        loadConversation((invite as any).conversation_id);
        window.history.replaceState({}, "", `/chat?conv=${(invite as any).conversation_id}`);
        toast.success("You joined the conversation!");
      })();
      return;
    }

    // Demo conversation on first visit — DB is source of truth (no localStorage)
    (async () => {
      const user = await getCachedUser();
      if (!user) return;
      const { count } = await supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      if (count && count > 0) return;

      const demoUserMsg = "Hey Megsy — what can you actually do?";
      const demoAssistantMsg = `Hey 👋 short version: think of me as a workspace, not a chatbot.

You can drop a file on me and ask questions about it, give me a topic and I'll go research it for real (real sources, not made up), describe an image or a short video and I'll generate it, or hand me a doc/spreadsheet/deck to build from scratch.

If you connect tools you already use — Slack, Notion, Telegram, Shopify, Drive — I can act inside them instead of just talking about them.

Nothing to set up. Just tell me what you're working on and we'll go from there.`;

      const workspaceId = getActiveWorkspaceId();
      const { data: conv } = await supabase
        .from("conversations")
        .insert({
          title: "Welcome to Megsy AI",
          mode: "chat",
          model: MEGSY_MODEL,
          user_id: user.id,
          ...(workspaceId ? { workspace_id: workspaceId } : {}),
        } as any)
        .select("id")
        .single();
      if (!conv) return;
      await supabase.from("messages").insert([
        { conversation_id: conv.id, role: "user", content: demoUserMsg },
        { conversation_id: conv.id, role: "assistant", content: demoAssistantMsg },
      ]);
      setConversationId(conv.id);
      setConversationTitle("Welcome to Megsy AI");
      setMessages([
        { role: "user", content: demoUserMsg },
        { role: "assistant", content: demoAssistantMsg },
      ]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
