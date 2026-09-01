import { useState } from "react";

export type PlusView = "main" | "tools" | "models" | "skills" | "music" | "timer";

/**
 * Encapsulates state for the "+" composer menu (open, expanded, sub-view).
 * Extracted from ChatPage to reduce re-render surface.
 */
export function usePlusMenu() {
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [plusExpanded, setPlusExpanded] = useState(false);
  const [plusView, setPlusView] = useState<PlusView>("main");

  return {
    plusMenuOpen,
    setPlusMenuOpen,
    plusExpanded,
    setPlusExpanded,
    plusView,
    setPlusView,
  };
}
