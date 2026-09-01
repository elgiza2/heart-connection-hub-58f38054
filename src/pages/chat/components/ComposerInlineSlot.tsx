import ResearchDepthDropdown from "./ResearchDepthDropdown";
import type { ChatMode } from "../chatConstants";
import type { AgentDef } from "@/lib/agentRegistry";


interface ComposerInlineSlotProps {
  isMobileViewport: boolean;
  chatMode: ChatMode;
  setChatMode?: (m: ChatMode) => void;
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
  selectedAgent: AgentDef | null;
  slidesTemplate: any;
  setSlidesPickerOpen: (v: boolean) => void;
  researchDepth: any;
  setResearchDepth: (v: any) => void;
  researchDepthOpen: boolean;
  setResearchDepthOpen: (v: boolean) => void;
  setVideoDurationSec?: (n: any) => void;
}

/** Inline pills/menus rendered above the composer textarea. */
export function ComposerInlineSlot(props: ComposerInlineSlotProps) {
  const {
    chatMode,
    setChatMode,
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
    selectedAgent,
    slidesTemplate,
    setSlidesPickerOpen,
    researchDepth,
    setResearchDepth,
    researchDepthOpen,
    setResearchDepthOpen,
    setVideoDurationSec,
  } = props;

  const isSlidesMode =
    chatMode === "slides" ||
    chatMode === "slides-images" ||
    selectedAgent?.id === "slides" ||
    selectedAgent?.id === "slides-images";

  const isDeepResearch = chatMode === "deep-research";

  return (
    <>
      {/* Slides template picker lives in the service panel header above the
          composer; rendering it here too produced a duplicate chip. */}
      {/* Deep-research depth moved into the model menu (Depth panel). */}
    </>
  );
}
