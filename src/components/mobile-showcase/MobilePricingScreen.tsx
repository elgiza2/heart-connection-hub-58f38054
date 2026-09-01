/** @doc Mobile /pricing — Manus-style minimal upgrade sheet (pixel-matched to reference).
 *  Single plan (Megsy Pro): dotted backdrop · Megsy star · big serif title ·
 *  clean single-column feature card · two rounded billing cards with radios · fine print ·
 *  solid CTA · legal links.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Monitor,
  Clock,
  Bot,
  Search,
  Infinity as InfinityIcon,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import MegsyStar from "@/components/branding/MegsyStar";
import { MobileSidebarButton } from "@/components/shared/MobileSidebarButton";
import { useUserLang } from "@/lib/authI18n";
import { useUserPlan } from "@/hooks/useUserPlan";
import { getDisplayPrice, getPlan, type PlanTier } from "@/data/pricingData";
import {
  INTRO_PRICE,
  WINBACK_PRICE,
  WINBACK_YEARLY_PRICE,
  hasAbandonedCheckout,
} from "@/lib/pricingOffers";

function MegsyFeatureIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <MegsyStar className={className ?? "h-5 w-5"} />;
}

function useCompactHeight() {
  const [compact, setCompact] = useState(
    typeof window !== "undefined" && window.innerHeight < 780,
  );
  useEffect(() => {
    const update = () => setCompact(window.innerHeight < 780);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return compact;
}

function useIsLightTheme() {
  const [light, setLight] = useState(
    typeof document !== "undefined" &&
      document.documentElement.getAttribute("data-theme") === "light",
  );
  useEffect(() => {
    const el = document.documentElement;
    const update = () => setLight(el.getAttribute("data-theme") === "light");
    const obs = new MutationObserver(update);
    obs.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    update();
    return () => obs.disconnect();
  }, []);
  return light;
}

interface Props {
  isYearly: boolean;
  onToggleYearly: (yearly: boolean) => void;
  onSubscribe: (tier: PlanTier) => void;
  loadingTier?: PlanTier | null;
  onMenuClick?: () => void;
}

export default function MobilePricingScreen({
  isYearly,
  onToggleYearly,
  onSubscribe,
  loadingTier,
  onMenuClick,
}: Props) {
  const lang = useUserLang();
  const isAr = lang === "ar-eg";
  const isLight = useIsLightTheme();
  const compact = useCompactHeight();
  const isLoading = loadingTier === "pro";
  const navigate = useNavigate();
  // A subscriber must never be told to "upgrade" to the plan they already own.
  const { plan } = useUserPlan();
  const alreadySubscribed = plan === "pro" || plan === "max" || plan === "elite";

  // Always exactly 6 rows so the card height (and the CTA position) never
  // shifts when the billing interval changes — only the first row's copy does.
  const features = useMemo(() => {
    const base = isAr
      ? [
          { icon: Monitor, text: "كمبيوتر سحابي حقيقي" },
          { icon: Clock, text: "مهام حتى 4 ساعات" },
          { icon: Bot, text: "3 وكلاء متوازيين" },
          { icon: Search, text: "بحث عميق موثّق بالمصادر" },
          { icon: InfinityIcon, text: "دردشة وتوليد صور بلا حدود" },
        ]
      : [
          { icon: Monitor, text: "A real cloud computer" },
          { icon: Clock, text: "Tasks up to 4 hours" },
          { icon: Bot, text: "3 agents in parallel" },
          { icon: Search, text: "Deep research with citations" },
          { icon: InfinityIcon, text: "Unlimited chat & images" },
        ];

    const head = {
      icon: MegsyFeatureIcon,
      text: isYearly
        ? isAr
          ? "240 رصيد Megsy كل شهر"
          : "240 Megsy Credits every month"
        : isAr
          ? "240 رصيد Megsy مع الاشتراك"
          : "240 Megsy Credits with your plan",
    };

    return [head, ...base];
  }, [isAr, isYearly]);


  // Win-back: the user opened checkout, came back without paying.
  const [winback, setWinback] = useState(false);
  useEffect(() => {
    setWinback(hasAbandonedCheckout());
  }, []);

  const pro = getPlan("pro")!;
  const monthly = getDisplayPrice(pro, false);
  const yearly = getDisplayPrice(pro, true);

  const monthlyPrice = winback ? WINBACK_PRICE : monthly.price;
  const yearlyPrice = winback ? WINBACK_YEARLY_PRICE : yearly.price;
  const monthlyOff = Math.round((1 - monthlyPrice / pro.monthlyPrice) * 100);

  const t = isAr
    ? {
        title: "قم بالترقية إلى Megsy Pro",
        monthly: "شهرياً",
        yearly: "سنوياً",
        introBadge: winback ? `عرض خاص لك — $${monthlyPrice}` : `خصم ${monthlyOff}% على الشهر الأول`,
        yearlyBadge: winback ? "أفضل سعر" : "4 أشهر مجاناً",
        perMonth: "/ الشهر الأول",
        perYear: "/ سنة",
        fine: winback
          ? `عرض العودة: $${monthlyPrice}.00 للشهر الأول بدلاً من $${INTRO_PRICE}.00، ثم $${pro.monthlyPrice}.00/شهر. يمكنك الإلغاء في أي وقت.`
          : `$${monthlyPrice}.00 للشهر الأول، ثم $${pro.monthlyPrice}.00/شهر. يمكنك الإلغاء في أي وقت.`,
        cta: "قم بالترقية الآن",
        terms: "الشروط",
        privacy: "الخصوصية",
        restore: "استعادة",
      }
    : {
        title: "Upgrade to Megsy Pro",
        monthly: "Monthly",
        yearly: "Yearly",
        introBadge: winback ? `Special for you — $${monthlyPrice}` : `${monthlyOff}% off the first month`,
        yearlyBadge: winback ? "Best price" : "4 months free",
        perMonth: "/first mo",
        perYear: "/year",
        fine: winback
          ? `Come-back offer: $${monthlyPrice}.00 for your first month instead of $${INTRO_PRICE}.00, then $${pro.monthlyPrice}.00/month. Cancel anytime.`
          : `$${monthlyPrice}.00 for the first month, then $${pro.monthlyPrice}.00/month. Cancel anytime.`,
        cta: "Upgrade now",
        terms: "Terms",
        privacy: "Privacy",
        restore: "Restore",
      };

  if (alreadySubscribed) {
    const planLabel = plan === "pro" ? "Megsy Pro" : plan === "max" ? "Megsy Max" : "Megsy Elite";
    t.title = isAr ? `أنت مشترك في ${planLabel}` : `You're on ${planLabel}`;
    t.cta = isAr ? "إدارة الاشتراك" : "Manage subscription";
    t.fine = isAr
      ? "اشتراكك نشط. من إدارة الاشتراك تقدر تغيّر الخطة أو تلغيها في أي وقت."
      : "Your subscription is active. Change or cancel it anytime from subscription settings.";
  }

  const c = isLight
    ? {
        bg: "#f2f2f2",
        dot: "rgba(0,0,0,0.10)",
        text: "#0a0a0a",
        muted: "#6b7280",
        faint: "#9ca3af",
        card: "#ffffff",
        cardBorder: "rgba(0,0,0,0.06)",
        cardShadow: "0 1px 2px rgba(0,0,0,0.03), 0 12px 32px -16px rgba(0,0,0,0.10)",
        selBorder: "#0a0a0a",
        unselBorder: "rgba(0,0,0,0.10)",
        badgeBg: "#e8f1ff",
        badgeText: "#1d4ed8",
        icon: "#1f2937",
        ctaBg: "#0a0a0a",
        ctaFg: "#ffffff",
      }
    : {
        bg: "#0b0b0c",
        dot: "rgba(255,255,255,0.08)",
        text: "#f5f5f5",
        muted: "#a3a3a3",
        faint: "#737373",
        card: "rgba(255,255,255,0.05)",
        cardBorder: "rgba(255,255,255,0.09)",
        cardShadow: "0 1px 2px rgba(0,0,0,0.25), 0 12px 32px -16px rgba(0,0,0,0.5)",
        selBorder: "#f5f5f5",
        unselBorder: "rgba(255,255,255,0.14)",
        badgeBg: "rgba(96,165,250,0.16)",
        badgeText: "#93c5fd",
        icon: "#e4e4e7",
        ctaBg: "#f5f5f5",
        ctaFg: "#0a0a0a",
      };

  const options = [
    {
      yearly: false,
      label: t.monthly,
      badge: t.introBadge,
      price: monthlyPrice,
      strike: monthly.strike,
      unit: t.perMonth,
    },
    {
      yearly: true,
      label: t.yearly,
      badge: t.yearlyBadge,
      price: yearlyPrice,
      strike: yearly.strike,
      unit: t.perYear,
    },
  ] as const;

  return (
    <div
      dir={isAr ? "rtl" : "ltr"}
      className="relative flex h-[100dvh] w-full flex-col overflow-hidden"
      style={{
        background: c.bg,
        color: c.text,
        fontFamily: 'Inter, -apple-system, "SF Pro Text", system-ui, sans-serif',
      }}
    >
      {/* Dotted backdrop texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(${c.dot} 1px, transparent 1px)`,
          backgroundSize: "18px 18px",
          maskImage: "radial-gradient(120% 90% at 50% 0%, black 30%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(120% 90% at 50% 0%, black 30%, transparent 100%)",
        }}
      />
      <style>{`
        @keyframes mps-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .mps-rise { animation: mps-rise .5s cubic-bezier(.22,.61,.36,1) both; }
        @media (prefers-reduced-motion: reduce) { .mps-rise { animation: none; } }
      `}</style>

      {/* Header */}
      <header
        className="relative z-10 shrink-0 px-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 2px)" }}
      >
        <MobileSidebarButton
          onClick={() => onMenuClick?.()}
          ariaLabel="Menu"
          className="text-foreground"
        />
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-[400px] flex-1 flex-col px-5">
        {/* Megsy star mark */}
        <div
          className={`mps-rise flex justify-center ${compact ? "mt-[2%]" : "mt-[4%]"}`}
          style={{ animationDelay: "10ms", color: c.text }}
        >
          <MegsyStar className={compact ? "h-7 w-7" : "h-8 w-8"} />
        </div>

        {/* Title */}
        <h1
          className={`mps-rise text-center font-normal leading-[1.2] tracking-[-0.015em] ${
            compact ? "mt-2 text-[22px]" : "mt-2.5 text-[25px]"
          }`}
          style={{ animationDelay: "60ms", fontFamily: '"Instrument Serif", Georgia, serif' }}
        >
          {t.title}
        </h1>

        {/* Feature card — single column, airy rows like the reference */}
        <div
          className={`mps-rise rounded-[24px] ${
            compact ? "mt-3.5 px-4 py-3.5" : "mt-5 px-5 py-4"
          }`}
          style={{
            animationDelay: "120ms",
            background: c.card,
            border: `1px solid ${c.cardBorder}`,
            boxShadow: c.cardShadow,
          }}
        >
          <ul className={`flex flex-col ${compact ? "gap-[11px]" : "gap-[14px]"}`}>
            {features.map(({ icon: Icon, text }) => (
              <li
                key={text}
                className={`flex items-center gap-3 ${isAr ? "flex-row-reverse text-right" : ""}`}
              >
                <Icon
                  className={`${compact ? "h-[18px] w-[18px]" : "h-[20px] w-[20px]"} shrink-0`}
                  strokeWidth={1.5}
                  style={{ color: c.icon }}
                />
                <span
                  className={`flex-1 leading-[1.35] ${compact ? "text-[13px]" : "text-[14px]"}`}
                  style={{ color: c.text }}
                >
                  {text}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Breathing room, exactly like the reference */}
        <div className="flex-1 min-h-[12px]" />

        {/* Billing options */}
        <div
          className={`mps-rise flex flex-col ${compact ? "gap-2" : "gap-2.5"}`}
          style={{ animationDelay: "200ms" }}
        >
          {options.map((opt) => {
            const selected = isYearly === opt.yearly;
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => onToggleYearly(opt.yearly)}
                className={`flex w-full items-center gap-3 rounded-[18px] px-4 text-start transition-all duration-200 ${
                  compact ? "py-2" : "py-2.5"
                } ${isAr ? "flex-row-reverse" : ""}`}
                style={{
                  background: c.card,
                  border: `${selected ? "2px" : "1px"} solid ${selected ? c.selBorder : c.unselBorder}`,
                  boxShadow: selected ? c.cardShadow : "none",
                }}
              >
                <span
                  className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full transition-colors"
                  style={{ border: `2px solid ${selected ? c.text : c.faint}` }}
                >
                  {selected && (
                    <span className="h-[8px] w-[8px] rounded-full" style={{ background: c.text }} />
                  )}
                </span>
                <span className="flex flex-1 flex-col gap-[3px]">
                  <span
                    className={`flex items-center gap-2 ${isAr ? "flex-row-reverse" : ""} justify-start`}
                  >
                    <span className="text-[12.5px] font-medium" style={{ color: c.muted }}>
                      {opt.label}
                    </span>
                    {opt.badge && (
                      <span
                        className="rounded-full px-2 py-[2.5px] text-[10px] font-medium leading-none"
                        style={{ background: c.badgeBg, color: c.badgeText }}
                      >
                        {opt.badge}
                      </span>
                    )}
                  </span>
                  <span
                    className={`flex items-baseline gap-2 tabular-nums ${isAr ? "flex-row-reverse" : ""} justify-start`}
                  >
                    <span className={`${compact ? "text-[15px]" : "text-[16px]"} font-semibold`} style={{ color: c.text }}>
                      ${opt.price}
                    </span>
                    <span className="text-[11px]" style={{ color: c.muted }}>
                      {opt.unit}
                    </span>
                    <span className="text-[11.5px] line-through" style={{ color: c.faint }}>
                      ${opt.strike}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Fine print + CTA + legal, pinned to the very bottom */}
        <div
          className={`mps-rise shrink-0 ${compact ? "pt-2" : "pt-3"}`}
          style={{
            animationDelay: "300ms",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
          }}
        >
          <p
            className={`text-center leading-[1.45] ${compact ? "mb-2 min-h-[26px] text-[10px]" : "mb-2.5 min-h-[30px] text-[10.5px]"}`}
            style={{ color: c.faint }}
          >
            {t.fine}
          </p>
          <button
            type="button"
            onClick={() => (alreadySubscribed ? navigate("/settings/billing") : onSubscribe("pro"))}
            disabled={isLoading}
            className={`flex w-full items-center justify-center rounded-[16px] px-6 font-semibold leading-none transition active:scale-[0.99] disabled:opacity-60 ${
              compact ? "h-[46px] text-[14px]" : "h-[50px] text-[15px]"
            }`}
            style={{ background: c.ctaBg, color: c.ctaFg }}
          >
            {isLoading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
            ) : (
              t.cta
            )}
          </button>
          <nav
            className={`flex items-center justify-center gap-6 leading-none ${compact ? "mt-2 text-[11px]" : "mt-3 text-[11.5px]"}`}
            style={{ color: c.faint }}
            aria-label="Legal"
          >
            <Link to="/terms" className="inline-flex min-h-11 items-center px-2 transition-opacity hover:opacity-70" style={{ color: c.faint }}>
              {t.terms}
            </Link>
            <Link to="/privacy" className="inline-flex min-h-11 items-center px-2 transition-opacity hover:opacity-70" style={{ color: c.faint }}>
              {t.privacy}
            </Link>
            <Link to="/restore" className="inline-flex min-h-11 items-center px-2 transition-opacity hover:opacity-70" style={{ color: c.faint }}>
              {t.restore}
            </Link>
          </nav>
        </div>
      </main>

    </div>
  );
}
