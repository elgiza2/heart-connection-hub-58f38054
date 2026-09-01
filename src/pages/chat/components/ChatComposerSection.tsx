
import { useState, type ReactNode } from "react";
import { AnimatePresence } from "framer-motion";
import ComposerAttachments from "./ComposerAttachments";
import { RemoteAiBusyBanner } from "./RemoteAiBusyBanner";
import { MentionDropdown } from "./MentionDropdown";
import { ComposerMobileModeBar } from "./ComposerMobileModeBar";
import { ComposerAnimatedInput } from "./ComposerAnimatedInput";
import { prewarmSendPath } from "../lib/prewarmSendPath";
import ComposerServicePanel from "./ComposerServicePanel";
import StarterCards, { StarterChips } from "./StarterCards";

import type { AttachedFile } from "../hooks/useAttachments";





interface ChatComposerSectionProps {
  sidebarCollapsed: boolean;
  sidebarOffset?: number;
  loadingMessages: boolean;
  messagesLength: number;
  attachedFiles: AttachedFile[];
  removeAttachment: (i: number) => void;
  remoteAiBusy: { name: string } | null;
  plusMenuOpen: boolean;
  renderPlusMenu: () => ReactNode;
  mentionQuery: { q: string } | null;
  members: any[];
  onlineUsers: any;
  colorForUser: (id?: string | null) => any;
  insertMention: (name: string) => void;
  composerMobileModeBarProps: Record<string, any>;
  composerAnimatedInputProps: Record<string, any>;
  navigate: any;
  desktopModeChipsProps: Record<string, any>;
  /** Optional greeting node rendered just above the input on empty desktop state. */
  desktopGreeting?: ReactNode;
  /** Ref forwarded to the composer wrapper so the plus menu can anchor to it. */
  composerRef?: React.Ref<HTMLDivElement>;
  /** Image-mode tools strip (upload / background removal / characters). */
  imageTools?: ReactNode;
}

/**
 * Floating bottom composer dock. Lifts to vertical-center on empty desktop
 * state, otherwise sticks to the bottom. Hosts attachments preview, busy
 * banner, plus-menu overlay, @mention dropdown, mobile mode bar, animated
 * input, desktop integrations strip, and the desktop mode chips row.
 */
