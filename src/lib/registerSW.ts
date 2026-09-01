/** @doc Guarded service-worker registration.
 *  Registers the vite-plugin-pwa generated /sw.js for offline support only
 *  in production, outside iframes, outside Lovable preview/dev hosts, and
 *  never when ?sw=off is in the URL. The Megsy Push worker
 *  (/megsy-push-sw.js) is registered separately in src/lib/push/subscribe.ts
 *  and is untouched by this module. */

function isRefusedContext(): boolean {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.PROD) return true;
  try {
    if (window.top !== window.self) return true;
  } catch {
    return true;
  }
  const h = window.location.hostname;
  if (
    h.startsWith("id-preview--") ||
    h.startsWith("preview--") ||
    h === "lovableproject.com" ||
    h.endsWith(".lovableproject.com") ||
    h === "lovableproject-dev.com" ||
    h.endsWith(".lovableproject-dev.com") ||
    h === "beta.lovable.dev" ||
    h.endsWith(".beta.lovable.dev")
  ) return true;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  return false;
}

async function unregisterAppSw(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) {
      const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
      // Only touch our app SW paths; leave megsy-push-sw.js alone.
      if (/\/sw\.js(\?|$)/.test(url) || /\/service-worker\.js(\?|$)/.test(url)) {
        try { await r.unregister(); } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
}

export function registerAppServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (isRefusedContext()) {
    void unregisterAppSw();
    return;
  }
  if (!("serviceWorker" in navigator)) return;

  const run = async () => {
    try {
      // Dynamic import so vite-plugin-pwa's virtual module is only pulled
      // in when we actually register.
      const mod = await import("virtual:pwa-register");
      mod.registerSW({ immediate: true });
    } catch {
      // Fallback: direct registration if the virtual module isn't present.
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch { /* ignore */ }
    }
  };

  const schedule = () => {
    const ric = (window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
    }).requestIdleCallback;
    if (ric) ric(() => void run(), { timeout: 3000 });
    else window.setTimeout(() => void run(), 1500);
  };

  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
}
