import { useEffect, useState, Suspense } from "react";
import { BrowserRouter } from "react-router-dom";

import { TooltipProvider } from "@/components/ui/tooltip";
import { CostConfirmationHost } from "@/components/billing/CostConfirmationHost";
import ErrorBoundary, { RouteErrorBoundary } from "@/components/common/ErrorBoundary";
import TranslationWrapper from "@/components/common/TranslationWrapper";
import MarketingTypographyScope from "@/components/common/MarketingTypographyScope";
import { PromoBannerProvider } from "@/components/promo/PromoBannerContext";
import { ZoneProvider } from "@/contexts/ZoneContext";
import { ConfirmProvider } from "@/components/common/ConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import { subscribeAuthEvents } from "@/lib/authStore";
import { clearAllSnapshots } from "@/lib/pageSnapshot";

import {
  CommandPalette,
  ShortcutsHelp,
  SettingsShell,
  OfflineBanner,
  Analytics,
  SpeedInsights,
} from "@/routes/lazyPages";
import {
  LazyFallback,
  DeferredRoutes,
  ScrollToTop,
  InternalLinkInterceptor,
  DodoReturnRedirect,
} from "@/routes/routeHelpers";
import { AppRoutes } from "@/routes/AppRoutes";
import { applyTheme } from "@/lib/theme";
import { lazyWithRetry } from "@/lib/lazyWithRetry";

/** Watches background jobs / agent runs and notifies the user when they finish. */
const BackgroundJobNotifier = lazyWithRetry(
  () => import("@/lib/notifications/BackgroundJobNotifier"),
);

/** Theme: light (white + pink) by default, dark available; auth screens always dark. */
const useAppChrome = () => {
  useEffect(() => {
    const root = document.getElementById("root");
    root?.removeAttribute("data-snapshot-preview");
    root?.removeAttribute("aria-busy");
  }, []);

  useEffect(() => {
    const html = document.documentElement;

    const apply = () => applyTheme();

    apply();
    // Language/direction is owned by authI18n (English + Egyptian Arabic).


    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    window.addEventListener("popstate", apply);
    window.addEventListener("megsy:theme", apply as EventListener);
    mq.addEventListener?.("change", apply);

    // SPA navigations emit no popstate, so observe them directly instead of
    // polling: patch the two history methods the router uses and re-apply.
    const history = window.history as History & { __megsyThemePatched?: boolean };
    const patch = (method: "pushState" | "replaceState") => {
      const original = history[method].bind(history);
      return ((...args: Parameters<History["pushState"]>) => {
        const result = original(...args);
        window.dispatchEvent(new Event("megsy:navigation"));
        return result;
      }) as History["pushState"];
    };
    let restoreHistory: (() => void) | undefined;
    if (!history.__megsyThemePatched) {
      const originalPush = history.pushState;
      const originalReplace = history.replaceState;
      history.pushState = patch("pushState");
      history.replaceState = patch("replaceState");
      history.__megsyThemePatched = true;
      restoreHistory = () => {
        history.pushState = originalPush;
        history.replaceState = originalReplace;
        history.__megsyThemePatched = false;
      };
    }
    window.addEventListener("megsy:navigation", apply);

    const savedAccent = localStorage.getItem("accent");
    if (savedAccent) html.style.setProperty("--primary", savedAccent);

    return () => {
      window.removeEventListener("popstate", apply);
      window.removeEventListener("megsy:theme", apply as EventListener);
      window.removeEventListener("megsy:navigation", apply);
      mq.removeEventListener?.("change", apply);
      restoreHistory?.();
    };
  }, []);
};


const clearUserCaches = () => {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("megsy_cache_")) keysToRemove.push(key);
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
};

/** Claim a pending referral bonus once the user is authenticated. */
const claimPendingReferral = async () => {
  let storedCode = "";
  try {
    const raw = localStorage.getItem("megsy_referral_code");
    if (!raw) return;
    try {
      storedCode = (JSON.parse(raw)?.code || "").toString();
    } catch {
      storedCode = raw;
    }
  } catch {
    return;
  }
  if (!storedCode) return;
  try {
    const { data } = await supabase.rpc("claim_referral_signup", { p_code: storedCode });
    const result = data as { ok?: boolean; error?: string } | null;
    if (result?.ok || (result?.error && result.error !== "email_not_confirmed")) {
      localStorage.removeItem("megsy_referral_code");
    }
  } catch {}
};

const useAuthSession = () => {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeAuthEvents((event, session) => {
      const userId = session?.user?.id || null;
      const lastUserId = localStorage.getItem("megsy_last_user_id");

      if (userId && lastUserId && userId !== lastUserId) clearUserCaches();
      if (userId) localStorage.setItem("megsy_last_user_id", userId);

      if (event === "SIGNED_OUT") {
        localStorage.removeItem("megsy_last_user_id");
        clearAllSnapshots();
        clearUserCaches();
      }

      if (userId && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) {
        void claimPendingReferral();
      }

      setCurrentUserId(userId);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return currentUserId;
};

const App = () => {
  useAppChrome();
  const currentUserId = useAuthSession();

  return (
    <TranslationWrapper>
      <TooltipProvider>
          <ErrorBoundary>
            <BrowserRouter>
              <ZoneProvider>
                <PromoBannerProvider>
                  <ConfirmProvider>
                    <ScrollToTop />
                    <InternalLinkInterceptor />
                    <DodoReturnRedirect />
                    <MarketingTypographyScope />

                    <Suspense fallback={null}>
                      <OfflineBanner />
                      <CommandPalette />
                      <ShortcutsHelp />
                      <CostConfirmationHost />
                      <BackgroundJobNotifier />
                    </Suspense>

                    <Suspense fallback={<LazyFallback />}>
                      <RouteErrorBoundary>
                        <SettingsShell>
                          <DeferredRoutes>
                            {AppRoutes({ currentUserId })}
                          </DeferredRoutes>
                        </SettingsShell>
                      </RouteErrorBoundary>
                    </Suspense>
                  </ConfirmProvider>
                </PromoBannerProvider>
              </ZoneProvider>
            </BrowserRouter>
            {/* Vercel's beacons only exist when the app is served by Vercel.
                On the Lovable host both scripts 404 on every page load, so we
                mount them only where they can actually resolve. */}
            {typeof window !== "undefined" &&
            window.location.hostname.endsWith(".vercel.app") ? (
              <>
                <Suspense fallback={null}>
                  <Analytics />
                </Suspense>
                <Suspense fallback={null}>
                  <SpeedInsights />
                </Suspense>
              </>
            ) : null}
          </ErrorBoundary>
      </TooltipProvider>
    </TranslationWrapper>
  );
};

export default App;
