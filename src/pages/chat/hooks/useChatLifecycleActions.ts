import { useCallback } from "react";
import type { ChatMode } from "../chatConstants";

type StudyMusic = { kind: string | null };

interface NewChatArgs {
  slidesGenerationTokenRef: React.MutableRefObject<number>;
  slidesTimeoutsRef: React.MutableRefObject<Record<string, number>>;
  studyAudioRef: React.MutableRefObject<HTMLAudioElement | null>;
  setStudyTimers: React.Dispatch<React.SetStateAction<any>>;
  setStudyMusic: React.Dispatch<React.SetStateAction<any>>;
  setMessages: React.Dispatch<React.SetStateAction<any>>;
  setConversationId: (v: string | null) => void;
  setConversationTitle: (v: string) => void;
  setIsLoading: (v: boolean) => void;
  setIsThinking: (v: boolean) => void;
  setAttachedFiles: React.Dispatch<React.SetStateAction<any>>;
  resetToolUi: () => void;
  setChatMode: (v: ChatMode) => void;
  setSearchEnabled: (v: boolean) => void;
  setComputerUseEnabled: (v: boolean) => void;
  setIsShared: (v: boolean) => void;
  setShareId: (v: string | null) => void;
  setShareMode: (v: any) => void;
  setIsPinned: (v: boolean) => void;
  setPendingQuestions: React.Dispatch<React.SetStateAction<any>>;
  setSelectedModel: (v: null) => void;
  setSelectedAgent: (v: null) => void;
  isSubmittingRef: React.MutableRefObject<boolean>;
}

/**
 * Resets the chat surface to a brand-new conversation:
 *  - Invalidates any in-flight slides generation token + timers
 *  - Stops/clears the focus-music audio element
 *  - Clears messages, attachments, share state, pinned state, mode, model
 *  - Resets the loading/submitting flags so the composer is interactive
 */
export function useChatNewChat(args: NewChatArgs) {
  return useCallback(() => {
    args.slidesGenerationTokenRef.current += 1;
    Object.values(args.slidesTimeoutsRef.current).forEach((timer) => window.clearTimeout(timer));
    args.slidesTimeoutsRef.current = {};
    if (args.studyAudioRef.current) {
      args.studyAudioRef.current.pause();
      args.studyAudioRef.current.src = "";
    }
    args.setStudyTimers([]);
    args.setStudyMusic({ kind: null } as StudyMusic);
    args.setMessages([]);
    args.setConversationId(null);
    args.setConversationTitle("");
    args.setIsLoading(false);
    args.setIsThinking(false);
    args.setAttachedFiles([]);
    args.resetToolUi();
    args.setChatMode("normal");
    args.setSearchEnabled(true);
    args.setComputerUseEnabled(true);
    args.setIsShared(false);
    args.setShareId(null);
    args.setShareMode("private");
    args.setIsPinned(false);
    args.setPendingQuestions([]);
    args.setSelectedModel(null);
    args.setSelectedAgent(null);
    args.isSubmittingRef.current = false;
  }, [args]);
}

interface ModeChangeArgs {
  chatMode: ChatMode;
  setChatMode: (v: ChatMode) => void;
  setStudyTimers: React.Dispatch<React.SetStateAction<any>>;
  setStudyMusic: React.Dispatch<React.SetStateAction<any>>;
  setSearchEnabled: (v: boolean) => void;
  mediaModel: any;
  setMediaModel: React.Dispatch<React.SetStateAction<any>>;
  setTierMenuOpen: (v: boolean) => void;
  setPlusMenuOpen: (v: boolean) => void;
  searchEnabled: boolean;
}

/**
 * Returns two composer-mode handlers:
 *  - handleModeChange(mode): toggle/select a chat mode, reset side state
 *    (study timers, search-enabled defaults, media model compatibility).
 *  - handleSearchToggle(): flip web-search on/off and exit special modes.
 */
export function useChatModeActions(args: ModeChangeArgs) {
  const handleModeChange = useCallback(
    (mode: ChatMode) => {
      const nextMode = args.chatMode === mode ? "normal" : mode;
      args.setChatMode(nextMode);
      if (nextMode !== "learning") {
        args.setStudyTimers([]);
        args.setStudyMusic({ kind: null } as StudyMusic);
      }
      if (mode === "deep-research") {
        args.setSearchEnabled(true);
      } else if (mode !== "normal") {
        args.setSearchEnabled(false);
      }
      if (nextMode === "images" || nextMode === "video") {
        const expectedType = nextMode === "video" ? "video" : "image";
        if (args.mediaModel?.type !== expectedType) args.setMediaModel(null);
        args.setTierMenuOpen(false);
      }
      args.setPlusMenuOpen(false);
    },
    [args],
  );

  const handleSearchToggle = useCallback(() => {
    args.setSearchEnabled(!args.searchEnabled);
    if (!args.searchEnabled) args.setChatMode("normal");
    args.setPlusMenuOpen(false);
  }, [args]);

  return { handleModeChange, handleSearchToggle };
}
