import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { integrations as CATALOG, type Integration } from "@/lib/integrationsData";
import {
  loadIntegrationConnections,
  startIntegrationConnection,
  disconnectIntegration,
  waitForConnectionRefresh,
} from "@/lib/integrationBackend";
import IntegrationRow from "./integrations/IntegrationRow";
import IntegrationDetail from "./integrations/IntegrationDetail";
import EmptyConnectors from "./integrations/EmptyConnectors";
import McpTab from "./integrations/McpTab";
import AgentTools from "./integrations/AgentTools";
import AppActionsPanel from "./integrations/AppActionsPanel";
import ApiAppsTab from "./integrations/ApiAppsTab";
import ApiAppDetail from "./integrations/ApiAppDetail";
import type { ApiApp } from "@/lib/apiApps/types";

const DraggablePlusSheet = lazy(() =>
  import("@/pages/chat/components/DraggablePlusSheet").then((m) => ({
    default: m.DraggablePlusSheet,
  })),
);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Tab = "tools" | "apis" | "mcp";

const TABS: { id: Tab; label: string }[] = [
  { id: "tools", label: "Tools" },
  { id: "apis", label: "APIs" },
  { id: "mcp", label: "MCP" },
];



const SLIDE = { duration: 0.22, ease: [0.32, 0.72, 0, 1] as const };

/**
 * Connectors sheet — same container, physics and surface as the composer "+"
 * menu: opens compact, expands on scroll, drag anywhere to dismiss.
 */
