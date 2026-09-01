/**
 * @doc Facebook-style route prefetching: hover/focus a link → the route
 * chunk begins downloading in the background, so the click feels instant.
 * Shared across the sidebar and landing navigation so every entry point
 * warms the same cache exactly once.
 */
import { useCallback } from "react";

// Module-scoped cache — shared across every consumer of the hook so the
// same route never gets fetched twice, no matter which surface triggered it.
const routePreloadCache = new Map<string, Promise<unknown>>();

const strip = (path: string) => path.split(/[?#]/)[0].replace(/\/+$/, "") || "/";

const importForPath = (key: string): Promise<unknown> | null => {
  if (key.startsWith("/chat") || key.startsWith("/build")) {
    return import("@/pages/chat/ChatPage");
  }
  if (key.startsWith("/settings/referrals")) {
    return import("@/pages/billing/ReferralsPage");
  }
  if (key.startsWith("/settings/billing")) {
    return import("@/pages/billing/BillingPage");
  }
  if (key.startsWith("/settings/profile/edit")) {
    return import("@/pages/settings/ProfileEditPage");
  }
  if (key.startsWith("/settings/security")) {
    return import("@/pages/settings/SecuritySettingsPage");
  }
  if (key.startsWith("/settings")) {
    return import("@/pages/settings/SettingsPage");
  }
  if (key.startsWith("/pricing")) {
    return import("@/pages/marketing/PricingPage");
  }
  if (
    key === "/auth" ||
    key === "/login" ||
    key === "/signin" ||
    key === "/signup" ||
    key === "/register"
  ) {
    return import("@/pages/auth/AuthPage");
  }
  return null;
};

export const prefetchRoute = (path: string): Promise<unknown> => {
  const key = strip(path);
  const cached = routePreloadCache.get(key);
  if (cached) return cached;
  const task = importForPath(key);
  const promise = (task ?? Promise.resolve()).catch(() => undefined);
  routePreloadCache.set(key, promise);
  return promise;
};

/**
 * Returns hover/focus handlers ready to spread onto a link, button, or row.
 * The prefetch is fire-and-forget and idempotent — safe to attach anywhere.
 *
 *   const prefetch = usePrefetchRoute();
 *   <button {...prefetch("/pricing")}>Pricing</button>
 */
export function usePrefetchRoute() {
  return useCallback((path: string) => {
    const handler = () => {
      void prefetchRoute(path);
    };
    return {
      onMouseEnter: handler,
      onFocus: handler,
      onTouchStart: handler,
    };
  }, []);
}

export default usePrefetchRoute;