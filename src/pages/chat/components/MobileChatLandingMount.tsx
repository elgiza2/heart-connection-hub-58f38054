import { LayoutTemplate } from "lucide-react";
import MobileChatLanding, {
  type ActivePill,
  type LandingChipId,
} from "@/components/chat/mobile/MobileChatLanding";
import MobileModeBar from "@/components/chat/mobile/MobileModeBar";
import { AGENTS, type AgentDef } from "@/lib/agentRegistry";
import { isPaidUser } from "@/lib/subscriptionGating";
import { getChatModelDisplayLabel, type ChatMode } from "../chatConstants";
import { useMobileModeBarChange } from "../hooks/useMobileModeBarChange";

interface MobileChatLandingMountProps {
  // Composer state
  input: string;
  setInput: (v: string) => void;
  handleSend: () => unknown | Promise<unknown>;
  isLoading: boolean;
  activeResearchJobId: string | null;
  selectedModel: { id?: string; label?: string } | null;
  setSelectedModel: (m: any) => void;
  megsyTier: any;
  userPlan: string | null | undefined;
  userName: string;
  plusMenuOpen: boolean;
  setPlusMenuOpen: (v: boolean) => void;
  setPlusView: (v: any) => void;
  // Mode-bar
  hasMobileServicePanel: boolean;
  renderMobileServicePanel: () => React.ReactNode;
  chatMode: ChatMode;
  selectedAgent: AgentDef | null;
  setSelectedAgent: (a: AgentDef | null) => void;
  setChatMode: (m: ChatMode) => void;
  handleModeChange: (m: ChatMode) => void;
  tryActivateMegsyOs: () => void;
  // Pills / agents
  setSlidesPickerOpen: (v: boolean) => void;
}

export function MobileChatLandingMount(props: MobileChatLandingMountProps) {
  const {
    input,
    setInput,
    handleSend,
    isLoading,
    activeResearchJobId,
    selectedModel,
    setSelectedModel,
    megsyTier,
    userPlan,
    userName,
    plusMenuOpen,
    setPlusMenuOpen,
    setPlusView,
    hasMobileServicePanel,
    renderMobileServicePanel,
    chatMode,
    selectedAgent,
    setSelectedAgent,
    setChatMode,
    handleModeChange,
    tryActivateMegsyOs,
    setSlidesPickerOpen,
  } = props;

  const onModeBarChange = useMobileModeBarChange(
    {
      selectedAgent,
      setSelectedAgent,
      setSelectedModel,
      setChatMode,
      handleModeChange,
      tryActivateMegsyOs,
      setInput,
    },
    { withWebsite: true },
  );

  const activePills: ActivePill[] = [];
  if (chatMode === "slides" || chatMode === "slides-images" || selectedAgent?.id === "slides") {
    activePills.push({
      id: "slides-template",
      label: "Templates",
      icon: <LayoutTemplate className="w-3.5 h-3.5" />,
      onClick: () => setSlidesPickerOpen(true),
    });
  }

  return (
    <MobileChatLanding
      input={input}
      onInputChange={setInput}
      onSend={() => {
        void handleSend();
      }}
      isLoading={isLoading || !!activeResearchJobId}
      modelLabel={getChatModelDisplayLabel(selectedModel, megsyTier)}
      isPaid={isPaidUser(userPlan)}
      onPlusClick={() => {
        if (!plusMenuOpen) setPlusView("main");
        setPlusMenuOpen(!plusMenuOpen);
      }}
      onModelSelect={(m) => {
        setSelectedModel({ id: m.id, label: m.label, cost: 0 });
      }}
      greeting="How can I help you today?"
      userName={userName}
      onSuggestionClick={(s) => {
        setInput(s.label);
      }}
      modelControlSlot={undefined}
      modeBarSlot={
        hasMobileServicePanel ? (
          renderMobileServicePanel()
        ) : (
          <MobileModeBar
            mode={selectedAgent?.id === "docs" ? "docs" : (chatMode as any)}
            onChange={onModeBarChange}
          />
        )
      }
      onChipClick={(id: LandingChipId) => {
        if (id === "image") {
          handleModeChange("images" as ChatMode);
          return;
        }
        if (id === "video") {
          handleModeChange("video" as ChatMode);
          return;
        }
        if (id === "website") {
          handleModeChange("code" as ChatMode);
          return;
        }
      }}
      onAgentClick={(card) => {
        switch (card.agentId) {
          case "slides":
            handleModeChange("slides" as ChatMode);
            setSelectedAgent(null);
            break;
          case "research":
            handleModeChange("deep-research" as ChatMode);
            setSelectedAgent(null);
            break;
          case "megsy-os":
            tryActivateMegsyOs();
            break;
          case "learning":
            handleModeChange("learning" as ChatMode);
            setSelectedAgent(null);
            break;
          case "resume":
          case "document": {
            const a = AGENTS.find((x) => x.id === card.agentId);
            if (a) setSelectedAgent(a);
            break;
          }
        }
      }}
      activePills={activePills}
    />
  );
}
