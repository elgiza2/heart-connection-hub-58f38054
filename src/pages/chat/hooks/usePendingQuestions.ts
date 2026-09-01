import { useState } from "react";

export type PendingQuestion = {
  title: string;
  options: string[];
  allowText?: boolean;
};

/**
 * Encapsulates state for pending clarify-style questions and the currently
 * active research request id. Extracted from ChatPage to reduce re-render surface.
 */
export function usePendingQuestions() {
  const [pendingQuestions, setPendingQuestions] = useState<PendingQuestion[]>([]);
  const [activeResearchJobId, setActiveResearchJobId] = useState<string | null>(null);

  return {
    pendingQuestions,
    setPendingQuestions,
    activeResearchJobId,
    setActiveResearchJobId,
  };
}
