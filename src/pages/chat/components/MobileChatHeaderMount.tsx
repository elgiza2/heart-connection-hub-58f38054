import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getCachedUser } from "@/lib/cachedUser";
import { pathForZone } from "@/lib/zoneRouting";
import MobileChatHeader from "@/components/chat/mobile/MobileChatHeader";
import ComposerModelMenu from "../ComposerModelMenu";
import type { ChatMode } from "../chatConstants";
import { MediaSettingsPanel } from "@/components/chat/mobile/MediaSettingsMenu";
import { MobileChatModelSettingsPanel } from "./MobileChatModelSettingsPanel";
import { MobileResearchDepthPanel } from "./MobileResearchDepthPanel";
import type { ResearchDepth } from "../hooks/useChatTier";

interface MobileChatHeaderMountProps {
  // Conversation meta
  conversationTitle: string;
  conversationId: string | null;
  hasConversation: boolean;
  isPinned: boolean;
  isDeleting: boolean;
  // Header actions
  setSidebarOpen: (v: boolean) => void;
  handleNewChat: () => void;
  handleShare: () => void;
  handleInvite: () => void;
  setRenameValue: (v: string) => void;
  performTogglePin: () => unknown | Promise<unknown>;
  confirmDelete: () => unknown | Promise<unknown>;
  // Composer model menu
  chatMode: ChatMode;
  tierMenuOpen: boolean;
  setTierMenuOpen: (v: boolean) => void;
  selectedModel: any;
  setSelectedModel: (m: any) => void;
  megsyTier: any;
  setMegsyTier: (t: any) => void;
  userPlan: string | null | undefined;
  mediaModel: any;
  setMediaModel: (m: any) => void;
  chatUserId: string | null;
  // Rename / invite / share
  renameValue: string;
  handleRename: () => unknown | Promise<unknown>;
  inviteEmail: string;
  setInviteEmail: (v: string) => void;
  inviteLink: string | null;
  setInviteLink: (v: string | null) => void;
  inviteLoading: boolean;
  handleSendInviteEmail: () => unknown | Promise<unknown>;
  handleCopyInviteLink: () => void;
  shareMode: "private" | "public";
  setShareMode: (m: "private" | "public") => void;
  generatedShareUrl: string | null;
  setGeneratedShareUrl: (v: string | null) => void;
  handleCreateShareLink: (m: "private" | "public") => unknown | Promise<unknown>;
  handleCopyShareLink: () => void;
  setChatMode: (mode: ChatMode) => void;
  setVideoDurationSec?: (duration: any) => void;
  researchDepth: ResearchDepth;
  setResearchDepth: (d: ResearchDepth) => void;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
}


