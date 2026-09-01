/** @doc Plans, yearly toggle, MC top-up packs and the official pricing FAQ — cinematic redesign. */
import { Suspense, lazy, useState, useEffect, useRef } from "react";
import { m as motion, AnimatePresence, useInView, useMotionValue, useTransform, animate } from "framer-motion";
import { Check, Loader2, ChevronDown, Menu, X, Plus, Minus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeFunction } from "@/lib/supabaseFunction";
import { WORKSPACE_PRODUCT_MAP, WORKSPACE_PLANS } from "@/lib/workspacePlans";
import SEOHead from "@/components/common/SEOHead";
import { Helmet } from "react-helmet-async";
import MegsyStar from "@/components/branding/MegsyStar";
import { usePromoCountdown } from "@/hooks/usePromoCountdown";
import { usePrefetchOnIdle } from "@/hooks/usePrefetchOnIdle";
import { useIsMobile } from "@/hooks/use-mobile";
import MobilePricingScreen from "@/components/mobile-showcase/MobilePricingScreen";
import MobilePushShell from "@/components/layout/MobilePushShell";
import AppSidebar from "@/components/layout/AppSidebar";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";
import type { Gateway } from "@/components/billing/PaymentGatewaySheet";
import PlanCard from "@/pages/billing/referrals/PlanCard";


import {
  PLANS as RAW_PLANS,
  FAQS as RAW_FAQS,
  PLAN_HIGHLIGHTS,
  YEARLY_FREE_MONTHS,
  getDisplayPrice,
  getPlan,
  type PlanTier,
} from "@/data/pricingData";
import { markCheckoutOpened, hasAbandonedCheckout } from "@/lib/pricingOffers";
import { dodoProductId } from "@/lib/dodoCatalog";


import { brandText, getZoneBrand } from "@/lib/zoneBrand";
import { isEgMode } from "@/lib/egMode";
import { isArabBilling } from "@/lib/payRegion";
import { translateExactText, useUserLang } from "@/lib/authI18n";

const LandingFooter = lazy(() => import("@/components/landing/LandingFooter"));
const PaymentGatewaySheet = lazy(() => import("@/components/billing/PaymentGatewaySheet"));

const PRODUCT_MAP: Record<PlanTier, { monthly: string; yearly: string }> = WORKSPACE_PRODUCT_MAP;
const pad2 = (n: number) => String(n).padStart(2, "0");

const HERO_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260619_191346_9d19d66e-86a4-47f7-8dc6-712c1788c3b2.mp4";

const NAV_LINKS = [
  { label: "Plans", href: "#plans-grid" },
  { label: "FAQ", href: "#pricing-faq" },
  { label: "Support", href: "mailto:support@megsyai.com" },
];

/* ----------------------------- StaggeredFade ----------------------------- */
function StaggeredFade({
  text,
  className,
  startDelay = 0,
}: {
  text: string;
  className?: string;
  startDelay?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const lang = useUserLang();
  const translated = translateExactText(text, lang);
  // Scripts whose glyphs must join / shape (Arabic, Hebrew, Persian, Urdu,
  // Indic, CJK). Splitting them into per-character inline-blocks breaks the
  // shaping and lets line-wrap happen INSIDE a word — which is what caused
  // the mangled "الإبداعية" on the pricing hero. For those scripts we fade
  // the whole string as a single unit and stagger by word instead.
  const isComplexScript =
    /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u08A0-\u08FF\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\u0E00-\u0E7F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/.test(
      translated,
    );
  const isRTL = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u08A0-\u08FF]/.test(translated);

  if (isComplexScript) {
    // Split by whitespace so words stay intact; each word is one inline-block.
    const words = translated.split(/(\s+)/);
    return (
      <span
        ref={ref}
        className={className}
        aria-label={translated}
        data-no-translate="true"
        dir={"ltr"}
      >
        {words.map((w, i) => {
          if (/^\s+$/.test(w)) return <span key={i}>{w}</span>;
          return (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: 14 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: startDelay + i * 0.12, ease: "easeOut" }}
              style={{ display: "inline-block", whiteSpace: "normal" }}
            >
              {w}
            </motion.span>
          );
        })}
      </span>
    );
  }

  const chars = Array.from(translated);
  return (
    <span ref={ref} className={className} aria-label={translated} data-no-translate="true">
      {chars.map((c, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 14 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: startDelay + i * 0.07, ease: "easeOut" }}
          style={{ display: "inline-block", whiteSpace: c === " " ? "pre" : "normal" }}
        >
          {c}
        </motion.span>
      ))}
    </span>
  );
}

