import { useCallback, useEffect, useState } from "react";

export type RuntimeLog = {
  id: string;
  level: "error" | "warn";
  message: string;
  at: number;
};

/**
 * Listens for runtime errors/console output forwarded from the generated
 * preview iframe (see buildReactRuntime.ts, which posts `megsy:runtime-error`
 * and `megsy:runtime-console`). Without this, generated sites failed silently.
 */
export function useRuntimeErrors(active = true) {
  const [logs, setLogs] = useState<RuntimeLog[]>([]);

  const clear = useCallback(() => setLogs([]), []);

  useEffect(() => {
    if (!active) return;
    const onMessage = (e: MessageEvent) => {
      const d = e.data as any;
      if (!d || typeof d !== "object") return;
      let level: RuntimeLog["level"] | null = null;
      let message = "";
      if (d.type === "megsy:runtime-error") {
        level = "error";
        message = String(d.message ?? "Unknown runtime error");
      } else if (d.type === "megsy:runtime-console") {
        level = d.level === "warn" ? "warn" : "error";
        message = String(d.message ?? "");
      } else if (d.type === "megsy:runtime-ready") {
        setLogs([]);
        return;
      }
      if (!level || !message.trim()) return;
      setLogs((prev) => {
        if (prev.some((l) => l.message === message && l.level === level)) return prev;
        return [
          ...prev.slice(-49),
          { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, level, message, at: Date.now() },
        ];
      });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [active]);

  return { logs, clear };
}
