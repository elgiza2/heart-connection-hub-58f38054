import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCachedUser } from "@/lib/cachedUser";
import { integrations, type Integration } from "@/lib/integrationsData";

export interface ConnectedApp {
  app: string;
  name: string;
  domain?: string;
}

const byApp = new Map<string, Integration>(integrations.map((i) => [i.app, i]));

/**
 * Lightweight read of the user's connected integrations (no edge-function
 * calls) so the composer can show real app logos next to the "+" button.
 */
export function useConnectedApps() {
  const [apps, setApps] = useState<ConnectedApp[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const auth = { user: await getCachedUser() };
        const user = auth?.user;
        if (!user) return;

        const [composio, local] = await Promise.allSettled([
          supabase
            .from("composio_connections")
            .select("app_slug,status")
            .eq("user_id", user.id),
          supabase
            .from("user_integrations")
            .select("email_enabled,email_address,telegram_chat_id,telegram_username")
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);

        const slugs: string[] = [];
        if (composio.status === "fulfilled" && Array.isArray(composio.value.data)) {
          for (const row of composio.value.data as any[]) {
            if (row?.app_slug && row.status !== "disconnected") slugs.push(String(row.app_slug));
          }
        }
        if (local.status === "fulfilled" && local.value.data) {
          const row = local.value.data as any;
          if (row.email_enabled || row.email_address) slugs.push("email");
          if (row.telegram_chat_id || row.telegram_username) slugs.push("telegram");
        }

        const unique = Array.from(new Set(slugs));
        const resolved: ConnectedApp[] = unique.map((app) => {
          const meta = byApp.get(app);
          return { app, name: meta?.name ?? app, domain: meta?.domain };
        });

        if (!cancelled) setApps(resolved);
      } catch {
        /* silent — composer just shows the generic integrations icon */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return apps;
}

export default useConnectedApps;