/* ------------------------------- CountUp -------------------------------- */
function CountUp({
  value,
  duration = 0.8,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(value);
  const [display, setDisplay] = useState<string>(() =>
    Math.round(value).toLocaleString("en-US")
  );
  const prev = useRef(value);
  const mounted = useRef(false);

  useEffect(() => {
    const unsub = mv.on("change", (v) => {
      setDisplay(Math.round(v).toLocaleString("en-US"));
    });
    return unsub;
  }, [mv]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      mv.set(value);
      prev.current = value;
      return;
    }
    const controls = animate(mv, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      from: prev.current,
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, duration, mv]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}


/* ============================== Pricing Page ============================== */
const PricingPage = () => {
  const navigate = useNavigate();
  // Warm the auth chunk while the user is comparing plans.
  usePrefetchOnIdle(["/auth", "/chat"], 1500);
  const [isYearly, setIsYearly] = useState(false);
  const [loadingTier, setLoadingTier] = useState<PlanTier | null>(null);
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [gatewaySheet, setGatewaySheet] = useState<{
    tier: PlanTier;
    interval: "monthly" | "yearly";
    trial: boolean;
  } | null>(null);
  const [gatewayLoading, setGatewayLoading] = useState<Gateway | null>(null);
  const [settled, setSettled] = useState(false);

  const BRAND = getZoneBrand();
  const promo = usePromoCountdown();
  const lang = useUserLang();
  const isAr = typeof lang === "string" && lang.toLowerCase().startsWith("ar");
  const [sidebarCollapsed] = useSidebarCollapsed();
  const PLANS = brandText(RAW_PLANS);
  const FAQS = brandText(RAW_FAQS);

  const pricingLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Megsy AI",
    description:
      "All-in-one AI workspace — chat, image, video, slides, docs and full-stack builds on one subscription.",
    brand: { "@type": "Brand", name: "Megsy AI" },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: Math.min(...PLANS.map((p) => p.monthlyPrice)).toString(),
      highPrice: Math.max(...PLANS.map((p) => p.monthlyPrice)).toString(),
      offerCount: PLANS.length,
      offers: PLANS.map((p) => ({
        "@type": "Offer",
        name: p.name,
        priceCurrency: "USD",
        price: p.monthlyPrice.toString(),
        url: "https://megsyai.com/pricing",
        category: "SubscriptionMonthly",
      })),
    },
  };

  useEffect(() => {
    const id = window.setTimeout(() => setSettled(true), 250);
    return () => window.clearTimeout(id);
  }, []);

  // Load Garamond + Geist webfonts once
  useEffect(() => {
    const links: HTMLLinkElement[] = [];
    const add = (href: string, rel = "stylesheet") => {
      const l = document.createElement("link");
      l.rel = rel;
      l.href = href;
      l.crossOrigin = "anonymous";
      document.head.appendChild(l);
      links.push(l);
    };
    add("https://fonts.googleapis.com", "preconnect");
    add("https://fonts.gstatic.com", "preconnect");
    add("https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500&display=swap");
    // Served by Google Fonts: the previous onlinewebfonts file failed OTS parsing.
    add("https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500;600&display=swap");
    return () => {
      links.forEach((l) => l.parentNode && l.parentNode.removeChild(l));
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: ws } = await supabase
        .from("workspaces")
        .select("plan")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setCurrentPlan((ws as any)?.plan ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubscribe = async (
    tier: PlanTier,
    opts: { trial?: boolean; interval?: "monthly" | "yearly" } = {},
  ) => {
    if (loadingTier) return;
    const interval: "monthly" | "yearly" = opts.interval ?? (isYearly ? "yearly" : "monthly");

    // Ensure signed in before opening the picker.
    let {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      session = refreshed.session;
    }
    if (!session?.access_token) {
      await supabase.auth.signOut().catch(() => {});
      toast.error("Please sign in again to continue.");
      navigate("/auth?redirect=/pricing");
      return;
    }

    // Egypt edition or an Arabic account: Kashier (card + wallets) — show the picker.
    if (isEgMode() || isArabBilling()) {
      setGatewaySheet({ tier, interval, trial: opts.trial === true });
      return;
    }

    // No gateway picker on the main site — go straight to Dodo Payments.
    await runCheckout("global", { tier, interval, trial: opts.trial === true });
  };

  const runCheckout = async (
    gateway: Gateway,
    ctx?: { tier: PlanTier; interval: "monthly" | "yearly"; trial: boolean },
  ) => {
    const target = ctx ?? gatewaySheet;
    if (!target) return;
    const { tier, interval, trial } = target;
    setGatewayLoading(gateway);
    setLoadingTier(tier);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Please sign in again to continue.");
        navigate("/auth?redirect=/pricing");
        return;
      }

      // Map user-facing option → backend provider.
      // global → Dodo Payments, local/wallets → Kashier.
      const provider =
        gateway === "global" ? "dodo" : "kashier";
      const method = gateway === "wallets" ? "vodafone_cash" : "card";

      // Kashier: server-side catalog decides amount/credits/plan. We only
      // pass a sku that matches public.billing_skus.
      if (provider === "kashier") {
        // Map (tier, interval) → sku. Extend billing_skus + this map when
        // adding new plans.
        // Pro monthly gets the special first-month offer sku ($7 → 344 EGP).
        const skuMap: Record<string, string> = {
          "pro:monthly":       "plan_pro_m_first",
          "pro:yearly":        "plan_pro_y",
          "elite:monthly":     "plan_elite_m",
          "elite:yearly":      "plan_elite_y",
          "business:monthly":  "plan_business_m",
          "business:yearly":   "plan_business_y",
        };
        const sku = skuMap[`${tier}:${interval}`];
        if (!sku) {
          throw new Error("This plan isn't available for local payment yet.");
        }

        const { data: kData, error: kErr } = await supabase.functions.invoke(
          "kashier-checkout",
          {
            body: {
              sku,
              method,
              display: isEgMode() || isArabBilling() ? "ar" : "en",
            },
          },
        );
        if (kErr || !kData?.checkout_url) {
          throw new Error(kErr?.message || kData?.error || "Checkout failed");
        }
        markCheckoutOpened(interval);
        window.location.href = kData.checkout_url;
        return;
      }

      const { data, error } = await invokeFunction("openrouter-media", {
        body: {
          kind: "checkout",
          tier,
          interval,
          trial,
          provider,
          // Dodo product to open (server may override from its own catalog).
          product_id: dodoProductId(interval, hasAbandonedCheckout()),
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) {
        const msg = (error as any)?.message?.toLowerCase?.() || "";
        if (msg.includes("unauthorized") || msg.includes("401") || msg.includes("jwt")) {
          await supabase.auth.signOut().catch(() => {});
          toast.error("Your session expired. Please sign in again.");
          navigate("/auth?redirect=/pricing");
          return;
        }
        throw error;
      }
      if (data?.url) {
        markCheckoutOpened(interval);
        window.location.href = data.url;
      }
      else throw new Error(data?.error || "Checkout failed");

    } catch (e: any) {
      toast.error(e?.message || "Failed to open checkout. Please try again.");
    } finally {
      setGatewayLoading(null);
      setLoadingTier(null);
      setGatewaySheet(null);
    }
  };


  const scrollTo = (id: string) => {
    if (id.startsWith("#")) {
      document.querySelector(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.location.href = id;
    }
    setMobileOpen(false);
  };

  const isMobile = useIsMobile();
  const proPlan = PLANS.find((p) => p.tier === "pro");

  // ─── Mobile-only pricing showcase ──
  if (isMobile && proPlan) {
    return (
      <>
        <SEOHead
          title={`Pricing — ${BRAND} AI Plans & Credits`}
          description={`Simple plans for ${BRAND} AI. Chat, images, video, slides and full-stack builds — one subscription.`}
          path="/pricing"
        />
        <Helmet>
          <script type="application/ld+json">{JSON.stringify(pricingLd)}</script>
        </Helmet>
        <MobilePushShell
          open={mobileOpen}
          onOpenChange={setMobileOpen}
          onNewChat={() => navigate("/")}
          currentMode="chat"
        >
          <MobilePricingScreen
            isYearly={isYearly}
            onToggleYearly={setIsYearly}
            loadingTier={loadingTier}
            onSubscribe={(tier) => handleSubscribe(tier, { interval: isYearly ? "yearly" : "monthly" })}
            onMenuClick={() => setMobileOpen(true)}
          />
        </MobilePushShell>
        <Suspense fallback={null}>
          {gatewaySheet && (
            <PaymentGatewaySheet
              open={!!gatewaySheet}
              onClose={() => setGatewaySheet(null)}
              onSelect={runCheckout}
              loading={gatewayLoading}
              options={["local", "wallets"]}
              labels={{ local: "Visa / Mastercard", wallets: "Vodafone Cash" }}
            />
          )}
        </Suspense>
      </>
    );
  }

  return (
    <>
      <SEOHead
        title={`Pricing — ${BRAND} AI Plans & Credits`}
        description={`Simple plans for ${BRAND} AI. Pay-as-you-go credits or monthly subscriptions for chat, images, video, slides and full-stack builds.`}
        path="/pricing"
      />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(pricingLd)}</script>
      </Helmet>
      {/* Pricing page adapts to the app theme: dark surface in dark mode,
          matches the chat light surface in light mode. */}
      <div
        data-pricing-scope
        className="flex min-h-[100dvh] w-full overflow-x-hidden rtl:flex-row-reverse bg-background light-scope:bg-[hsl(var(--background))]"
      >
        {/* Desktop app sidebar — persistent on the left */}
        <aside
          data-chat-sidebar="true"
          style={{ width: !sidebarCollapsed ? 280 : 60 }}
          className="hidden md:flex shrink-0 overflow-hidden border-e border-foreground/10 transition-[width] duration-200 ease-out"
        >
          <AppSidebar
            inline
            open
            forceExpanded={false}
            onClose={() => {}}
            onNewChat={() => navigate("/")}
            onSelectConversation={() => {}}
            currentMode="chat"
          />
        </aside>

        <main className="flex-1 flex flex-col overflow-visible min-w-0">
          <div
            className="flex-1 overflow-visible custom-pricing-scrollbar"
            style={{ scrollBehavior: "smooth" }}
          >
            <div
              className="pricing-sunset-bg min-h-dvh w-full text-foreground"
              style={{
                fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, sans-serif",
              }}
            >
              <style>{`
        .font-garamond { font-family: 'EB Garamond', Garamond, 'Times New Roman', serif; }

        /* ---- Light-theme remap: match the chat light surface ---- */
        html[data-theme="light"] [data-pricing-scope] { background: hsl(var(--background)) !important; }
        html[data-theme="light"] [data-pricing-scope] main > div > div { background: hsl(var(--background)) !important; color: hsl(var(--foreground)) !important; }
        html[data-theme="light"] [data-pricing-scope] .text-foreground,
        html[data-theme="light"] [data-pricing-scope] [class*="text-foreground/"] { color: hsl(var(--foreground)) !important; }
        html[data-theme="light"] [data-pricing-scope] .bg-background,
        html[data-theme="light"] [data-pricing-scope] [class*="bg-background/"] { background-color: hsl(var(--background)) !important; }
        html[data-theme="light"] [data-pricing-scope] [class*="bg-foreground/"] { background-color: hsl(var(--muted)) !important; }
        html[data-theme="light"] [data-pricing-scope] [class*="border-foreground/"] { border-color: hsl(var(--border)) !important; }
        html[data-theme="light"] [data-pricing-scope] .liquid-glass {
          background: hsl(var(--card)) !important;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04), inset 0 0 0 1px hsl(var(--border)) !important;
        }
        html[data-theme="light"] [data-pricing-scope] .liquid-glass::before { display: none !important; }
        html[data-theme="light"] [data-pricing-scope] aside[data-chat-sidebar="true"] { border-color: hsl(var(--border)) !important; }

        /* Force light surfaces on every hardcoded-dark element inside the pricing scope */
        html[data-theme="light"] [data-pricing-scope] .section-bg,
        html[data-theme="light"] [data-pricing-scope] section.bg-background,
        html[data-theme="light"] [data-pricing-scope] section[class*="bg-background"] {
          background: hsl(var(--background)) !important;
        }
        html[data-theme="light"] [data-pricing-scope] .hero-vignette { background: transparent !important; }
        /* Hide the dark hero video + poster and use a soft light gradient instead */
        html[data-theme="light"] [data-pricing-scope] section:first-of-type > video,
        html[data-theme="light"] [data-pricing-scope] section:first-of-type > div[aria-hidden] {
          display: none !important;
        }
        html[data-theme="light"] [data-pricing-scope] section:first-of-type {
          background: linear-gradient(180deg, hsl(var(--muted)) 0%, hsl(var(--background)) 100%) !important;
        }
        html[data-theme="light"] [data-pricing-scope] section:first-of-type h1,
        html[data-theme="light"] [data-pricing-scope] section:first-of-type p,
        html[data-theme="light"] [data-pricing-scope] section:first-of-type span {
          color: hsl(var(--foreground)) !important;
        }
        /* Pricing cards: switch red gradient for a clean light card */
        html[data-theme="light"] [data-pricing-scope] .pricing-card-glass {
          background: hsl(var(--card)) !important;
          border: none !important;
          box-shadow: 0 10px 30px -18px rgba(0,0,0,0.15) !important;
          color: hsl(var(--foreground)) !important;
        }
        html[data-theme="light"] [data-pricing-scope] .pricing-card-glass,
        html[data-theme="light"] [data-pricing-scope] .pricing-card-glass * {
          color: hsl(var(--foreground)) !important;
        }
        html[data-theme="light"] [data-pricing-scope] .pricing-card-elite {
          border-color: hsl(var(--primary)) !important;
          box-shadow: 0 20px 50px -20px hsl(var(--primary) / 0.35) !important;
        }
        /* CTA button on cards */
        html[data-theme="light"] [data-pricing-scope] .pricing-card-glass .liquid-glass {
          background: hsl(var(--primary)) !important;
          color: hsl(var(--primary-foreground)) !important;
          box-shadow: none !important;
        }
        html[data-theme="light"] [data-pricing-scope] .pricing-card-glass .liquid-glass::before { display: none !important; }
        /* FAQ */
        html[data-theme="light"] [data-pricing-scope] .faq-glass {
          background: hsl(var(--card)) !important;
          border-color: hsl(var(--border)) !important;
        }
        html[data-theme="light"] [data-pricing-scope] #pricing-faq h2 { color: hsl(var(--primary)) !important; }
        /* Icons that were checked/stars white on cards */
        html[data-theme="light"] [data-pricing-scope] .pricing-card-glass svg { color: hsl(var(--foreground)) !important; }


        .liquid-glass {
          background: rgba(255, 255, 255, 0.01);
          background-blend-mode: luminosity;
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          border: none;
          box-shadow: inset 0 1px 1px var(--overlay-white-10);
          position: relative;
          overflow: hidden;
          transition: background .25s ease, transform .15s ease, box-shadow .25s ease;
        }
        .liquid-glass::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1.4px;
          background: linear-gradient(180deg,
            rgba(255,255,255,0.45) 0%, var(--overlay-white-15) 20%,
            rgba(255,255,255,0) 40%, rgba(255,255,255,0) 60%,
            var(--overlay-white-15) 80%, rgba(255,255,255,0.45) 100%);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }
        .liquid-glass:hover {
          background: var(--overlay-white-04);
          box-shadow: inset 0 1px 2px var(--overlay-white-15);
        }
        .liquid-glass:active { transform: scale(0.98); }

        .mobile-menu-glass {
          background: hsl(var(--card) / 0.7);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid var(--overlay-white-08);
          box-shadow: 0 8px 32px hsl(var(--foreground) / 0.18), inset 0 1px 0 var(--overlay-white-10);
        }

        .pricing-card-glass {
          background: linear-gradient(160deg, rgba(220,60,70,0.34) 0%, rgba(140,24,32,0.44) 45%, rgba(50,8,12,0.6) 100%);
          backdrop-filter: blur(24px) saturate(160%);
          -webkit-backdrop-filter: blur(24px) saturate(160%);
          border: none;
          box-shadow: 0 20px 40px -20px rgba(0,0,0,0.5);
          transition:
            transform 0.55s cubic-bezier(0.34, 1.35, 0.64, 1),
            background 0.4s ease,
            box-shadow 0.55s cubic-bezier(0.22, 1, 0.36, 1);
          color: #ffffff;
          will-change: transform;
        }
        .pricing-card-glass, .pricing-card-glass * { color: #ffffff !important; }
        .pricing-card-glass:hover {
          transform: translateY(-6px) scale(1.008);
          box-shadow: 0 40px 80px -24px rgba(220,60,70,0.35);
        }
        .pricing-card-glass:active {
          transform: translateY(-3px) scale(0.998);
          transition-duration: 0.15s;
        }
        .pricing-card-elite {
          border: none;
          background: linear-gradient(160deg, rgba(240,90,100,0.42) 0%, rgba(170,30,40,0.52) 45%, rgba(60,10,14,0.65) 100%);
          box-shadow: 0 30px 60px -20px rgba(220,60,70,0.4);
        }
        .pricing-card-elite:hover {
          transform: translateY(-8px) scale(1.045) !important;
        }

        .faq-glass {
          background: rgba(16, 16, 18, 0.6);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border: 1px solid var(--overlay-white-06);
        }

        .hero-vignette {
          background:
            radial-gradient(ellipse at 50% 35%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.4) 55%, rgba(1,1,1,0.9) 100%),
            linear-gradient(180deg, rgba(1,1,1,0.55) 0%, rgba(1,1,1,0.05) 30%, rgba(1,1,1,0.1) 60%, #010101 100%);
        }
        .section-bg {
          background: #000000;
          border: none !important;
          box-shadow: none !important;
        }
      `}</style>

      {/* ============================ HERO ============================ */}
      <section className="relative w-full overflow-hidden min-h-[68vh] md:min-h-[52vh] flex flex-col">
        {/* Warm gradient poster shown while the hero video streams in */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 50% 30%, rgba(180,40,50,0.55) 0%, rgba(60,10,14,0.7) 45%, #010101 100%)",
          }}
        />
        {/* Background video */}
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="none"
          onLoadedData={(e) => {
            (e.currentTarget as HTMLVideoElement).style.opacity = "1";
          }}
          style={{ opacity: 0, transition: "opacity 900ms cubic-bezier(0.22,1,0.36,1)" }}
          className="absolute inset-0 w-full h-full object-cover object-center"
          src={HERO_VIDEO}
        />
        <div className="absolute inset-0 hero-vignette pointer-events-none" />


        {/* Nav */}
        <nav className="relative z-20 flex items-center justify-between md:justify-center md:gap-12 px-5 sm:px-8 pt-10 sm:pt-8">
        </nav>


        {/* Hero content */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center text-center px-5 sm:px-8 pt-4 sm:pt-6 pb-6 sm:pb-8">
          <h1
            className="font-garamond font-normal text-foreground tracking-tight mb-4 sm:mb-6 text-4xl sm:text-6xl md:text-8xl lg:text-9xl"
            style={{ lineHeight: 1.08 }}
          >
            <StaggeredFade text="CHOOSE YOUR" className="block" />
            <StaggeredFade text="CREATIVE EDGE" className="block" startDelay={0.4} />
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.6 }}
            className="text-foreground/70 font-light leading-relaxed max-w-xs sm:max-w-md text-sm sm:text-base md:text-lg"
          >
            {`Simple plans for the entire ${BRAND} ecosystem, built for creators, teams and enterprises.`}
          </motion.p>






          {/* Promo */}
          {promo.active && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 2.2 }}
              className="mt-6 sm:mt-8 inline-flex flex-col md:flex-row items-center md:items-stretch gap-5 md:gap-6 px-6 sm:px-7 py-4 rounded-2xl mobile-menu-glass"
              >
              <div className="flex flex-col items-center md:items-start text-center md:text-start gap-1.5">
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] uppercase font-medium text-foreground bg-foreground/10 border border-foreground/10"
                  style={{ letterSpacing: "0.18em" }}
                >
                  {"Limited Launch Offer"}
                </span>
                <p className="text-[13px] text-foreground/90 leading-relaxed max-w-[16rem] sm:max-w-[18rem]">
                  {"Pro first month $5 — 75% OFF the rest"}
                </p>

              </div>
              <div
                className="hidden md:block w-px self-stretch"
                style={{ background: "var(--overlay-white-12)" }}
              />
              <div
                className="h-px w-full md:hidden"
                style={{ background: "var(--overlay-white-12)" }}
              />
              <div className="flex gap-4 sm:gap-5 font-garamond tabular-nums" dir="ltr">
                {[
                  { v: pad2(promo.days), l: "Days" },
                  { v: pad2(promo.hours), l: "Hrs" },
                  { v: pad2(promo.minutes), l: "Min" },
                  { v: pad2(promo.seconds), l: "Sec" },
                ].map((t) => (
                  <div key={t.l} className="flex flex-col items-center min-w-[2.5rem]">
                    <span className="text-[26px] sm:text-2xl text-foreground leading-none">{t.v}</span>
                    <span
                      className="text-[10px] uppercase mt-1.5 text-foreground/80 whitespace-nowrap"
                      style={{ letterSpacing: "0.22em" }}
                    >
                      {t.l}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </section>

      {/* ============================ PLANS ============================ */}
      <section
        id="plans-grid"
        className="section-bg relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 scroll-mt-8"
      >
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="text-center mb-10"
        >
          <div className="mx-auto mb-8 flex h-[170px] w-full max-w-[520px] items-center justify-center sm:h-[200px]">
            <PlanCard
              plan="pro"
              className="z-10 h-[120px] w-[176px] shrink-0 sm:h-[142px] sm:w-[208px]"
            />
          </div>

          <h2
            className="font-garamond text-foreground"
            style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", lineHeight: 1.1 }}
          >
            Megsy Pro
          </h2>
          <p
            className="mt-3 text-foreground/85 text-xs sm:text-sm uppercase font-light"
            style={{ letterSpacing: "0.3em" }}
          >
            Unlock your creative power — start today
          </p>

          {/* Billing toggle */}
          <div className="mt-6 inline-flex items-center gap-4">
            <span
              className={`text-xs uppercase transition-colors ${isYearly ? "text-foreground/80" : "text-foreground"}`}
              style={{ letterSpacing: "0.2em" }}
            >
              Monthly
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={isYearly}
              aria-label={isYearly ? "Switch to monthly billing" : "Switch to yearly billing"}
              onClick={() => setIsYearly((v) => !v)}
              className="relative w-14 h-7 rounded-full border border-foreground/40 backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              style={{
                background: "var(--overlay-white-18)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 16px var(--overlay-white-08)",
              }}
            >
              <span
                className="absolute top-1/2 left-1 w-5 h-5 rounded-full transition-transform duration-300"
                style={{
                  background: "rgba(255,255,255,0.95)",
                  boxShadow: "0 2px 8px rgba(255,255,255,0.4), inset 0 1px 0 var(--overlay-white-90)",
                  transform: `translateY(-50%) translateX(${isYearly ? "26px" : "0px"})`,
                }}
              />
            </button>
            <span
              className={`text-xs uppercase flex items-center gap-2 transition-colors ${isYearly ? "text-foreground" : "text-foreground/80"}`}
              style={{ letterSpacing: "0.2em" }}
            >
              Yearly
              <span
                className="text-[9px] px-2 py-0.5 rounded-full border border-foreground/25 text-foreground/85 font-normal"
                style={{ letterSpacing: "0.15em" }}
              >
                4 months free
              </span>
            </span>
          </div>
        </motion.div>


        <div className="mx-auto grid max-w-xl grid-cols-1 gap-6 items-stretch">
          {PLANS.filter((p) => p.tier === "pro").map((p, i) => {
            // Single source of truth: intro price monthly, 2-months-free yearly.
            const {
              price,
              strike: strikePrice,
              isIntro: isProFirstMonth,
              discountLabel,
            } = getDisplayPrice(p, isYearly);
            const rawPrice = p.monthlyPrice;
            const credits = isYearly ? p.yearlyCredits : p.monthlyCredits;
            const isElite = p.tier === "elite";
            const isBusiness = p.tier === "business";

            const order: PlanTier[] = ["starter", "pro", "elite", "business"];
            const cur = (currentPlan ?? "starter").toLowerCase() as PlanTier;
            const curIdx = order.indexOf(cur);
            const thisIdx = order.indexOf(p.tier);
            const isCurrent = curIdx === thisIdx;
            const isLower = thisIdx < curIdx;
            const ctaLabel = isCurrent
              ? "Current plan"
              : isLower
                ? `Downgrade to ${p.name}`
                : `Get ${p.name}`;

            return (
              <motion.div
                key={p.tier}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                className={`pricing-card-glass relative rounded-3xl flex flex-col ${isElite ? "pricing-card-elite md:scale-[1.03] z-10" : ""}`}
              >

                <div className="relative z-10 p-7 sm:p-8 flex flex-col flex-1">
                  <h3
                    className="font-garamond text-3xl text-foreground mb-4"
                    style={{ letterSpacing: "0.02em" }}
                  >
                    {p.name}
                  </h3>

                  <div className="flex items-baseline gap-1.5">
                    <span className="font-garamond text-2xl text-foreground">$</span>
                    <CountUp
                      value={price}
                      className="font-garamond text-6xl leading-none text-foreground tabular-nums"
                    />
                    <span className="text-foreground text-xs ml-1 uppercase" style={{ letterSpacing: "0.2em" }}>
                      /{isProFirstMonth ? "1st mo" : isYearly ? "year" : "month"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-xs text-foreground/85 line-through tabular-nums">
                      $<CountUp value={strikePrice} />
                    </span>
                    <span
                      className="text-[10px] uppercase px-2 py-0.5 rounded-full border border-foreground/40 text-foreground font-light"
                      style={{ letterSpacing: "0.18em" }}
                    >
                      {discountLabel}
                    </span>
                  </div>

                  {isProFirstMonth && (
                    <p className="text-[10px] uppercase text-foreground/70 mt-2 font-light" style={{ letterSpacing: "0.18em" }}>
                      Then ${rawPrice}/month
                    </p>
                  )}

                  {/* Yearly maths spelled out so the offer never looks contradictory:
                      12 months billed at the price of 8. */}
                  {isYearly && rawPrice > 0 && (
                    <p className="text-[10px] uppercase text-foreground/70 mt-2 font-light" style={{ letterSpacing: "0.18em" }}>
                      ≈ ${Math.round(p.yearlyPrice / 12)}/month · pay {12 - YEARLY_FREE_MONTHS} months, get 12
                    </p>
                  )}





                  {credits && (
                    <p
                      className="text-foreground text-[11px] mt-5 uppercase font-light"
                      style={{ letterSpacing: "0.22em" }}
                    >
                      {credits}
                    </p>
                  )}

                  <div
                    className="h-px w-full my-7"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent, var(--overlay-white-18), transparent)",
                    }}
                  />

                  {p.tier !== "starter" && (
                    <button
                      type="button"
                      onClick={() => handleSubscribe(p.tier)}
                      disabled={loadingTier !== null || isCurrent}
                      className={`liquid-glass w-full py-3.5 rounded-full text-xs uppercase font-normal text-foreground disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 ${isElite ? "bg-foreground/[0.04]" : ""}`}
                      style={{ letterSpacing: "0.2em" }}
                    >
                      {loadingTier === p.tier ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        ctaLabel
                      )}
                    </button>
                  )}

                  {(() => {
                    const list =
                      (isYearly ? p.yearlyFeatures : p.monthlyFeatures) ?? p.features;
                    const periodKey = isYearly ? "y" : "m";
                    return (
                      <motion.ul
                        key={`${p.tier}-${periodKey}`}
                        className="mt-7 space-y-3 flex-1"
                        initial="hidden"
                        animate="visible"
                        variants={{
                          hidden: {},
                          visible: { transition: { staggerChildren: 0.05, delayChildren: 0.08 } },
                        }}
                      >
                        {list.map((f, idx) => {
                          const isUnlimited = /unlimited/i.test(f);
                          const isSave = /^save\s|\bbonus\b|\blocked-?in\b|2 months free/i.test(f);
                          return (
                            <motion.li
                              key={`${f}-${idx}`}
                              className="flex items-start gap-3 text-[13px] leading-snug"
                              style={{
                                color: "#ffffff",
                                fontWeight: isUnlimited || isSave ? 500 : 400,
                              }}
                              variants={{
                                hidden: { opacity: 0, x: -18, filter: "blur(6px)" },
                                visible: {
                                  opacity: 1,
                                  x: 0,
                                  filter: "blur(0px)",
                                  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
                                },
                              }}
                            >
                              <motion.span
                                className="shrink-0 mt-[3px] inline-flex items-center justify-center"
                                variants={{
                                  hidden: { scale: 0.4, rotate: -90, opacity: 0 },
                                  visible: {
                                    scale: 1,
                                    rotate: 0,
                                    opacity: 1,
                                    transition: { duration: 0.45, ease: [0.34, 1.56, 0.64, 1] },
                                  },
                                }}
                              >
                                {isUnlimited ? (
                                  <MegsyStar className="w-3.5 h-3.5" />
                                ) : (
                                  <Check className="w-3.5 h-3.5 text-foreground" strokeWidth={2} />
                                )}
                              </motion.span>
                              <span className="flex-1">{f}</span>
                            </motion.li>
                          );
                        })}
                      </motion.ul>

                    );
                  })()}

                </div>
              </motion.div>
            );
          })}

          {/* Single-plan lineup — only Megsy Pro is offered. */}
        </div>


      </section>

      {/* ============================ FAQ ============================ */}
      <section id="pricing-faq" className="relative overflow-hidden bg-background py-16 md:py-28 scroll-mt-8">
        {/* Massive FAQS headline */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.9 }}
          className="px-4"
        >
          <h2 className="font-display text-[24vw] md:text-[28vw] font-black uppercase leading-[0.8] tracking-tighter text-violet-500 text-center select-none">
            FAQS
          </h2>
        </motion.div>

        {/* Question list */}
        <div className="mx-auto mt-16 max-w-6xl px-6">
          <ul className="border-t border-foreground/10">
            {FAQS.map((item, i) => {
              const isOpen = openFaq === i;
              return (
                <li key={item.q} className="border-b border-foreground/10">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    aria-controls={`pricing-faq-panel-${i}`}
                    id={`pricing-faq-trigger-${i}`}
                    className="flex w-full items-center justify-between gap-6 py-7 text-left transition-colors hover:text-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded"
                  >
                    <span className="font-display text-lg font-bold text-foreground md:text-2xl">
                      {item.q}
                    </span>
                    <span className="shrink-0 text-violet-400" aria-hidden="true">
                      {isOpen ? (
                        <Minus className="h-7 w-7" strokeWidth={2.5} />
                      ) : (
                        <Plus className="h-7 w-7" strokeWidth={2.5} />
                      )}
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key="content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        <p className="pb-7 pr-12 text-base leading-relaxed text-foreground/60 md:text-lg">
                          {item.a}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>

          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 text-xs uppercase font-light text-foreground/70" style={{ letterSpacing: "0.18em" }}>
            <a href="mailto:support@megsyai.com" className="hover:text-foreground transition-colors">
              support@megsyai.com
            </a>
            <span className="hidden sm:inline text-foreground/65">·</span>
            <a href="tel:+201098821812" className="hover:text-foreground transition-colors">
              +20 109 882 1812
            </a>
            <span className="hidden sm:inline text-foreground/65">·</span>
            <button
              onClick={() => navigate("/refund")}
              className="hover:text-foreground transition-colors"
            >
              Refund Policy
            </button>
          </div>
        </div>
      </section>


      {/* ============================ FOOTER ============================ */}
      {settled && (
        <Suspense fallback={null}>
          <LandingFooter />
        </Suspense>
      )}

      {gatewaySheet !== null && (
        <Suspense fallback={null}>
          <PaymentGatewaySheet
            open
            onClose={() => {
              if (gatewayLoading) return;
              setGatewaySheet(null);
              setLoadingTier(null);
            }}
            onSelect={runCheckout}
            loading={gatewayLoading}
            options={["local", "wallets"]}
            labels={{ local: "Visa / Mastercard", wallets: "Vodafone Cash" }}
            title="Choose payment method"
            subtitle="Pay with Kashier."
          />
        </Suspense>
      )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
};

export default PricingPage;
