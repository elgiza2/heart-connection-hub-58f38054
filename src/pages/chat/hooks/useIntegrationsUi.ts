import { useCallback, useEffect, useState } from "react";
import { integrations } from "@/lib/integrationsData";
import { loadIntegrationConnections } from "@/lib/integrationBackend";

/**
 * Encapsulates state for the integrations browser (connect dialog, search,
 * category filter, broken-logo cache, and the list of enabled user
 * integrations). Extracted from ChatPage to reduce re-render surface.
 */
export function useIntegrationsUi() {
  const [userIntegrations, setUserIntegrations] = useState<Record<string, boolean>>({});
  const [connectingApp, setConnectingApp] = useState<string | null>(null);
  const [integrationsQuery, setIntegrationsQuery] = useState("");
  const [integrationsCategory, setIntegrationsCategory] = useState<string>("All");
  const [brokenLogos, setBrokenLogos] = useState<Record<string, boolean>>({});

  const refreshIntegrations = useCallback(async () => {
    try {
      const snap = await loadIntegrationConnections(integrations);
      setUserIntegrations(snap.connectedApps || {});
    } catch {
      /* not signed in or offline — silently ignore */
    }
  }, []);

  useEffect(() => {
    refreshIntegrations();
  }, [refreshIntegrations]);

  return {
    userIntegrations,
    setUserIntegrations,
    refreshIntegrations,
    connectingApp,
    setConnectingApp,
    integrationsQuery,
    setIntegrationsQuery,
    integrationsCategory,
    setIntegrationsCategory,
    brokenLogos,
    setBrokenLogos,
  };
}
