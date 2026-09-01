import { useCallback, useEffect, useState } from "react";
import type { AgentDef, AgentModel } from "@/lib/agentRegistry";
import { isLegacyMegsyChatSelection, normalizeMegsyModelLabel } from "@/lib/megsyModelDisplay";
import { isPaidResearchDepth, isPaidUser } from "@/lib/subscriptionGating";


export type MegsyTier = "lite" | "pro" | "max";
export type ResearchDepth = "pro" | "ultra" | "ultra2x" | "ultra4x" | "ultra8x";

/**
 * Encapsulates state for the tier/model/agent selector and research depth
 * controls. Extracted from ChatPage to reduce re-render surface.
 */
export function useChatTier() {
  const [megsyTier, setMegsyTier] = useState<MegsyTier>("lite");
  const [userPlan, setUserPlan] = useState<string>("free");
  const [selectedModel, setSelectedModelState] = useState<AgentModel | null>(null);
  const [tierMenuOpen, setTierMenuOpen] = useState(false);
  const [researchDepth, setResearchDepth] = useState<ResearchDepth>("ultra");
  const [researchDepthOpen, setResearchDepthOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentDef | null>(null);
  const setSelectedModel = useCallback((model: AgentModel | null) => {
    if (!model || isLegacyMegsyChatSelection(model)) {
      setSelectedModelState(null);
      return;
    }
    setSelectedModelState({ ...model, label: normalizeMegsyModelLabel(model.label) });
  }, []);

  useEffect(() => {
    if (!selectedModel) return;
    if (isLegacyMegsyChatSelection(selectedModel)) {
      setSelectedModelState(null);
      return;
    }
    const nextLabel = normalizeMegsyModelLabel(selectedModel.label);
    if (nextLabel !== selectedModel.label) {
      setSelectedModelState({ ...selectedModel, label: nextLabel });
    }
  }, [selectedModel]);

  // If the plan can't use the current paid depth, snap back to ultra.
  useEffect(() => {
    if (isPaidResearchDepth(researchDepth) && !isPaidUser(userPlan)) {
      setResearchDepth("ultra");
    }
  }, [userPlan, researchDepth]);


  return {
    megsyTier,
    setMegsyTier,
    userPlan,
    setUserPlan,
    selectedModel,
    setSelectedModel,
    tierMenuOpen,
    setTierMenuOpen,
    researchDepth,
    setResearchDepth,
    researchDepthOpen,
    setResearchDepthOpen,
    selectedAgent,
    setSelectedAgent,
  };
}
