import { createRoot } from "react-dom/client";
// Register route prefetch loaders (hover/focus/touch intent prefetching).
import "@/lib/routePrefetch.registry";
import { HelmetProvider } from "react-helmet-async";
import { LazyMotion } from "framer-motion";
// Keep `domMax` — the app uses drag/pan/layoutId across sidebars, sheets,
// and chat (see ChatPage, MobilePushShell, MobileBottomSheet, AppSidebar).
// Downgrading to `domAnimation` disables those features silently.
const loadMotionFeatures = () => import("framer-motion").then((m) => m.domMax);
// Start fetching the chat chunk in parallel with app boot. `/`, `/index` and
// `/chat` all render ChatPage, so by the time the router mounts the chunk is
// usually already in memory — no route-level loading state is ever painted.
// First visit ever → show the onboarding showcase instead of the chat.
// Runs before the router mounts so no chat frame is ever painted first.
const __hasSession = () => {
  try {
    if (localStorage.getItem("megsy_last_user_id")) return true;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token") && localStorage.getItem(k)) {
        return true;
      }
    }
  } catch {}
  return false;
};

const __firstVisitWelcome = (() => {
  try {
    if (typeof window === "undefined") return false;
    const p = window.location.pathname.replace(/\/+$/, "") || "/";
    if (p !== "/" && p !== "/index" && p !== "/chat") return false;
    if (localStorage.getItem("megsy_seen_welcome")) return false;
    // Signed-in users never see the first-run showcase, even on a new browser.
    if (__hasSession()) {
      localStorage.setItem("megsy_seen_welcome", "1");
      return false;
    }
    localStorage.setItem("megsy_seen_welcome", "1");
    window.history.replaceState(window.history.state, "", "/welcome");
    return true;
  } catch {
    return false;
  }
})();

if (!__firstVisitWelcome) void import("@/pages/chat/ChatPage");
else void import("@/pages/onboarding/WelcomeShowcasePage");
import App from "./App.tsx";
import { installTapReliability } from "@/lib/tapReliability";
import ClerkGate from "@/components/auth/ClerkGate";
import "./index.css";
import "./styles/claude-chat.css";
import "./styles/pwa-safe-area.css";
import "./styles/pwa-responsive.css";
import "./styles/font-fallback.css";
import "./styles/view-transitions.css";
import "./styles/megsy-tokens.css";
// Load the complete dark-only theme before first paint. Deferred injection
// caused a second full-page style pass and visible color flash.
import "./styles/deferred.css";
import "./styles/chat-legibility.css";
// Must remain last: prevents legacy/page-level mobile styles from restoring
// old button colours after the global sunset theme has loaded.
import "./styles/mobile-sunset-buttons.css";
// Light (white + pink) theme layer — must load after every legacy dark sheet.
import "./styles/light-theme.css";
// Device-tier layer — must load last so it can strip expensive decorative
// effects (blur, infinite animations) on weak devices without any other sheet
// re-adding them afterwards.
import "./styles/perf-tier.css";
import { applyPerfTier } from "@/lib/deviceCapability";

// Classify the device before React mounts so the first painted frame already
// uses the cheap variant on low-end hardware (no visible downgrade flash).
applyPerfTier();

// All fonts are loaded via Google Fonts <link> in index.html (Space Grotesk,
// DM Sans, Work Sans, Inter, Instrument Serif, Noto Serif Arabic, Cairo,
// Tajawal, Readex Pro). @fontsource imports were duplicating those payloads
// and blocking the JavaScript entry on slow mobile startup.

import { reportError, friendlyUserMessage, sanitizeErrorMessage } from "@/lib/errors";
import { toast as sonnerToast } from "sonner";
import { patchSupabaseAuth } from "@/integrations/supabase/patchAuth";
import { installGlobalLinkPrefetch } from "@/lib/globalLinkPrefetch";
import { registerAppServiceWorker } from "@/lib/registerSW";
import { installSnapshotCapture } from "@/lib/pageSnapshot";
import { initUserLang } from "@/lib/authI18n";
import { tryAutoLoginTelegram, isInsideTelegram, initTelegramWebApp } from "@/lib/telegramAuth";

