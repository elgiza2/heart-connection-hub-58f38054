import { useEffect } from "react";
import { prefetchRoute } from "@/lib/routePrefetch";

/**
 * Warm route chunks after the current page becomes idle. Use for known
 * next-hop destinations (e.g. landing → /auth → /chat).
 *
 * Runs once per mount, respects Save-Data / slow networks (via prefetchRoute),
 * and skips the current pathname automatically.
 */
export function usePrefetchOnIdle(paths: string[], delayMs = 1500): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = window.setTimeout(() => {
      for (const p of paths) prefetchRoute(p);
    }, delayMs);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths.join("|"), delayMs]);
}
