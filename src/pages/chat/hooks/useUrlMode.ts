// Sync ChatPage's `chatMode` with the `?mode=` URL search parameter.
// Extracted from ChatPage.tsx as the first step in breaking the page apart
// (Phase 1 of the chat-page refactor). Pure behavior preservation — no
// changes to logic.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import type { ChatMode } from "../chatConstants";

const ALLOWED_URL_MODES: ChatMode[] = [
  "deep-research",
  "learning",
  "shopping",
  "slides",
  "slides-images",
  "images",
  "video",
  "operator",
];

interface Options {
  chatMode: ChatMode;
  setChatMode: (mode: ChatMode) => void;
  setSearchEnabled: (enabled: boolean) => void;
}

export function useUrlMode({ chatMode, setChatMode, setSearchEnabled }: Options) {
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const m = params.get("mode");
    if (!m) return;
    if ((ALLOWED_URL_MODES as string[]).includes(m) && chatMode !== m) {
      setChatMode(m as ChatMode);
      if (m === "deep-research") setSearchEnabled(true);
      else if (m !== "normal") setSearchEnabled(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);
}
