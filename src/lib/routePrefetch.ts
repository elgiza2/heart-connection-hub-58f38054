/**
 * Route prefetch registry (Facebook-style intent-based prefetching).
 *
 * How it works:
 *   - Each entry maps a pathname pattern to the same dynamic import() the
 *     router uses. Calling `prefetchRoute("/chat")` fires the import; the
 *     browser caches the chunk so the real navigation is instant.
 *   - `import()` is idempotent — repeated calls resolve from the module cache.
 *   - Prefetches run at low priority via requestIdleCallback (falls back to
 *     setTimeout) so they never fight the main thread.
 *   - Skipped on slow networks / data-saver / when the user is already on the
 *     target route.
 */

type Loader = () => Promise<unknown>;
type Entry = { match: RegExp; load: Loader };

const registry: Entry[] = [];
const inflight = new Set<string>();

export function registerRoute(pattern: RegExp | string, load: Loader): void {
  const match = typeof pattern === "string"
    ? new RegExp("^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$")
    : pattern;
  registry.push({ match, load });
}

function shouldSkip(): boolean {
  if (typeof navigator === "undefined") return true;
  // Respect Save-Data / slow networks.
  const conn = (navigator as any).connection;
  if (conn?.saveData) return true;
  if (conn?.effectiveType && /2g/i.test(conn.effectiveType)) return true;
  return false;
}

function schedule(fn: () => void): void {
  const ric = (globalThis as any).requestIdleCallback;
  if (typeof ric === "function") {
    ric(fn, { timeout: 500 });
  } else {
    setTimeout(fn, 0);
  }
}

/**
 * Prefetch every chunk registered for the given pathname. Safe to call on
 * every hover — deduped by pathname + module cache.
 */
export function prefetchRoute(pathname: string): void {
  if (!pathname || shouldSkip()) return;
  if (typeof window !== "undefined" && window.location.pathname === pathname) return;
  if (inflight.has(pathname)) return;
  inflight.add(pathname);

  schedule(() => {
    for (const { match, load } of registry) {
      if (match.test(pathname)) {
        // Fire and forget. Errors are swallowed — the real navigation will
        // retry through lazyWithRetry.
        Promise.resolve()
          .then(load)
          .catch(() => void 0);
      }
    }
  });
}

/**
 * Immediately trigger a set of loaders (e.g. after login when we know the
 * user is heading into the app). Ignores network hints.
 */
export function warmChunks(loaders: Loader[]): void {
  for (const l of loaders) {
    Promise.resolve().then(l).catch(() => void 0);
  }
}
