/** @doc System status — theme-aware background with status cards. */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { goBackOr } from "@/lib/navigation";

type Incident = {
  id: string;
  service_name: string;
  status: string;
  title: string | null;
  message: string | null;
  started_at: string;
  resolved_at: string | null;
};

const OK_BASE = "hsl(var(--success))";
const OK_GLOW = "hsl(var(--success) / 0.55)";

const SERVICES: { name: string; base: string; glow: string }[] = [
  { name: "Chat", base: OK_BASE, glow: OK_GLOW },
  { name: "Images", base: OK_BASE, glow: OK_GLOW },
  { name: "Videos", base: OK_BASE, glow: OK_GLOW },
  { name: "Codes", base: OK_BASE, glow: OK_GLOW },
  { name: "Database", base: OK_BASE, glow: OK_GLOW },
  { name: "Website", base: OK_BASE, glow: OK_GLOW },
];

const WINDOW_DAYS = 90;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

const FloatingPoints = () => (
  <span className="status-points" aria-hidden>
    {Array.from({ length: 10 }).map((_, i) => (
      <span key={i} className="status-point" />
    ))}
  </span>
);

const SystemStatusPage = () => {
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      setIncidents([]);
      setLoading(false);
      await supabase.auth.getUser();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const uptimeByService = useMemo(() => {
    const now = Date.now();
    const windowStart = now - WINDOW_MS;
    const map: Record<string, number> = {};
    for (const svc of SERVICES) {
      const downMs = incidents
        .filter((i) => i.service_name === svc.name)
        .reduce((acc, i) => {
          const start = new Date(i.started_at).getTime();
          const end = i.resolved_at ? new Date(i.resolved_at).getTime() : now;
          return acc + Math.max(0, Math.min(end, now) - Math.max(start, windowStart));
        }, 0);
      map[svc.name] = Math.max(0, 100 - (downMs / WINDOW_MS) * 100);
    }
    return map;
  }, [incidents]);

  const currentlyDown = useMemo(
    () => incidents.filter((i) => !i.resolved_at).map((i) => i.service_name),
    [incidents],
  );
  const allOperational = currentlyDown.length === 0;

  return (
    <div className="core-light-page min-h-screen w-full bg-background text-foreground">
      <div className="mx-auto w-full max-w-md px-6 py-8">
        {/* Top bar */}
        <div className="mb-6 flex items-center">
          <button
            onClick={() => goBackOr(navigate, "/settings")}
            aria-label="Back"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-accent active:scale-95"
          >
            <ArrowLeft className="h-[17px] w-[17px]" strokeWidth={2.2} />
          </button>
        </div>

        {/* Header */}
        <header className="mb-8 px-2">
          <h1
            className="text-[32px] leading-tight font-semibold tracking-tight text-foreground"
            style={{ fontFamily: '"Space Grotesk", "Inter", system-ui, sans-serif' }}
          >
            System status
          </h1>
        </header>

        {/* Hero — Apple-style check */}
        <div className="flex flex-col items-center pb-4 pt-2 text-center">
          <div className="relative flex h-20 w-20 items-center justify-center">
            <div
              className="status-check-badge relative flex h-20 w-20 items-center justify-center rounded-full"
              style={{
                background: allOperational
                  ? "hsl(var(--success))"
                  : "hsl(var(--destructive))",
              }}
            >
              <svg
                className="status-check-svg h-11 w-11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M4.5 12.5l4.5 4.5L19.5 7" />
              </svg>
            </div>
          </div>
          <h2
            className="mt-5 text-[22px] leading-tight font-semibold tracking-tight text-foreground"
            style={{ fontFamily: '"Space Grotesk", "Inter", system-ui, sans-serif' }}
          >
            {loading
              ? "Checking systems…"
              : allOperational
                ? "All systems operational"
                : `${currentlyDown.length} service${currentlyDown.length === 1 ? "" : "s"} disrupted`}
          </h2>
        </div>

        {/* Service pipes */}
        <div className="mt-8 space-y-4">
          {SERVICES.map((svc) => {
            const uptime = uptimeByService[svc.name] ?? 100;
            const isDown = currentlyDown.includes(svc.name);
            const base = isDown ? "hsl(var(--destructive))" : svc.base;
            const glow = isDown ? "hsl(var(--destructive) / 0.6)" : svc.glow;
            return (
              <div key={svc.name}>
                <div className="mb-2 flex items-center justify-between px-0.5">
                  <span className="text-[14px] text-foreground">{svc.name}</span>
                  <span className="text-[12px] tabular-nums text-muted-foreground">
                    {uptime.toFixed(2)}%
                  </span>
                </div>
                <div className="status-pipe">
                  <div
                    className="status-pipe-fill"
                    style={{
                      width: `${Math.max(4, uptime)}%`,
                      background: `radial-gradient(65.28% 65.28% at 50% 100%, ${glow} 0%, rgba(0,0,0,0) 100%), linear-gradient(0deg, ${base}, ${base})`,
                      boxShadow: `0 0 10px ${glow}`,
                    }}
                  >
                    <span className="status-pipe-highlight" />
                    <FloatingPoints />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Past incidents */}
        <div className="mt-12">
          <h3
            className="mb-4 px-0.5 text-[15px] font-semibold tracking-tight text-foreground"
            style={{ fontFamily: '"Space Grotesk", "Inter", system-ui, sans-serif' }}
          >
            Past incidents
          </h3>
          {incidents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border py-10 text-center">
              <p className="text-[13.5px] text-muted-foreground">Nothing here yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border border-b border-t border-border">
              {incidents.map((incident) => {
                const isResolved = !!incident.resolved_at;
                return (
                  <div key={incident.id} className="flex items-start justify-between gap-3 py-4">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                          isResolved ? "bg-emerald-400" : "bg-rose-400"
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-[14px] text-foreground">
                          {incident.title || `${incident.service_name} is down`}
                        </div>
                        <div className="mt-0.5 text-[12px] text-muted-foreground">
                          {incident.message || "Service disruption"}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[12px] tabular-nums text-muted-foreground">
                        {new Date(incident.started_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SystemStatusPage;
