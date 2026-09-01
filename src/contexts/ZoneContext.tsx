/** @doc ZoneContext — provides the active zone (Megsy / China) across the app. */
import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { ZONES, ZONE_LIST, ZoneConfig, ZoneId, detectZoneFromHostname } from "@/config/zones";

const STORAGE_KEY = "active_zone";

interface ZoneContextValue {
  zone: ZoneId;
  config: ZoneConfig;
  zones: ZoneConfig[];
  setZone: (zone: ZoneId) => void;
}

const ZoneContext = createContext<ZoneContextValue | null>(null);

function resolveInitialZone(): ZoneId {
  if (typeof window === "undefined") return "megsy";
  const fromHost = detectZoneFromHostname(window.location.hostname);
  if (fromHost !== "megsy") return fromHost;
  return "megsy";
}

export function ZoneProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [zone, setZoneState] = useState<ZoneId>(() => resolveInitialZone());

  const setZone = (next: ZoneId) => {
    if (ZONES[next]?.soon) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    setZoneState(next);
    try {
      (window as any).__MEGSY_ZONE__ = next;
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const next = resolveInitialZone();
    if (next !== zone) setZoneState(next);
    try {
      (window as any).__MEGSY_ZONE__ = next;
      document.documentElement.dataset.zone = next;
    } catch {
      /* ignore */
    }
  }, [location.pathname, zone]);

  const value = useMemo<ZoneContextValue>(
    () => ({
      zone,
      config: ZONES[zone],
      zones: ZONE_LIST,
      setZone,
    }),
    [zone],
  );

  return <ZoneContext.Provider value={value}>{children}</ZoneContext.Provider>;
}

export function useZone(): ZoneContextValue {
  const ctx = useContext(ZoneContext);
  if (!ctx) {
    return {
      zone: "megsy",
      config: ZONES.megsy,
      zones: ZONE_LIST,
      setZone: () => {},
    };
  }
  return ctx;
}