// Notify the Telegram SDK we're ready as early as possible so `initData`
// is populated before the first sign-in attempt.
initTelegramWebApp();
import { initSentry, captureAppError } from "@/lib/sentry";

// Real-User Monitoring — Core Web Vitals (LCP/INP/CLS/TTFB/FCP) reported
// after first paint via requestIdleCallback so it never competes with LCP.
import { runOnIdle } from "@/lib/lazyOnIdle";
// Sentry + web-vitals are observability, never render-critical: both wait for
// idle so they can't delay the first paint on slow mobile devices. Errors that
// happen before Sentry boots are still caught by the window handlers below.
runOnIdle(() => {
  void initSentry();
  void import("@/lib/webVitals").then((m) => m.initWebVitals());
});

// Kick off language init early so <html lang/dir> and stored preference are
// applied before the first React paint. Runs async; result already lives in
// localStorage so useUserLang() will see it on the first render.
void initUserLang();

// If the app is opened inside Telegram (Mini App), auto-sign-in the user
// via /harmony/auth. Runs in the background — landing renders immediately
// and the session appears once the request completes.
if (typeof window !== "undefined" && isInsideTelegram()) {
  void tryAutoLoginTelegram();
}



// If Vercel ever serves the static 404 fallback before SPA rewrites apply,
// public/404.html redirects here with the original path encoded. Restore it
// before React Router mounts so deep links like /terms and /chat work normally.
(() => {
  try {
    const url = new URL(window.location.href);
    const spaPath = url.searchParams.get("__spa_path");
    if (!spaPath || !spaPath.startsWith("/") || spaPath.startsWith("//")) return;
    const restored = new URL(spaPath, window.location.origin);
    url.searchParams.forEach((value, key) => {
      if (key !== "__spa_path" && !restored.searchParams.has(key)) {
        restored.searchParams.set(key, value);
      }
    });
    window.history.replaceState(
      window.history.state,
      "",
      `${restored.pathname}${restored.search}${url.hash || restored.hash}`,
    );
  } catch {
    /* ignore */
  }
})();

patchSupabaseAuth();

// Defer non-critical global init to after first paint so it never blocks
// the initial React mount / hydration on slow devices.
const runIdle = (fn: () => void) => {
  const ric: any = (window as any).requestIdleCallback;
  if (typeof ric === "function") ric(fn, { timeout: 2000 });
  else setTimeout(fn, 300);
};
runIdle(() => {
  try { installGlobalLinkPrefetch(); } catch {}
  try { registerAppServiceWorker(); } catch {}
  try { installSnapshotCapture(); } catch {}
});



// Globally sanitize every toast message so we never leak provider names or
// the raw "Edge Function returned a non-2xx status code" string to users.
(() => {
  const cleanArg = (arg: unknown, isError = false): unknown => {
    if (arg == null) return arg;
    if (typeof arg === "string") {
      return isError ? friendlyUserMessage(arg, arg) : sanitizeErrorMessage(arg);
    }
    if (arg instanceof Error) {
      return isError ? friendlyUserMessage(arg) : sanitizeErrorMessage(arg);
    }
    return arg;
  };
  const wrap = <T extends (...a: any[]) => any>(fn: T, isError = false): T =>
    ((...args: any[]) => {
      args[0] = cleanArg(args[0], isError);
      if (args[1] && typeof args[1] === "object" && "description" in args[1]) {
        args[1] = { ...args[1], description: cleanArg(args[1].description, isError) };
      }
      return fn(...args);
    }) as T;
  const t = sonnerToast as any;
  t.error = wrap(t.error.bind(t), true);
  if (t.warning) t.warning = wrap(t.warning.bind(t), true);
  t.success = wrap(t.success.bind(t));
  if (t.info) t.info = wrap(t.info.bind(t));
  if (t.message) t.message = wrap(t.message.bind(t));
})();

