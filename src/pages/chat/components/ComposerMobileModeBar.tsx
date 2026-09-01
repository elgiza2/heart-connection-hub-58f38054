import { AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ChatMode } from "../chatConstants";
import type { AgentDef } from "@/lib/agentRegistry";

interface ComposerMobileModeBarProps {
  selectedAgent: AgentDef | null;
  chatMode: ChatMode;
  editingIndex: number | null;
  hasMobileServicePanel: boolean;
  renderMobileServicePanel: () => React.ReactNode;
  composerModeBarChange: (m: string) => void;
  forceHidden?: boolean;
}

/** Animated mobile mode-bar rendered above the composer. */
export function ComposerMobileModeBar(props: ComposerMobileModeBarProps) {
  const {
    selectedAgent,
    chatMode,
    editingIndex,
    hasMobileServicePanel,
    renderMobileServicePanel,
    composerModeBarChange,
    forceHidden,
  } = props;

  // Only mount on mobile viewports. The service panel hosts its own model
  // dropdown sharing `tierMenuOpen` with the desktop composer dropdown. Radix
  // portals dropdown content to <body>, so a CSS-only `md:hidden` did not stop
  // it from opening on desktop — which rendered two menus at once.
  const isMobile = useIsMobile();
  if (!isMobile) return null;

  // The chips strip is intentionally hidden on mobile — modes now live inside
  // the "+" sheet (see PlusContent). The service panel still shows when active.
  void composerModeBarChange;
  void forceHidden;
  const showServicePanel =
    (!selectedAgent || selectedAgent.id === "docs") &&
    editingIndex === null &&
    hasMobileServicePanel;

  return (
    <AnimatePresence initial={false} mode="popLayout">
      {showServicePanel ? (
        <div key="service-panel" className="md:hidden">
          {renderMobileServicePanel()}
        </div>
      ) : null}
    </AnimatePresence>
  );
}
