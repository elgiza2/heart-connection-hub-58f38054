import { MobileSidebarButton } from "@/components/shared/MobileSidebarButton";
import { ChatOptionsDropdown } from "./ChatOptionsDropdown";
import { prefetchRoute } from "@/hooks/usePrefetchRoute";
import ComposerModelMenu from "../ComposerModelMenu";
import { MediaSettingsPanel } from "@/components/chat/mobile/MediaSettingsMenu";
import { ChatModelSettingsPanel } from "./ChatModelSettingsPanel";
import { supabase } from "@/integrations/supabase/client";
import { t as uiT, useUserLang } from "@/lib/authI18n";
import { UpgradePlanButton } from "@/components/billing/UpgradePlanButton";
import { useCredits } from "@/hooks/useCredits";

interface DesktopChatHeaderProps {
  chatMode: "normal" | "learning" | "shopping" | "images" | "video" | "slides" | "slides-images" | "deep-research" | "operator" | "code";
  hasConversation: boolean;
  userPlan: string | null;
  navigate: (path: string) => void;
  setSidebarOpen: (open: boolean) => void;
  conversationId: string | null;
  conversationTitle: string;
  isPinned: boolean;
  isDeleting: boolean;
  renameValue: string;
  setRenameValue: (v: string) => void;
  inviteEmail: string;
  setInviteEmail: (v: string) => void;
  inviteLink: string | null;
  inviteLoading: boolean;
  shareMode: "private" | "public";
  setShareMode: (m: "private" | "public") => void;
  generatedShareUrl: string | null;
  setGeneratedShareUrl: (v: string | null) => void;
  chatMenuView: any;
  setChatMenuView: (v: any) => void;
  onNewChat: () => void;
  onTogglePin: () => void;
  onRename: () => void;
  onSendInvite: () => void;
  onCopyInviteLink: () => void;
  onCopyShareLink: () => void;
  onCreateShareLink: () => void;
  onOpenInvite: () => void;
  onConfirmDelete: () => void;
  tierMenuOpen: boolean;
  setTierMenuOpen: (open: boolean) => void;
  selectedModel: any;
  setSelectedModel: (model: any) => void;
  megsyTier: any;
  setMegsyTier: (tier: any) => void;
  mediaModel: any;
  setMediaModel: (model: any) => void;
  chatUserId: string | null;
  setChatMode: (mode: any) => void;
  setVideoDurationSec?: (duration: any) => void;
}

/**
 * Sticky chat header rendered on top of the messages area.
 * Aether-inspired: hairline bottom border, tiny brand mark on the left when empty,
 * minimal controls on the right. Desktop-only styling — mobile branch is untouched.
 */
export function DesktopChatHeader(props: DesktopChatHeaderProps) {
  const { chatMode, hasConversation, setSidebarOpen, conversationId, navigate, chatUserId } = props;
  const lang = useUserLang();
  const { credits, loading: creditsLoading } = useCredits();
  const prefetchPricing = () => {
    void prefetchRoute("/pricing");
  };
  const prefetchAuth = () => {
    void prefetchRoute("/auth");
  };
  const hideOptions =
    chatMode === "deep-research" || chatMode === "slides" || chatMode === "slides-images";

  return (
    <div
      data-desktop-chat-header="true"
      className="hidden md:flex absolute top-0 inset-x-0 z-20 items-center gap-2 px-5 py-3 min-h-[48px] pointer-events-none [&>*]:pointer-events-auto"
      style={{ background: "transparent" }}
    >
      <MobileSidebarButton onClick={() => setSidebarOpen(true)} />

      <div className="hidden md:flex items-center gap-2 min-w-0">
        {hasConversation && conversationId && !hideOptions ? (
          <ChatOptionsDropdown variant="desktop" {...props} />
        ) : null}
      </div>

      <div className="hidden md:block">
        <ComposerModelMenu
          mode={chatMode}
          open={props.tierMenuOpen}
          onOpenChange={props.setTierMenuOpen}
          side="bottom"
          align="start"
          selectedModel={props.selectedModel}
          megsyTier={props.megsyTier}
          userPlan={props.userPlan || "free"}
          mediaModel={props.mediaModel}
          settingsLabel={chatMode === "images" ? "Image settings" : chatMode === "video" ? "Video settings" : "Model settings"}
          settingsPanel={
            chatMode === "images" || chatMode === "video" ? (
              <MediaSettingsPanel
                mode={chatMode}
                onChange={(settings) => {
                  if (settings.duration !== undefined) props.setVideoDurationSec?.(settings.duration);
                }}
              />
            ) : (
              <ChatModelSettingsPanel />
            )
          }
          onTierSelect={(tier) => {
            props.setSelectedModel(null);
            props.setMegsyTier(tier);
            if (props.chatUserId) {
              void supabase.from("ai_personalization").upsert(
                { user_id: props.chatUserId, preferred_tier: tier } as any,
                { onConflict: "user_id" },
              );
            }
          }}
          onChatModelSelect={(model) => props.setSelectedModel({ id: model.id, label: model.label, cost: 0 })}
          onMediaModelSelect={props.setMediaModel}
          onModeChange={props.setChatMode}
          renderMobileSheet={false}
        />
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        {chatUserId && !creditsLoading && credits !== null ? (
          <button
            type="button"
            onClick={() => navigate("/settings/billing")}
            aria-label={`${uiT("Credits", lang)}: ${credits}`}
            title={uiT("Credits", lang)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-2xl border border-border bg-muted/40 text-[12.5px] font-medium text-foreground/90 hover:bg-muted transition-colors tabular-nums"
          >
            <span aria-hidden="true">◆</span>
            {credits.toLocaleString()}
          </button>
        ) : null}
        {chatUserId ? (
          <UpgradePlanButton variant="compact" />
        ) : (
          <button
            type="button"
            onPointerDown={prefetchAuth}
            onMouseEnter={prefetchAuth}
            onFocus={prefetchAuth}
            onClick={() => {
              prefetchAuth();
              navigate("/auth");
            }}
            aria-label={uiT("Sign in", lang)}
            className="btn-sunset relative inline-flex items-center justify-center h-9 px-5 rounded-2xl text-[12.5px] font-bold shrink-0 transition-all hover:-translate-y-[1px] active:translate-y-[1px] active:shadow-none mb-0.5"
          >
            {uiT("Sign in", lang)}
          </button>
        )}

        {hasConversation && conversationId && !hideOptions && (
          <ChatOptionsDropdown variant="mobile" {...props} />
        )}
      </div>
    </div>
  );
}
