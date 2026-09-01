/** @doc Shared Capabilities settings — persistent, cross-tab, event-driven. */
import { useEffect, useState, useCallback } from "react";

export type ToolAccess = "auto" | "on_demand" | "always";

export type CapabilitiesState = {
  artifacts: boolean;
  codeExec: boolean;
  webSearch: boolean;
  switchOnFlag: boolean;
  generateMemory: boolean;
  toolAccess: ToolAccess;
  memoryUpdatedAt: number | null;
};

export const CAPABILITIES_STORAGE_KEY = "megsy_capabilities_v1";
export const CAPABILITIES_EVENT = "megsy:capabilities-change";

export const CAPABILITIES_DEFAULTS: CapabilitiesState = {
  artifacts: true,
  codeExec: true,
  webSearch: true,
  switchOnFlag: true,
  generateMemory: true,
  toolAccess: "auto",
  memoryUpdatedAt: null,
};

export function loadCapabilities(): CapabilitiesState {
  try {
    const raw = localStorage.getItem(CAPABILITIES_STORAGE_KEY);
    if (!raw) return CAPABILITIES_DEFAULTS;
    return { ...CAPABILITIES_DEFAULTS, ...(JSON.parse(raw) as Partial<CapabilitiesState>) };
  } catch {
    return CAPABILITIES_DEFAULTS;
  }
}

export function saveCapabilities(next: CapabilitiesState) {
  try {
    localStorage.setItem(CAPABILITIES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  try {
    window.dispatchEvent(new CustomEvent<CapabilitiesState>(CAPABILITIES_EVENT, { detail: next }));
  } catch {
    /* ignore */
  }
}

export function useCapabilities() {
  const [state, setState] = useState<CapabilitiesState>(CAPABILITIES_DEFAULTS);

  useEffect(() => {
    setState(loadCapabilities());
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<CapabilitiesState>).detail;
      if (detail) setState(detail);
      else setState(loadCapabilities());
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === CAPABILITIES_STORAGE_KEY) setState(loadCapabilities());
    };
    window.addEventListener(CAPABILITIES_EVENT, onCustom as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CAPABILITIES_EVENT, onCustom as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const update = useCallback(<K extends keyof CapabilitiesState>(key: K, value: CapabilitiesState[K]) => {
    setState((prev) => {
      const next = { ...prev, [key]: value };
      saveCapabilities(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    saveCapabilities(CAPABILITIES_DEFAULTS);
    setState(CAPABILITIES_DEFAULTS);
  }, []);

  return { state, update, reset };
}

/** Human-readable relative time. */
export function formatRelative(ts: number | null): string {
  if (!ts) return "Not yet used";
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  const mo = Math.floor(d / 30);
  return `${mo} month${mo === 1 ? "" : "s"} ago`;
}