export function MobileChatHeaderMount(props: MobileChatHeaderMountProps) {
  const location = useLocation();
  const {
    conversationTitle,
    conversationId,
    hasConversation,
    isPinned,
    isDeleting,
    setSidebarOpen,
    handleNewChat,
    handleShare,
    handleInvite,
    setRenameValue,
    performTogglePin,
    confirmDelete,
    chatMode,
    tierMenuOpen,
    setTierMenuOpen,
    selectedModel,
    setSelectedModel,
    megsyTier,
    setMegsyTier,
    userPlan,
    mediaModel,
    setMediaModel,
    chatUserId,
    renameValue,
    handleRename,
    inviteEmail,
    setInviteEmail,
    inviteLink,
    setInviteLink,
    inviteLoading,
    handleSendInviteEmail,
    handleCopyInviteLink,
    shareMode,
    setShareMode,
    generatedShareUrl,
    setGeneratedShareUrl,
    handleCreateShareLink,
    handleCopyShareLink,
    scrollContainerRef,
  } = props;


  // Only mount the model menu on mobile viewports. On desktop the same
  // ComposerModelMenu is rendered inside the composer (ComposerInlineSlot),
  // and sharing `tierMenuOpen` state used to open two Radix dropdowns at once.
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)").matches : true,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 767px)");
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return (
    <MobileChatHeader
      title={conversationTitle}
      hasConversation={hasConversation}
      isPinned={isPinned}
      onOpenSidebar={() => setSidebarOpen(true)}
      onNewChat={handleNewChat}
      onShare={handleShare}
      onInvite={handleInvite}
      onRename={() => setRenameValue(conversationTitle)}
      onTogglePin={performTogglePin as any}
      onDelete={confirmDelete as any}
      isDeleting={isDeleting}
      chatUserId={chatUserId}
      scrollContainerRef={scrollContainerRef}
      modelSlot={

        !isMobile ? null : (
          <ComposerModelMenu
            mode={chatMode}
            open={tierMenuOpen}
            onOpenChange={setTierMenuOpen}
            side="bottom"
            align="start"
            noIcon
            selectedModel={selectedModel}

            megsyTier={megsyTier}
            userPlan={userPlan as any}
            mediaModel={mediaModel}
            settingsLabel={chatMode === "images" ? "Image settings" : chatMode === "video" ? "Video settings" : "Model settings"}
            settingsPanel={
              chatMode === "images" || chatMode === "video" ? (
                <MediaSettingsPanel
                  mode={chatMode}
                  onChange={(settings) => {
                    if (settings.duration !== undefined) props.setVideoDurationSec?.(settings.duration);
                  }}
                />
              ) : chatMode === "deep-research" ? (
                <MobileResearchDepthPanel
                  researchDepth={props.researchDepth}
                  setResearchDepth={props.setResearchDepth}
                  userPlan={userPlan}
                  onSelect={() => setTierMenuOpen(false)}
                />
              ) : (
                <MobileChatModelSettingsPanel activeModelId={selectedModel?.id ?? "lite"} />
              )
            }
            onTierSelect={(tier) => {
              setSelectedModel(null);
              setMegsyTier(tier);
              if (chatUserId) {
                void supabase
                  .from("ai_personalization")
                  .upsert({ user_id: chatUserId, preferred_tier: tier } as any, {
                    onConflict: "user_id",
                  });
              }
            }}
            onChatModelSelect={(model) =>
              setSelectedModel({ id: model.id, label: model.label, cost: 0 })
            }
            onMediaModelSelect={setMediaModel}
            onModeChange={props.setChatMode}
          />
        )
      }
      inlineRename={{
        value: renameValue,
        onChange: setRenameValue,
        onSave: () => {
          void handleRename();
        },
      }}
      inlineInvite={{
        email: inviteEmail,
        onEmailChange: setInviteEmail,
        onSend: () => {
          void handleSendInviteEmail();
        },
        loading: inviteLoading,
        link: inviteLink,
        onCopyLink: handleCopyInviteLink,
        onOpen: async () => {
          if (!conversationId) {
            toast.error("Start a conversation first");
            return;
          }
          setInviteLink(null);
          setInviteEmail("");
          const user = await getCachedUser();
          if (!user) return;
          const { data, error } = await supabase
            .from("conversation_invites")
            .insert({ conversation_id: conversationId, invited_by: user.id } as any)
            .select("invite_token")
            .single();
          if (!error && data)
            setInviteLink(
              `${window.location.origin}${pathForZone(`/invite/${(data as any).invite_token}`, location.pathname)}`,
            );
        },
      }}
      inlineShare={{
        mode: shareMode,
        onModeChange: (m) => {
          setShareMode(m);
          if (m === "public" && !generatedShareUrl) void handleCreateShareLink("public");
          if (m === "private") setGeneratedShareUrl(null);
        },
        url: generatedShareUrl,
        onCopyLink: handleCopyShareLink,
        onOpen: () => {
          if (conversationId && !generatedShareUrl) void handleCreateShareLink("public");
        },
      }}
      rightSlot={null}
    />
  );
}
