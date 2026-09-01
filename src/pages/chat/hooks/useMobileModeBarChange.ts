import { useCallback } from "react";
import type { ChatMode } from "../chatConstants";
import type { AgentDef } from "@/lib/agentRegistry";

interface UseMobileModeBarChangeArgs {
  selectedAgent: AgentDef | null;
  setSelectedAgent: (a: AgentDef | null) => void;
  setSelectedModel: (m: null) => void;
  setChatMode: (m: ChatMode) => void;
  handleModeChange: (m: ChatMode) => void;
  tryActivateMegsyOs: () => void;
  setInput?: (s: string) => void;
}

/**
 * Unified handler for the MobileModeBar `onChange` event.
 * Shared between the landing-screen and the always-mounted composer bar.
 *
 * @param withWebsite When true (landing-screen variant), accepts a "website"
 *                    mode that pre-fills the composer with a build directive.
 */
export function useMobileModeBarChange(
  args: UseMobileModeBarChangeArgs,
  options: { withWebsite?: boolean } = {},
) {
  const {
    selectedAgent,
    setSelectedAgent,
    setSelectedModel,
    setChatMode,
    handleModeChange,
    tryActivateMegsyOs,
    setInput,
  } = args;
  const { withWebsite = false } = options;

  return useCallback(
    (m: string) => {
      if (m === "normal") {
        setChatMode("normal" as ChatMode);
        setSelectedAgent(null);
        return;
      }
      if (m === "operator") {
        setSelectedAgent(null);
        tryActivateMegsyOs();
        return;
      }
      if (m === "docs") {
        if (selectedAgent?.id === "docs") {
          setSelectedAgent(null);
        } else {
          void import("@/lib/agentRegistry").then(({ AGENTS }) => {
            setSelectedAgent(AGENTS.find((a) => a.id === "docs") || null);
          });
        }
        return;
      }
      if (withWebsite && m === "website") {
        setSelectedAgent(null);
        setSelectedModel(null);
        setInput?.("Build me a full site (React 18 + Tailwind, deploys instantly and gives me a URL). Idea: ");
        setChatMode("normal" as ChatMode);
        return;
      }
      setSelectedAgent(null);
      setSelectedModel(null);
      handleModeChange(m as ChatMode);
    },
    [
      selectedAgent,
      setSelectedAgent,
      setSelectedModel,
      setChatMode,
      handleModeChange,
      tryActivateMegsyOs,
      setInput,
      withWebsite,
    ],
  );
}
