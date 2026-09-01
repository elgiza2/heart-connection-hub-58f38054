import { useEffect, useState, useTransition, useDeferredValue } from "react";
import { Routes, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import PageTransition from "@/components/common/PageTransition";
import { usePromoBanner } from "@/components/promo/usePromoBanner";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";
import { useTrackInAppNavigation } from "@/hooks/useSmartBack";
import { pathForZone, stripZonePrefix } from "@/lib/zoneRouting";
import { bootstrapAuth, getAuthState, subscribeAuthState } from "@/lib/authStore";
import { UnlimitedPromoBanner } from "./lazyPages";
// Redirect legacy /tools/<slug> to /images/tools/<slug>
export const LegacyToolsRedirect = () => {
  const location = useLocation();
  const rest = location.pathname.replace(/^\/tools/, "");
  return <Navigate to={`/images/tools${rest}`} replace />;
};

/**
 * Retired route redirect. Instead of silently swapping the URL, we tell the
 * user the page has moved so the navigation never feels broken.
 */
export const RetiredRedirect = ({ to }: { to: string }) => {
  const location = useLocation();
  useEffect(() => {
    toast.message("This page has moved", {
      description: `${location.pathname} is no longer available — taking you to ${to}.`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <Navigate to={to} replace />;
};

export const LegacyAiRedirect = () => {
  const location = useLocation();
  const rest = location.pathname.replace(/^\/ai/, "");
  return <Navigate to={`/l${rest}`} replace />;
};


const SkeletonBar = ({ className = "" }: { className?: string }) => (
  <div className={`ng-shimmer rounded-md bg-foreground/10 ${className}`} aria-hidden="true" />
);

/**
 * Route-level loading state. Instead of a centred spinner on an empty page
 * (which reads as "frozen" for multi-second chunk loads), we paint the real
 * chat shell as a skeleton: sidebar rail, message column and composer. The
 * layout therefore never shifts once the actual page mounts.
 */
export const LazyFallback = () => {
  const location = useLocation();
  const isChatRoute =
    location.pathname === "/" ||
    location.pathname === "/chat" ||
    location.pathname === "/index" ||
    location.pathname === "/showcase";

  if (!isChatRoute) {
    return (
      <div
        className="min-h-dvh bg-background text-foreground flex flex-col gap-4 p-6"
        role="status"
        aria-busy="true"
      >
        <span className="sr-only">Loading</span>
        <SkeletonBar className="h-8 w-48" />
        <SkeletonBar className="h-4 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBar key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-dvh bg-background text-foreground flex overflow-hidden"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">Preparing your workspace</span>

      {/* Sidebar rail */}
      <div className="hidden md:flex w-[260px] shrink-0 flex-col gap-3 border-e border-border p-4">
        <SkeletonBar className="h-9 w-full" />
        <SkeletonBar className="h-4 w-24 mt-2" />
        {Array.from({ length: 7 }).map((_, i) => (
          <SkeletonBar key={i} className="h-7 w-full" />
        ))}
      </div>

      {/* Conversation column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <SkeletonBar className="h-8 w-8 rounded-full md:hidden" />
          <SkeletonBar className="h-6 w-40" />
          <SkeletonBar className="h-8 w-8 rounded-full" />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4">
          <SkeletonBar className="h-10 w-10 rounded-full" />
          <SkeletonBar className="h-6 w-56" />
          <SkeletonBar className="h-4 w-40" />
        </div>

        <div className="px-3 pb-5 pt-2">
          <div className="mx-auto w-full max-w-3xl space-y-2">
            <SkeletonBar className="h-[52px] w-full rounded-2xl" />
            <div className="flex gap-2 overflow-hidden">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonBar key={i} className="h-8 w-20 rounded-full shrink-0" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};



// Route rendering with a deferred location. While the next route's lazy chunk
// (or data) is still loading, React keeps the PREVIOUS page painted instead of
// unmounting it and falling back to an empty Suspense boundary — which is what
// produced the black flash between pages. A thin top progress bar signals the
// pending navigation so the app still feels responsive.
export const DeferredRoutes = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const deferredLocation = useDeferredValue(location);
  const isPending = deferredLocation !== location;
  useTrackInAppNavigation();

  useEffect(() => {
    const root = document.documentElement;
    if (isPending) root.setAttribute("data-nav-pending", "true");
    else root.removeAttribute("data-nav-pending");
    return () => root.removeAttribute("data-nav-pending");
  }, [isPending]);

  return (
    <PageTransition location={deferredLocation}>
      <Routes location={deferredLocation}>{children}</Routes>
    </PageTransition>
  );
};


export const PromoBannerGate = () => {
  const { hidden } = usePromoBanner();
  const location = useLocation();
  const [sidebarCollapsed] = useSidebarCollapsed();
  const appPath = stripZonePrefix(location.pathname);
  const landingPaths = ["/", "/landing"];
  if (hidden) return null;
  if (landingPaths.includes(appPath)) return null;
  const isChatSurface = appPath.startsWith("/chat");
  const chatSurfaceOffset = isChatSurface ? (sidebarCollapsed ? 60 : 280) : 0;
  return <UnlimitedPromoBanner chatSurfaceOffset={chatSurfaceOffset} />;
};


// Preload the most-likely next routes AND the heavy shared chunks (icons,
// framer-motion, lucide-react) during idle time so navigation from the
// landing page feels instant. Since we made those shared chunks lazy to
// speed up first paint, we must warm them ASAP or the first click into any
// authenticated page has to fetch ~1 MB before rendering.
export const preloadCommonRoutes = () => {
  const isMobile =
    typeof window !== "undefined" &&
    window.matchMedia?.("(hover: none) and (pointer: coarse)").matches;

  const connection = (navigator as unknown as {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  const slowConnection =
    connection?.saveData === true || /(^|-)2g$|slow-2g/i.test(connection?.effectiveType || "");
  if (slowConnection) return;

  // 1) Warm heavy shared chunks first — every real page uses them, so
  //    fetching them once here means later route loads are chunk-only.
  //    NOTE: never `import("lucide-react")` here — a dynamic barrel import
  //    defeats tree-shaking and drags the ENTIRE icon library (600 kB) into
  //    the shared chunk. The `icons` chunk is warmed for free by the route
  //    chunks below, which import only the icons they render.
  const warmShared: Array<() => Promise<unknown>> = [];

  // 2) Then warm the most-likely destination routes.
  const routeTasks: Array<() => Promise<unknown>> = isMobile
    ? [() => import("@/pages/auth/AuthPage")]
    : [
        () => import("@/pages/chat/ChatPage"),
        () => import("@/pages/auth/AuthPage"),
        () => import("@/pages/marketing/PricingPage"),
      ];

  const tasks = isMobile ? routeTasks : [...warmShared, ...routeTasks];
  const run = () => {
    tasks.forEach((t, i) => {
      // Shared chunks fire immediately (i=0,1). Route chunks staggered by
      // 250ms so they don't compete with each other on slow connections.
      window.setTimeout(() => {
        t().catch(() => {});
      }, i * (isMobile ? 900 : 500));
    });
  };
  const ric = (
    window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void;
    }
  ).requestIdleCallback;
  if (typeof ric === "function") ric(run, { timeout: 4500 });
  else window.setTimeout(run, 1800);
};
if (typeof window !== "undefined") {
  // Kick off shared-chunk warming as soon as first paint is likely done —
  // ~400 ms after `load` is short enough that even fast clickers find the
  // shared chunks in cache, but long enough not to fight LCP.
  if (document.readyState === "complete") {
    window.setTimeout(preloadCommonRoutes, 1400);
  } else {
    window.addEventListener("load", () => window.setTimeout(preloadCommonRoutes, 1400), {
      once: true,
    });
  }
}

// Scroll to top on every route change
export const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    // Safety net: clear any stale scroll-locks left behind by dialogs/drawers
    // (Radix/vaul set these on <body>; if a modal was open during navigation
    // the page can arrive with scrolling frozen, especially on mobile).
    const b = document.body;
    if (b.style.overflow === "hidden") b.style.overflow = "";
    if (b.style.position === "fixed") {
      b.style.position = "";
      b.style.top = "";
    }
    if (b.style.touchAction) b.style.touchAction = "";
    if (b.style.pointerEvents === "none") b.style.pointerEvents = "";
    b.removeAttribute("data-scroll-locked");
    const h = document.documentElement;
    if (h.style.overflow === "hidden") h.style.overflow = "";
    if (h.style.touchAction) h.style.touchAction = "";
    if (h.style.pointerEvents === "none") h.style.pointerEvents = "";
    h.classList.remove("lenis-stopped");
  }, [pathname]);
  return null;
};

export const InternalLinkInterceptor = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [, startNav] = useTransition();

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;

      const rawHref = anchor.getAttribute("href");
      if (
        !rawHref ||
        rawHref.startsWith("#") ||
        rawHref.startsWith("mailto:") ||
        rawHref.startsWith("tel:") ||
        rawHref.startsWith("javascript:") ||
        anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self")
      ) {
        return;
      }

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;

      const nextPath = `${url.pathname}${url.search}${url.hash}`;
      const currentPath = `${location.pathname}${location.search}${location.hash}`;
      if (nextPath === currentPath) return;

      event.preventDefault();
      startNav(() => navigate(nextPath));
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [location.hash, location.pathname, location.search, navigate, startNav]);

  return null;
};

export const DodoReturnRedirect = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (params.get("dodo_return") === "1") {
      const next = new URLSearchParams(params);
      next.delete("dodo_return");
      navigate(`/billing/success?${next.toString()}`, { replace: true });
    } else if (params.get("checkout_cancelled") === "1") {
      navigate("/pricing", { replace: true });
    }
  }, [navigate, params]);

  return null;
};

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  bootstrapAuth();
  const [state, setState] = useState(getAuthState);

  useEffect(() => {
    setState(getAuthState());
    const unsubscribe = subscribeAuthState(setState);
    return () => {
      unsubscribe();
    };
  }, []);

  const location = useLocation();

  if (!state.resolved) return null;
  if (!state.authenticated) return <Navigate to={pathForZone("/auth", location.pathname)} replace />;
  return <>{children}</>;
};

