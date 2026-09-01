import { useCallback, useEffect, useState } from "react";

export type WebSearchMode = "on" | "off" | "auto";

const STORAGE_KEY = "megsy:web-search-mode";
const EVENT = "megsy:web-search-mode-change";

export const WEB_SEARCH_MODES: { id: WebSearchMode; label: string; desc: string }[] = [
  { id: "on", label: "On", desc: "Always search the web before answering" },
  { id: "off", label: "Off", desc: "Never search, answer from the model only" },
  { id: "auto", label: "Auto", desc: "Search only when the question needs fresh info" },
];

export function getWebSearchMode(): WebSearchMode {
  if (typeof window === "undefined") return "auto";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "on" || v === "off" || v === "auto" ? v : "auto";
}

export function setWebSearchMode(mode: WebSearchMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, mode);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: mode }));
}

export function useWebSearchMode() {
  const [mode, setMode] = useState<WebSearchMode>(() => getWebSearchMode());

  useEffect(() => {
    const sync = () => setMode(getWebSearchMode());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback((next: WebSearchMode) => {
    setWebSearchMode(next);
    setMode(next);
  }, []);

  return [mode, update] as const;
}
