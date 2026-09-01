import { useState } from "react";

/**
 * Encapsulates state for trending suggestion chips that re-roll per agent.
 * Extracted from ChatPage to reduce re-render surface.
 */
export function useTrendingSuggestions() {
  const [trendingItems, setTrendingItems] = useState<string[]>([]);
  const [trendingAgentId, setTrendingAgentId] = useState<string | null>(null);

  return {
    trendingItems,
    setTrendingItems,
    trendingAgentId,
    setTrendingAgentId,
  };
}
