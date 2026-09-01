import { useMemo } from "react";
import { integrations as ALL_INTEGRATIONS } from "@/lib/integrationsData";

/**
 * Derives the integration browser's category list and filtered list from the
 * current search query and active category. Pure memo — no side effects.
 */
export function useIntegrationsFilter(integrationsQuery: string, integrationsCategory: string) {
  const integrationCategories = useMemo(() => {
    const set = new Set<string>(["All"]);
    ALL_INTEGRATIONS.forEach((i) => set.add(i.category));
    return Array.from(set);
  }, []);

  const filteredIntegrations = useMemo(() => {
    const q = integrationsQuery.trim().toLowerCase();
    return ALL_INTEGRATIONS.filter((i) => {
      if (integrationsCategory !== "All" && i.category !== integrationsCategory) return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q)
      );
    });
  }, [integrationsQuery, integrationsCategory]);

  return { integrationCategories, filteredIntegrations };
}
