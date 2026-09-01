/**
 * UpgradeMomentHost — global dialog that answers `promptUpgrade()` calls.
 *
 * Mounted once; listens for the upgrade-moment event and shows a contextual
 * upgrade sheet at the exact moment the user hit the value moment.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, m as motion } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PLAN_HIGHLIGHTS, getDisplayPrice, getPlan } from "@/data/pricingData";
import { UPGRADE_MOMENT_EVENT, type UpgradeMomentPayload } from "@/lib/upgradeMoment";

export default function UpgradeMomentHost() {
  const navigate = useNavigate();
  const [payload, setPayload] = useState<UpgradeMomentPayload | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<UpgradeMomentPayload>).detail;
      if (detail?.feature) setPayload(detail);
    };
    window.addEventListener(UPGRADE_MOMENT_EVENT, handler);
    return () => window.removeEventListener(UPGRADE_MOMENT_EVENT, handler);
  }, []);

  if (typeof document === "undefined") return null;

  const pro = getPlan("pro");
  const price = pro ? getDisplayPrice(pro, false) : null;

  return createPortal(
    <AnimatePresence>
      {payload && (
        <>
          <motion.div
            key="um-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm"
            onClick={() => setPayload(null)}
          />
          <motion.div
            key="um-card"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            role="dialog"
            aria-modal="true"
            aria-label={`Upgrade to continue with ${payload.feature}`}
            className="fixed z-[121] left-1/2 bottom-0 sm:bottom-auto sm:top-1/2 w-[min(440px,100vw)] -translate-x-1/2 sm:-translate-y-1/2 rounded-t-3xl sm:rounded-3xl border border-border bg-card p-6 shadow-2xl"
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setPayload(null)}
              className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <Sparkles className="h-3 w-3" /> Pro
            </span>

            <h2 className="mt-3 text-[20px] font-semibold leading-tight text-foreground">
              You're one step from {payload.feature}
            </h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
              {payload.detail ??
                "Keep your work exactly where it is — upgrade and it runs right away."}
            </p>

            <ul className="mt-4 space-y-2">
              {PLAN_HIGHLIGHTS.pro.slice(0, 4).map((f) => (
                <li key={f} className="flex gap-2 text-[13px] text-foreground/85">
                  <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40" />
                  {f}
                </li>
              ))}
            </ul>

            {price && (
              <p className="mt-4 text-[13px] text-muted-foreground">
                Start at{" "}
                <span className="font-semibold text-foreground">${price.price}</span>{" "}
                for your first month
                {price.isIntro && (
                  <span className="ml-1 line-through opacity-60">${price.strike}</span>
                )}
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setPayload(null)}
                className="flex-1 rounded-xl px-4 py-3 text-[14px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={() => {
                  setPayload(null);
                  navigate("/pricing");
                }}
                className="flex-[1.4] rounded-xl bg-foreground px-4 py-3 text-[14px] font-semibold text-background transition-opacity hover:opacity-90"
              >
                Continue with Pro
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
