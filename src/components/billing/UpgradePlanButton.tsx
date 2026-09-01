/**
 * UpgradePlanButton — premium emerald payment CTA for Megsy.
 *
 * Two-plan model (Pro + Max only):
 *   free  → "Get Pro"          (Get Pro)
 *   pro   → "Upgrade to Max"   (Upgrade to Max)
 *   max   → hidden             (already at top tier)
 *
 * Design spec:
 *   - Glassmorphism dark base: semi-transparent black (rgba(0,0,0,0.65)).
 *   - Clean emerald border (#50C878) as the single accent.
 *   - Hollow emerald star with no background wrapper, sitting directly on the button.
 *   - Soft emerald glow around the button, intensifying on hover.
 *   - Smooth transitions, premium finish, RTL/AR ready, reduced-motion safe.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import MegsyStar from "@/components/branding/MegsyStar";
import { useCredits } from "@/hooks/useCredits";
import { prefetchRoute } from "@/hooks/usePrefetchRoute";
import { useUserLang } from "@/lib/authI18n";
import { cn } from "@/lib/utils";

type Tier = "free" | "pro" | "max";

interface TierMeta {
  target: Tier | null;
  labelEn: string;
  labelAr: string;
  shortEn: string;
  shortAr: string;
}

const TIER_MAP: Record<Tier, TierMeta> = {
  free: {
    target: "pro",
    labelEn: "Upgrade to Pro",
    labelAr: "Upgrade to Pro",
    shortEn: "Get Pro",
    shortAr: "Get Pro",
  },
  pro: {
    target: "max",
    labelEn: "Upgrade to Max",
    labelAr: "Upgrade to Max",
    shortEn: "Upgrade to Max",
    shortAr: "Upgrade to Max",
  },
  max: {
    target: null,
    labelEn: "",
    labelAr: "",
    shortEn: "",
    shortAr: "",
  },
};

function normalizePlan(plan: string | null | undefined): Tier {
  const p = (plan || "free").toString().toLowerCase();
  if (p.includes("max") || p.includes("elite") || p.includes("business") || p.includes("enterprise")) return "max";
  if (p.includes("pro") || p.includes("plus") || p.includes("starter")) return "pro";
  return "free";
}

function formatCredits(n: number | null): string {
  if (n == null) return "";
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `${n}`;
}

export interface UpgradePlanButtonProps {
  /** "full" shows label + credits chip; "compact" is icon+short label (mobile). */
  variant?: "full" | "compact";
  className?: string;
  hideCredits?: boolean;
}

export function UpgradePlanButton({ variant = "full", className, hideCredits = false }: UpgradePlanButtonProps) {
  const navigate = useNavigate();
  const lang = useUserLang();
  const { plan, credits, loading } = useCredits();

  const tier = useMemo(() => normalizePlan(plan), [plan]);
  const meta = TIER_MAP[tier];

  const prefetch = () => {
    void prefetchRoute("/pricing");
  };

  if (!meta.target || loading) return null;

  const isAr = lang === "ar-eg";
  const label = isAr ? meta.labelAr : meta.labelEn;
  const shortLabel = variant === "compact" ? (isAr ? meta.shortAr : meta.shortEn) : label;

  return (
    <button
      type="button"
      dir={"ltr"}
      aria-label={label}
      onPointerDown={prefetch}
      onMouseEnter={prefetch}
      onFocus={prefetch}
      onClick={() => {
        prefetch();
        navigate("/pricing");
      }}
      className={cn(
        "upgrade-plan-btn group relative inline-flex items-center gap-2 shrink-0",
        "h-11 md:h-9 rounded-full font-semibold select-none bg-transparent border-0 shadow-none",
        "text-[12.5px] leading-none tracking-[-0.01em] text-foreground",
        "transition-all duration-200 ease-out hover:opacity-90",
        "active:scale-[0.985]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
        variant === "compact" ? "w-11 md:w-9 justify-center p-0" : "px-1.5",
        className,
      )}
    >


      {/* Star icon — Megsy brand sparkle, blue */}
      <MegsyStar
        className={`relative z-10 transition-transform duration-200 group-hover:scale-105 text-[var(--megsy-blue)] ${variant === "compact" ? "w-4 h-4" : "w-3.5 h-3.5"}`}
      />

      {/* Label (hidden in the icon-only compact variant) */}
      {variant !== "compact" && (
        <span className="relative z-10 whitespace-nowrap">{shortLabel}</span>
      )}

      {/* Credits chip (full variant only) */}
      {variant === "full" && !hideCredits && credits != null && (
        <span
          className="relative z-10 ms-0.5 inline-flex items-center px-1 text-[10.5px] font-semibold tabular-nums text-foreground/70"
          aria-label={"credits"}
        >
          {formatCredits(credits)} MC
        </span>
      )}

    </button>
  );
}

export default UpgradePlanButton;
