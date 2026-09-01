import { useState } from "react";

export type ChatMenuView = "main" | "invite" | "share" | "rename" | "pin" | "delete";

/**
 * Encapsulates state for the chat header overlays: side sheets (connectors,
 * directory), scroll-to-bottom button visibility, the per-chat action menu
 * (rename/pin/share/etc), and the Megsy OS intro modal. Extracted from
 * ChatPage to reduce re-render surface.
 */
export function useChatHeaderUi() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [connectorsOpen, setConnectorsOpen] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [chatMenuView, setChatMenuView] = useState<ChatMenuView>("main");
  const [megsyOsIntroOpen, setMegsyOsIntroOpen] = useState(false);

  return {
    sidebarOpen,
    setSidebarOpen,
    showScrollBtn,
    setShowScrollBtn,
    connectorsOpen,
    setConnectorsOpen,
    directoryOpen,
    setDirectoryOpen,
    chatMenuView,
    setChatMenuView,
    megsyOsIntroOpen,
    setMegsyOsIntroOpen,
  };
}