// Prevent right-click context menu
// Prevent right-click context menu, except inside editable fields so users can copy/paste normally
document.addEventListener("contextmenu", (e) => {
  const t = e.target as HTMLElement | null;
  if (t && t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'))
    return;
  e.preventDefault();
});

// Report any unhandled error or promise rejection to the admin (best-effort).
let __lastReport = 0;
const __reportThrottled = (err: unknown, source: string) => {
  captureAppError(err, { source });
  const now = Date.now();
  if (now - __lastReport < 2000) return; // throttle bursts
  __lastReport = now;
  void reportError(err, { source });
};

// Only reload on true stale-chunk / module-load failures. DOM-mutation errors
// (insertBefore / removeChild / "not a child of this node") are usually caused
// by browser translation or transient React reconcile races — they must NOT
// trigger a full page reload, or the user experiences a hard refresh on every
// route change on mobile.
const __TRANSIENT_RE =
  /(Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk \d+ failed|ChunkLoadError|Loading CSS chunk)/i;
const __IGNORED_BROWSER_NOISE_RE = /ResizeObserver loop completed with undelivered notifications/i;
const __RELOAD_KEY = "__megsy_global_reloaded_at";
const __maybeReload = (err: unknown) => {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err ?? "");
  if (!__TRANSIENT_RE.test(msg)) return false;
  try {
    const last = Number(sessionStorage.getItem(__RELOAD_KEY) || 0);
    const now = Date.now();
    if (now - last < 60_000) return false;
    sessionStorage.setItem(__RELOAD_KEY, String(now));
    setTimeout(() => window.location.reload(), 60);
    return true;
  } catch {
    return false;
  }
};

window.addEventListener("error", (e) => {
  const err = e.error ?? e.message;
  if (__IGNORED_BROWSER_NOISE_RE.test(String(err ?? e.message ?? ""))) {
    e.preventDefault();
    return;
  }
  __reportThrottled(err, "window.onerror");
  __maybeReload(err);
});
window.addEventListener("unhandledrejection", (e) => {
  if (__IGNORED_BROWSER_NOISE_RE.test(String(e.reason ?? ""))) return;
  __reportThrottled(e.reason, "unhandledrejection");
  __maybeReload(e.reason);
});

// Apply saved user bubble color
const savedBubble = localStorage.getItem("userBubbleColor");
if (savedBubble) document.documentElement.style.setProperty("--user-bubble", savedBubble);

// Keep `position: fixed` elements pinned to the visual viewport on mobile
// (iOS Safari shifts fixed elements when the URL bar / keyboard show or hide).
// Components can read `--kb-offset` to translate themselves above the keyboard.
(() => {
  const vv = window.visualViewport;
  if (!vv) return;
  let raf = 0;
  const apply = () => {
    raf = 0;
    // True keyboard height = layout viewport bottom - visual viewport bottom.
    // Includes offsetTop so the bar doesn't drift when the visual viewport
    // is scrolled (iOS scrolls focused inputs into view).
    const delta = window.innerHeight - vv.height - vv.offsetTop;
    const offset = delta > 120 ? Math.round(delta) : 0;
    document.documentElement.style.setProperty("--kb-offset", `${offset}px`);
  };
  const update = () => {
    if (raf) return;
    raf = requestAnimationFrame(apply);
  };
  update();
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  window.addEventListener("orientationchange", update);
})();

// Global first-tap safety net for touch devices (see lib/tapReliability).
installTapReliability();

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <LazyMotion features={loadMotionFeatures} strict={false}>
      <ClerkGate>
        <App />
      </ClerkGate>
    </LazyMotion>
  </HelmetProvider>,
);
