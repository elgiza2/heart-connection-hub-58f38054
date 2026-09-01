import { useState } from "react";
import type { ClarifyQuestion } from "@/components/research/ClarifyDialog";

export type ToolActivity = {
  name: string;
  appSlug?: string;
  target?: string;
  status: "running" | "done" | "error";
};

export type ParallelTask = {
  id: string;
  name: string;
  appSlug?: string;
  target?: string;
  status: "running" | "done" | "error";
};

/**
 * Encapsulates UI state for live tool activity, search status, parallel
 * task tracking, narration log, and clarify questions. Extracted from
 * ChatPage to reduce re-render surface for unrelated UI.
 */
export function useToolActivity() {
  const [searchStatus, setSearchStatus] = useState<string>("");
  const [toolActivity, setToolActivity] = useState<ToolActivity | null>(null);
  const [parallelTasks, setParallelTasks] = useState<ParallelTask[]>([]);
  const [narrations, setNarrations] = useState<string[]>([]);
  const [clarifyQs, setClarifyQs] = useState<ClarifyQuestion[] | null>(null);

  return {
    searchStatus,
    setSearchStatus,
    toolActivity,
    setToolActivity,
    parallelTasks,
    setParallelTasks,
    narrations,
    setNarrations,
    clarifyQs,
    setClarifyQs,
  };
}
