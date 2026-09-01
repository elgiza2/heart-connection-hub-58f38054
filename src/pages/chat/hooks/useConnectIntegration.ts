import { useCallback } from "react";
import { toast } from "sonner";
import type { NavigateFunction } from "react-router-dom";
import type { Integration } from "@/lib/integrationsData";
import { integrations } from "@/lib/integrationsData";
import {
  loadIntegrationConnections,
  startIntegrationConnection,
  waitForConnectionRefresh,
} from "@/lib/integrationBackend";

interface UseConnectIntegrationParams {
  connectingApp: string | null;
  setConnectingApp: (id: string | null) => void;
  setPlusMenuOpen: (open: boolean) => void;
  navigate: NavigateFunction;
  setUserIntegrations?: (
    updater:
      | Record<string, boolean>
      | ((prev: Record<string, boolean>) => Record<string, boolean>),
  ) => void;
  refreshIntegrations?: () => Promise<void>;
}

export const useConnectIntegration = ({
  connectingApp,
  setConnectingApp,
  setPlusMenuOpen,
  navigate,
  setUserIntegrations,
  refreshIntegrations,
}: UseConnectIntegrationParams) => {
  return useCallback(
    async (integration: Integration) => {
      if (connectingApp) return;

      // If already connected → go straight to the detail/manage page instead
      // of re-running the OAuth flow.
      try {
        const snap = await loadIntegrationConnections([integration]);
        if (snap.connectedApps?.[integration.app]) {
          setPlusMenuOpen(false);
          navigate("/chat?integrations=1");
          return;
        }
      } catch {
        /* ignore — will attempt connect */
      }

      setConnectingApp(integration.id);
      try {
        if (
          (integration.type === "pipedream" && integration.pipedreamSlug) ||
          integration.app === "github" ||
          integration.app === "supabase"
        ) {
          const result = await startIntegrationConnection(integration);
          if (result.mode === "local") {
            const snap = await loadIntegrationConnections(integrations);
            setUserIntegrations?.(snap.connectedApps || {});
            toast.success(`${integration.name} connected`);
            return;
          }
          toast.success(`Finish connecting ${integration.name} in the popup`);
          await waitForConnectionRefresh(async () => {
            const snap = await loadIntegrationConnections(integrations);
            setUserIntegrations?.(snap.connectedApps || {});
            return !!snap.connectedApps[integration.app];
          }, (result as any).popup);
          await refreshIntegrations?.();
          return;
        }

        setPlusMenuOpen(false);
        navigate("/chat?integrations=1");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `${integration.name} failed`);
      } finally {
        setConnectingApp(null);
      }
    },
    [
      connectingApp,
      setConnectingApp,
      setPlusMenuOpen,
      navigate,
      setUserIntegrations,
      refreshIntegrations,
    ],
  );
};
