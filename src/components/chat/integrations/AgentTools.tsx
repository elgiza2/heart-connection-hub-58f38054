/** @doc Agent tools for connected apps.
 *
 *  Rendered inline in the "Currently connected" section of the connectors
 *  sheet: same flat row look as the app list (logo + name + account), with a
 *  toggle for using the app in chat and an expandable list of the real actions
 *  the assistant can run. Tapping an action drops a ready prompt in the composer.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  listToolApps,
  setAppToolsEnabled,
  type ConnectedToolApp,
} from "@/lib/pipedream/client";
import { notifyTurnContextChanged } from "@/lib/chat/turnContext";
import { integrations as CATALOG, type Integration } from "@/lib/integrationsData";
import { IntegrationLogo } from "./IntegrationRow";

const findApp = (slug: string): Integration | undefined =>
  CATALOG.find((i) => i.pipedreamSlug === slug || i.app === slug);

const titleFor = (slug: string) =>
  findApp(slug)?.name || slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const fallbackItem = (slug: string): Integration =>
  ({ id: slug, app: slug, name: titleFor(slug), description: "", type: "service" }) as Integration;

export default function AgentTools({
  query = "",
  onOpenApp,
}: {
  query?: string;
  onOpenApp?: (item: Integration) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [apps, setApps] = useState<ConnectedToolApp[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listToolApps();
      setApps(res.configured === false ? [] : res.apps ?? []);
    } catch {
      setApps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (app: ConnectedToolApp) => {
    const next = !app.enabled;
    setApps((prev) => prev.map((a) => (a.app === app.app ? { ...a, enabled: next } : a)));
    try {
      await setAppToolsEnabled(app.app, next);
      notifyTurnContextChanged();
    } catch (e: any) {
      setApps((prev) => prev.map((a) => (a.app === app.app ? { ...a, enabled: app.enabled } : a)));
      toast.error(e?.message || "Couldn't save");
    }
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter((a) => titleFor(a.app).toLowerCase().includes(q) || a.app.includes(q));
  }, [apps, query]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-foreground/65">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (visible.length === 0) return null;

  return (
    <div>
      {visible.map((app) => {
        const item = findApp(app.app) ?? fallbackItem(app.app);
        return (
          <div key={app.app} className="flex items-center gap-3 px-2 py-2.5" style={{ minHeight: 58 }}>
            <button
              type="button"
              onClick={() => onOpenApp?.(item)}
              className="flex min-w-0 flex-1 items-center gap-3 text-start"
              style={{ border: 0, background: "transparent" }}
            >
              <IntegrationLogo item={item} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-medium text-foreground">
                  {item.name}
                </span>
                <span
                  dir="auto"
                  className="mt-0.5 block truncate text-[11.5px] leading-[1.5] text-foreground/65"
                >
                  {app.account_name || (app.healthy ? "Connected" : "Needs reconnect")}
                </span>
              </span>
            </button>

            <button
              type="button"
              role="switch"
              aria-checked={app.enabled}
              aria-label={`Use ${item.name} in chat`}
              onClick={() => void toggle(app)}
              className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
                app.enabled ? "bg-primary" : "bg-foreground/15"
              }`}
              style={{ border: 0 }}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-background transition-all ${
                  app.enabled ? "start-[18px]" : "start-0.5"
                }`}
              />
            </button>
          </div>
        );
      })}
    </div>
  );
}
