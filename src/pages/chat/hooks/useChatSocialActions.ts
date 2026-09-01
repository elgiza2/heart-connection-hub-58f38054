import { useCallback } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getCachedUser } from "@/lib/cachedUser";
import { pathForZone } from "@/lib/zoneRouting";

type Member = {
  id: string;
  email: string;
  role: string;
  name?: string;
  avatar?: string;
};

/**
 * Bundles the share / rename / pin / invite handlers. None of these touch
 * the message transcript, so isolating them keeps ChatPage focused on chat.
 */
export function useChatSocialActions(params: {
  conversationId: string | null;
  // share
  shareMode: "private" | "public" | null;
  shareId: string | null;
  isShared: boolean;
  generatedShareUrl: string | null;
  setShareDialogOpen: (open: boolean) => void;
  setIsShared: (next: boolean) => void;
  setShareId: (next: string) => void;
  setGeneratedShareUrl: (next: string | null) => void;
  // rename
  renameValue: string;
  setConversationTitle: (next: string) => void;
  setIsRenaming: (next: boolean) => void;
  // pin
  isPinned: boolean;
  setIsPinned: (next: boolean) => void;
  // invite
  inviteEmail: string;
  inviteLink: string | null;
  setInviteDialogOpen: (open: boolean) => void;
  setInviteLink: (next: string | null) => void;
  setInviteEmail: (next: string) => void;
  setInviteLoading: (next: boolean) => void;
  setMembers: (next: Member[]) => void;
}) {
  const location = useLocation();
  const appUrl = useCallback(
    (path: string) => `${window.location.origin}${pathForZone(path, location.pathname)}`,
    [location.pathname],
  );
  const {
    conversationId,
    shareMode,
    shareId,
    isShared,
    generatedShareUrl,
    setShareDialogOpen,
    setIsShared,
    setShareId,
    setGeneratedShareUrl,
    renameValue,
    setConversationTitle,
    setIsRenaming,
    isPinned,
    setIsPinned,
    inviteEmail,
    inviteLink,
    setInviteDialogOpen,
    setInviteLink,
    setInviteEmail,
    setInviteLoading,
    setMembers,
  } = params;

  const handleCreateShareLink = useCallback(
    async (modeOverride?: "private" | "public") => {
      if (!conversationId) {
        toast.error("Send a message first, then share the chat.");
        setShareDialogOpen(false);
        return;
      }
      const mode = modeOverride ?? shareMode;
      if (mode === "public") {
        const newShareId = shareId || Math.random().toString(36).substring(2, 10);
        const { error } = await supabase
          .from("conversations")
          .update({ is_shared: true, share_id: newShareId } as any)
          .eq("id", conversationId);
        if (error) {
          toast.error("Failed to share");
          return;
        }
        setIsShared(true);
        setShareId(newShareId);
        setGeneratedShareUrl(appUrl(`/share/${newShareId}`));
      } else {
        await supabase
          .from("conversations")
          .update({ is_shared: false } as any)
          .eq("id", conversationId);
        setIsShared(false);
        setGeneratedShareUrl(null);
        toast.success("Chat set to private");
        setShareDialogOpen(false);
      }
    },
    [
      conversationId,
      shareMode,
      shareId,
      setShareDialogOpen,
      setIsShared,
      setShareId,
      setGeneratedShareUrl,
      appUrl,
    ],
  );

  const handleShare = useCallback(async () => {
    setShareDialogOpen(true);
    if (conversationId && !generatedShareUrl) {
      const mode = isShared ? "public" : (shareMode ?? "public");
      if (mode === "public") {
        setTimeout(() => {
          void handleCreateShareLink("public");
        }, 0);
      }
    }
  }, [
    conversationId,
    generatedShareUrl,
    isShared,
    shareMode,
    setShareDialogOpen,
    handleCreateShareLink,
  ]);

  const handleCopyShareLink = useCallback(async () => {
    if (generatedShareUrl) {
      await navigator.clipboard.writeText(generatedShareUrl);
      toast.success("Link copied!");
    }
  }, [generatedShareUrl]);

  const handleRename = useCallback(async () => {
    if (!conversationId || !renameValue.trim()) return;
    await supabase
      .from("conversations")
      .update({ title: renameValue.trim() })
      .eq("id", conversationId);
    setConversationTitle(renameValue.trim());
    setIsRenaming(false);
    toast.success("Renamed");
  }, [conversationId, renameValue, setConversationTitle, setIsRenaming]);

  const performTogglePin = useCallback(async () => {
    if (!conversationId) return false;
    const nextPinned = !isPinned;
    const payload = nextPinned
      ? { is_pinned: true, pinned_at: new Date().toISOString() }
      : { is_pinned: false, pinned_at: null };
    const { error } = await supabase
      .from("conversations")
      .update(payload as any)
      .eq("id", conversationId);
    if (error) return false;
    setIsPinned(nextPinned);
    return true;
  }, [conversationId, isPinned, setIsPinned]);

  const handleTogglePin = useCallback(() => {
    void performTogglePin();
  }, [performTogglePin]);

  const handleInvite = useCallback(async () => {
    if (!conversationId) {
      toast.error("Start a conversation first");
      return;
    }
    setInviteDialogOpen(true);
    setInviteLink(null);
    setInviteEmail("");
    const { data: memberRows } = await supabase
      .from("conversation_members")
      .select("user_id, role")
      .eq("conversation_id", conversationId);
    if (memberRows && memberRows.length > 0) {
      const ids = memberRows.map((m: any) => m.user_id);
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", ids);
      const profMap: Record<string, any> = {};
      (profs || []).forEach((p: any) => {
        profMap[p.id] = p;
      });
      setMembers(
        memberRows.map((m: any) => ({
          id: m.user_id,
          email: "",
          role: m.role,
          name: profMap[m.user_id]?.display_name,
          avatar: profMap[m.user_id]?.avatar_url,
        })),
      );
    } else {
      setMembers([]);
    }
    const user = await getCachedUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("conversation_invites")
      .insert({ conversation_id: conversationId, invited_by: user.id } as any)
      .select("invite_token")
      .single();
    if (!error && data) {
      setInviteLink(appUrl(`/invite/${(data as any).invite_token}`));
    }
  }, [conversationId, setInviteDialogOpen, setInviteLink, setInviteEmail, setMembers, appUrl]);

  const handleSendInviteEmail = useCallback(async () => {
    if (!conversationId || !inviteEmail.trim()) return;
    setInviteLoading(true);
    const user = await getCachedUser();
    if (!user) {
      setInviteLoading(false);
      return;
    }
    let link = inviteLink;
    if (!link) {
      const { data, error } = await supabase
        .from("conversation_invites")
        .insert({
          conversation_id: conversationId,
          invited_by: user.id,
          invite_email: inviteEmail.trim().toLowerCase(),
        } as any)
        .select("invite_token")
        .single();
      if (error) {
        toast.error("Failed to create invite");
        setInviteLoading(false);
        return;
      }
      link = appUrl(`/invite/${(data as any).invite_token}`);
      setInviteLink(link);
    }

    try {
      const { error: emailError } = await supabase.functions.invoke("send-email", {
        body: {
          to: inviteEmail.trim().toLowerCase(),
          template: "invite",
          user_id: user.id,
          type: "system",
          variables: {
            name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Someone",
            invite_link: link,
            app_url: `${window.location.origin}${pathForZone("/", location.pathname)}`,
          },
        },
      });
      if (emailError) throw emailError;
      toast.success(`Invite sent to ${inviteEmail.trim()}`);
      setInviteEmail("");
    } catch {
      toast.error("Couldn't send the email — link is ready to share");
    }

    setInviteLoading(false);
  }, [conversationId, inviteEmail, inviteLink, setInviteEmail, setInviteLink, setInviteLoading, appUrl, location.pathname]);

  const handleGenerateInviteLink = useCallback(async () => {
    if (!conversationId) return;
    setInviteLoading(true);
    const user = await getCachedUser();
    if (!user) {
      setInviteLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("conversation_invites")
      .insert({ conversation_id: conversationId, invited_by: user.id } as any)
      .select("invite_token")
      .single();
    if (error) {
      toast.error("Failed to create invite link");
      setInviteLoading(false);
      return;
    }
    setInviteLink(appUrl(`/invite/${(data as any).invite_token}`));
    setInviteLoading(false);
  }, [conversationId, setInviteLink, setInviteLoading, appUrl]);

  const handleCopyInviteLink = useCallback(async () => {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      toast.success("Invite link copied!");
    }
  }, [inviteLink]);

  return {
    handleShare,
    handleCreateShareLink,
    handleCopyShareLink,
    handleRename,
    handleTogglePin,
    performTogglePin,
    handleInvite,
    handleSendInviteEmail,
    handleGenerateInviteLink,
    handleCopyInviteLink,
  };
}