export default function IntegrationsSheet({ open, onOpenChange }: Props) {
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("tools");
  const [busy, setBusy] = useState<string | null>(null);
  const [detail, setDetail] = useState<Integration | null>(null);
  const [apiDetail, setApiDetail] = useState<ApiApp | null>(null);
  const [apiReload, setApiReload] = useState(0);
  const [size, setSize] = useState({ height: 600, collapsedY: 200 });

  const refresh = async () => {
    try {
      const snap = await loadIntegrationConnections(CATALOG);
      setConnected(snap.connectedApps || {});
      return snap.connectedApps || {};
    } catch {
      return {};
    }
  };

  useEffect(() => {
    if (!open) {
      setDetail(null);
      setApiDetail(null);
      setQuery("");
      return;
    }
    void refresh();
    const vh = window.innerHeight;
    const expandedH = Math.min(vh * 0.8, vh - 72);
    const collapsedH = Math.max(360, Math.min(vh * 0.55, expandedH));
    setSize({ height: expandedH, collapsedY: Math.max(0, expandedH - collapsedH) });

  }, [open]);

  const list = useMemo(() => {
    const base = CATALOG;
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (i) => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q),
    );
  }, [query, tab]);

  
  const restList = list.filter((i) => !connected[i.app]);

  const toggle = async (item: Integration) => {
    setBusy(item.app);
    try {
      if (connected[item.app]) {
        await disconnectIntegration(item);
        await refresh();
        toast.success(`Disconnected ${item.name}`);
      } else {
        const res = await startIntegrationConnection(item);
        if ("popup" in res && res.popup) {
          await waitForConnectionRefresh(async () => {
            const apps = await refresh();
            return !!apps[item.app];
          }, res.popup);
        } else {
          await refresh();
        }
        toast.success(`Connected ${item.name}`);
      }
    } catch (e: any) {
      toast.error(e?.message || "Couldn't complete the action");
    } finally {
      setBusy(null);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[55] bg-transparent"
            onClick={() => onOpenChange(false)}
          />
          <Suspense fallback={null}>
            <DraggablePlusSheet
              height={size.height}
               collapsedY={detail || apiDetail ? 0 : size.collapsedY}
              bottomOffset={0}
              initialExpanded={false}
               view={apiDetail ? `api-${apiDetail.id}` : detail ? `detail-${detail.id}` : tab}
              sheetKind="integrations"
              onClose={() => onOpenChange(false)}
            >
              <div className="flex min-h-full flex-col">
                <AnimatePresence mode="wait" initial={false}>
                  {apiDetail ? (
                    <motion.div
                      key="api-detail"
                      initial={{ x: -24, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: -24, opacity: 0 }}
                      transition={SLIDE}
                      className="flex min-h-full flex-col"
                    >
                      <ApiAppDetail
                        app={apiDetail}
                        onBack={() => setApiDetail(null)}
                        onChanged={() => setApiReload((n) => n + 1)}
                        onUse={() => onOpenChange(false)}
                      />
                    </motion.div>
                  ) : detail ? (
                    <motion.div
                      key="detail"
                      initial={{ x: -24, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: -24, opacity: 0 }}
                      transition={SLIDE}
                      className="flex min-h-full flex-col"
                    >
                      <IntegrationDetail
                        item={detail}
                        connected={!!connected[detail.app]}
                        busy={busy === detail.app}
                        onBack={() => setDetail(null)}
                        onToggle={() => void toggle(detail)}
                      >
                        {connected[detail.app] && (
                          <AppActionsPanel
                            slug={detail.pipedreamSlug || detail.app}
                            appName={detail.name}
                            onUse={() => onOpenChange(false)}
                          />
                        )}
                      </IntegrationDetail>

                    </motion.div>
                   ) : (

                    <motion.div
                      key="list"
                      initial={{ x: 24, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: 24, opacity: 0 }}
                      transition={SLIDE}
                      className="flex min-h-full flex-col"
                    >
                      <h2 className="px-2 pb-3 text-center text-[16px] font-semibold text-foreground">
                        Integrations
                      </h2>

                      <div data-connectors-search className="flex h-11 items-center gap-2 rounded-[16px] px-3.5">
                        <Search className="h-4 w-4 shrink-0 text-foreground/65" />
                        <input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Search for an app"
                          className="h-full w-full text-[14px] text-foreground outline-none placeholder:text-foreground/65"
                          style={{
                            border: 0,
                            outline: "none",
                            boxShadow: "none",
                            background: "transparent",
                            borderRadius: 0,
                            padding: 0,
                            height: "100%",
                            minHeight: 0,
                            WebkitAppearance: "none",
                            appearance: "none",
                            touchAction: "auto",
                          }}
                        />
                      </div>

                      <div className="mt-3 flex gap-1 rounded-[14px] bg-foreground/[0.04] p-1">
                        {TABS.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setTab(t.id)}
                            className={`flex-1 rounded-[11px] py-2 text-[13px] transition-colors ${
                              tab === t.id
                                ? "bg-background font-medium text-foreground"
                                : "bg-transparent text-foreground/50"
                            }`}
                            style={{ border: 0 }}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>

                      <div className="mt-2 flex-1">
                        {tab === "apis" ? (
                          <ApiAppsTab
                            query={query}
                            reloadKey={apiReload}
                            onOpen={(app) => setApiDetail(app)}
                            onCreateFromChat={() => {
                              window.dispatchEvent(
                                new CustomEvent("megsy:composer-insert", {
                                  detail: {
                                    text: "Connect an API app for me: ",
                                  },
                                }),
                              );
                              onOpenChange(false);
                            }}
                          />
                        ) : tab === "mcp" ? (
                          <McpTab
                            query={query}
                            onCreateFromChat={() => {
                              window.dispatchEvent(
                                new CustomEvent("megsy:composer-insert", {
                                  detail: {
                                    text: "Add an MCP server for me: ",
                                  },
                                }),
                              );
                              onOpenChange(false);
                            }}
                          />
                        ) : list.length === 0 ? (
                          <EmptyConnectors label="No results" />
                        ) : (
                          <>
                            <div className="mb-3">
                              <AgentTools query={query} onOpenApp={(item) => setDetail(item)} />
                            </div>


                            {restList.map((item) => (
                              <IntegrationRow
                                key={item.id}
                                item={item}
                                connected={false}
                                busy={busy === item.app}
                                onOpen={() => setDetail(item)}
                              />
                            ))}
                          </>
                        )}
                      </div>

                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </DraggablePlusSheet>
          </Suspense>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