export function ChatComposerSection(props: ChatComposerSectionProps) {
  const {
    sidebarCollapsed,
    sidebarOffset,
    loadingMessages,
    messagesLength,
    attachedFiles,
    removeAttachment,
    remoteAiBusy,
    plusMenuOpen,
    renderPlusMenu,
    mentionQuery,
    members,
    onlineUsers,
    colorForUser,
    insertMention,
    composerMobileModeBarProps,
    composerAnimatedInputProps,
    navigate,
    desktopModeChipsProps,
    desktopGreeting,
    composerRef,
  } = props;

  const isEmpty = messagesLength === 0 && !loadingMessages;
  const isDesktopLanding = messagesLength === 0 && !loadingMessages;
  // Chips/modes bar visibility: always shown by default; user can toggle via the
  // modes button. Do NOT auto-hide based on active service — chatMode is
  // persisted in localStorage, so auto-hiding causes chips to disappear every
  // time the user returns to the chat page.
  const [modesShown, setModesShown] = useState(true);
  const [inputFocused, setInputFocused] = useState(false);
  const d = desktopModeChipsProps as any;
  // Modes that already render their own labelled header panel. Showing the
  // ActiveServicePill for these too is what produced two chips at once.
  // Every service now renders through the single ComposerServicePanel chip,
  // so there is exactly one indicator on screen for every mode.
  const isDocsAgent = d.selectedAgent?.id === "docs";
  const isDevAgent = d.selectedAgent?.id === "dev";
  const hasActiveService = isDocsAgent || isDevAgent || (d.chatMode && d.chatMode !== "normal");
  const hasHeaderService = hasActiveService;

  // Hide chips whenever a service is active; also hide on mobile once the
  // conversation has started or the user is typing (input focused). They
  // auto-return when the service pill is cleared or the user opens a fresh
  // conversation on desktop.
  const effectiveModesShown = modesShown && !hasActiveService;

  // Starter chips: only on the empty landing state, and they disappear the
  // moment the user clicks into the input, types anything, or activates a
  // service. They come back when the service X button clears the mode.
  const composerInputText = String((composerAnimatedInputProps as any)?.input ?? "");
  const starterChipsVisible =
    isEmpty && !hasActiveService && composerInputText.trim().length === 0;



  return (
    <div
      style={{
        ["--sb-left" as any]: (sidebarOffset ?? (sidebarCollapsed ? 56 : 260)) + "px",
        transitionTimingFunction: "cubic-bezier(0.34, 1.35, 0.64, 1)",
      }}
      className={`chat-composer-dock fixed end-0 bottom-[var(--kb-offset,0px)] z-30 px-2 md:px-6 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] md:pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3 md:pt-6 pointer-events-none transition-[inset-inline-start,top,bottom,transform] duration-[520ms] bg-transparent will-change-transform ${
        isDesktopLanding
          ? "md:top-0 md:bottom-0 md:flex md:items-center md:justify-center md:bg-transparent md:backdrop-blur-0 md:border-0 md:overflow-visible"
          : "md:bg-transparent md:backdrop-blur-0 md:border-0"
      }`}
    >
      <div className={`${isDesktopLanding ? "md:max-w-4xl" : "max-w-3xl"} max-w-3xl mx-auto space-y-2 pointer-events-auto w-full`}>
        <RemoteAiBusyBanner remoteAiBusy={remoteAiBusy} />

        <div className="relative mx-auto w-full max-w-3xl">

          <div data-tour="composer" className="relative">
            {mentionQuery && (
              <MentionDropdown
                members={members}
                query={mentionQuery.q}
                onlineUsers={onlineUsers}
                colorForUser={colorForUser}
                insertMention={insertMention}
              />
            )}

            <ComposerMobileModeBar
              {...(composerMobileModeBarProps as any)}
              forceHidden={!effectiveModesShown}
            />

            {isDesktopLanding && desktopGreeting ? (
              <div className="hidden md:flex justify-center mb-8">{desktopGreeting}</div>
            ) : null}

            {/* Mode chips row removed by design: modes live in the + menu. */}

            <AnimatePresence initial={false} mode="popLayout">
              {starterChipsVisible ? (
                <StarterCards
                  key="starter-chips"
                  className="mt-1 mb-1.5"
                  onPick={(_prompt, mode) => {
                    // Cards only turn the service chip on — they never prefill text.
                    if (mode) {
                      d.handleModeChange?.(mode);
                      setModesShown(false);
                    }
                  }}
                />
              ) : null}
            </AnimatePresence>


            <div className="md:contents">
              <div ref={composerRef as any} className="relative z-[8] md:p-[1px] md:rounded-[28px]">
                {plusMenuOpen ? renderPlusMenu() : null}
                <div className="md:rounded-[27px] md:overflow-hidden">

                <ComposerAnimatedInput
                {...(composerAnimatedInputProps as any)}
                modesToggleVisible
                modesShown={effectiveModesShown}
                onToggleModes={() => setModesShown((v) => !v)}
                chatContext
                onInputFocusChange={(focused) => {
                  setInputFocused(focused);
                  if (focused) prewarmSendPath(true);
                }}
                canSendWithoutText={attachedFiles.length > 0}
                activeServiceHeader={
                  hasHeaderService || attachedFiles.length > 0 ? (
                    <>
                      <ComposerServicePanel
                        chatMode={d.chatMode}
                        isDocsAgent={isDocsAgent}
                        isDevAgent={isDevAgent}
                        mediaModel={d.mediaModel ?? null}
                        setMediaModel={d.setMediaModel}
                        slidesTemplate={d.slidesTemplate}
                        onOpenTemplatePicker={() => d.setSlidesPickerOpen?.(true)}
                        onClear={() => {
                          if (isDocsAgent || isDevAgent) d.setSelectedAgent?.(null);
                          else d.handleModeChange("normal");
                          setModesShown(true);
                        }}
                      />
                      {(d.chatMode === "images" || d.chatMode === "video") && props.imageTools
                        ? props.imageTools
                        : null}
                      {attachedFiles.length > 0 ? (
                        <ComposerAttachments files={attachedFiles} onRemove={removeAttachment} />
                      ) : null}
                    </>
                  ) : null
                }

                />
                </div>
              </div>

              {/* Desktop-only starter chips below the composer (icons, no images). */}
              {starterChipsVisible ? (
                <StarterChips
                  className="mt-3"
                  onPick={(_prompt, mode) => {
                    if (mode) {
                      d.handleModeChange?.(mode);
                      setModesShown(false);
                    }
                  }}
                />
              ) : null}

            </div>

          </div>

          
        </div>
      </div>
    </div>
  );

}
