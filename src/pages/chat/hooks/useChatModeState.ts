import { useState } from "react";
import type { ChatMode } from "../chatConstants";
import { DEFAULT_SLIDES_TEMPLATE } from "@/lib/slidesTemplates";
import type { MediaModelChoice } from "@/components/chat/media/MediaModelPickerSheet";

// NOTE: `chatMode` is intentionally NOT persisted across page loads.
// Previously we stored it in localStorage, which trapped users in modes
// like "video" forever after a single use. New chats always start in
// "normal" — mode switches only stick within the current session.
const LEGACY_STORAGE_KEY = "megsy.chatMode";

/**
 * Encapsulates state for the chat mode selector (normal/slides/media/video/etc),
 * the slides template + picker, the selected media model, the operator-run id,
 * and the computer-use toggle. Extracted from ChatPage to reduce re-render surface.
 */
export function useChatModeState() {
  // Clear any legacy persisted value once so returning users are freed from
  // being stuck in a mode they set weeks ago.
  if (typeof window !== "undefined") {
    try { window.localStorage.removeItem(LEGACY_STORAGE_KEY); } catch {}
  }

  const [chatMode, setChatMode] = useState<ChatMode>("normal");
  const [operatorRunId, setOperatorRunId] = useState<string | null>(null);
  const [slidesTemplate, setSlidesTemplate] = useState<string>(DEFAULT_SLIDES_TEMPLATE);
  const [slidesPickerOpen, setSlidesPickerOpen] = useState(false);
  const [mediaModel, setMediaModel] = useState<MediaModelChoice | null>(null);
  // Normal chat must start tool-free so simple turns can use `chat-fast`.
  // Computer mode is enabled explicitly when the user selects an agent/task.
  const [computerUseEnabled, setComputerUseEnabled] = useState(false);

  return {
    chatMode,
    setChatMode,
    operatorRunId,
    setOperatorRunId,
    slidesTemplate,
    setSlidesTemplate,
    slidesPickerOpen,
    setSlidesPickerOpen,
    mediaModel,
    setMediaModel,
    computerUseEnabled,
    setComputerUseEnabled,
  };
}

