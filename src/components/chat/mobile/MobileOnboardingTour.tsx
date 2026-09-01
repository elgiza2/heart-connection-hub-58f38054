/** @doc Mobile onboarding spotlight tour — dims the screen, cuts a hole around real UI targets (composer, +, send, model picker) and shows a tooltip with an arrow. Clean coach-mark pattern. */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { m as motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";

const STORAGE_KEY = "megsy_mobile_onboarding_v4";

type Step = {
  /** CSS selector for the element to spotlight. */
  target: string;
  title: string;
  text: string;
  /** Preferred tooltip side relative to the target. "auto" picks the side with more room. */
  placement?: "top" | "bottom" | "auto";
  /** Extra px padding around the spotlight rect. */
  pad?: number;
};

const STEPS: Step[] = [
  {
    target: '[data-tour="composer"]',
    title: "Type your idea here",
    text: "One short sentence is enough — Megsy turns it into steps or content.",
    placement: "top",
    pad: 10,
  },
  {
    target: '[data-tour="plus"]',
    title: "Add anything from +",
    text: "Photos, videos and creation tools all live behind this button.",
    placement: "top",
    pad: 12,
  },
  {
    target: '[data-tour="send"]',
    title: "Send when ready",
    text: "Tap send and Megsy gets to work right away.",
    placement: "top",
    pad: 12,
  },
  {
    target: '[data-tour="model"]',
    title: "Switch models anytime",
    text: "Tap the name at the top to pick the model that fits the task.",
    placement: "bottom",
    pad: 8,
  },
];

type Rect = { x: number; y: number; w: number; h: number };

const TOOLTIP_W = 300;
const TOOLTIP_GAP = 14;
const VIEWPORT_MARGIN = 14;

function readRect(selector: string): Rect | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

export const MobileOnboardingTour = () => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 0,
    h: typeof window !== "undefined" ? window.innerHeight : 0,
  }));
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipH, setTooltipH] = useState(140);
  const reduced = useReducedMotion();

  // Boot — only show the first time.
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      return;
    }
    // Wait a moment for the composer to mount.
    const t = window.setTimeout(() => setOpen(true), 600);
    return () => window.clearTimeout(t);
  }, []);

  const finish = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  // Resolve the rect for the current step. Skip steps with missing targets.
  useLayoutEffect(() => {
    if (!open) return;
    let cancelled = false;

    const resolve = () => {
      if (cancelled) return;
      let idx = step;
      let r: Rect | null = null;
      while (idx < STEPS.length) {
        r = readRect(STEPS[idx].target);
        if (r) break;
        idx += 1;
      }
      if (idx >= STEPS.length) {
        finish();
        return;
      }
      if (idx !== step) {
        setStep(idx);
        return;
      }
      setRect(r);
      // Scroll target into view if it's outside.
      const el = document.querySelector(STEPS[idx].target) as HTMLElement | null;
      if (el) {
        const top = el.getBoundingClientRect().top;
        if (top < 60 || top > window.innerHeight - 120) {
          el.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
        }
      }
    };

    resolve();
    // Re-resolve on resize / scroll / orientation change.
    const onResize = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      resolve();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", resolve, true);
    window.addEventListener("orientationchange", onResize);

    // Watch the target for layout changes (composer autogrow, etc.).
    const el = document.querySelector(STEPS[step].target) as HTMLElement | null;
    const ro = el && "ResizeObserver" in window ? new ResizeObserver(resolve) : null;
    if (el && ro) ro.observe(el);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", resolve, true);
      window.removeEventListener("orientationchange", onResize);
      if (ro) ro.disconnect();
    };
  }, [open, step, reduced]);

  // Measure tooltip height after render to place the arrow accurately.
  useLayoutEffect(() => {
    if (tooltipRef.current) {
      setTooltipH(tooltipRef.current.getBoundingClientRect().height);
    }
  }, [step, rect]);

  // Keyboard: ESC skips, ArrowRight advances.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  const next = () => {
    if (step >= STEPS.length - 1) finish();
    else setStep((s) => s + 1);
  };

  if (!open || !rect) {
    return (
      <AnimatePresence>
        {open && (
          <motion.div
            key="tour-fade"
            className="fixed inset-0 z-[120] bg-background/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>
    );
  }

  const current = STEPS[step];
  const pad = current.pad ?? 10;

  // Spotlight hole geometry.
  const hx = Math.max(8, rect.x - pad);
  const hy = Math.max(8, rect.y - pad);
  const hw = Math.min(viewport.w - 16, rect.w + pad * 2);
  const hh = rect.h + pad * 2;
  const radius = Math.min(28, Math.max(12, Math.min(hw, hh) / 2));

  // Decide placement.
  const spaceAbove = hy;
  const spaceBelow = viewport.h - (hy + hh);
  let placement: "top" | "bottom" =
    current.placement === "top"
      ? "top"
      : current.placement === "bottom"
        ? "bottom"
        : spaceBelow >= spaceAbove
          ? "bottom"
          : "top";
  // Flip if not enough room.
  if (placement === "top" && spaceAbove < tooltipH + TOOLTIP_GAP + 16) placement = "bottom";
  if (placement === "bottom" && spaceBelow < tooltipH + TOOLTIP_GAP + 16) placement = "top";

  // Tooltip x — clamp inside viewport, try to center on the target.
  const targetCenterX = rect.x + rect.w / 2;
  let tipX = targetCenterX - TOOLTIP_W / 2;
  tipX = Math.max(VIEWPORT_MARGIN, Math.min(viewport.w - TOOLTIP_W - VIEWPORT_MARGIN, tipX));

  // Tooltip y.
  const tipY =
    placement === "top" ? hy - TOOLTIP_GAP - tooltipH : hy + hh + TOOLTIP_GAP;

  // Arrow x relative to tooltip.
  const arrowX = Math.max(18, Math.min(TOOLTIP_W - 30, targetCenterX - tipX - 6));

  const ease = reduced ? "linear" : ([0.32, 0.72, 0, 1] as const);

  return (
    <AnimatePresence>
      <motion.div
        key="tour-root"
        className="fixed inset-0 z-[120]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        dir="ltr"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-text"
      >
        {/* Spotlight SVG — mask cuts a rounded hole. Clicks pass through the hole. */}
        <svg
          className="absolute inset-0 h-full w-full"
          width={viewport.w}
          height={viewport.h}
          style={{ pointerEvents: "none" }}
          aria-hidden
        >
          <defs>
            <mask id="megsy-tour-mask">
              <rect x="0" y="0" width={viewport.w} height={viewport.h} fill="white" />
              <motion.rect
                initial={false}
                animate={{ x: hx, y: hy, width: hw, height: hh, rx: radius, ry: radius }}
                transition={{ type: "spring", stiffness: 260, damping: 30, mass: 0.7 }}
                fill="black"
              />
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width={viewport.w}
            height={viewport.h}
            fill="rgba(0,0,0,0.74)"
            mask="url(#megsy-tour-mask)"
            style={{ pointerEvents: "auto" }}
            onClick={finish}
          />
          {/* Pulsing ring around the hole */}
          <motion.rect
            initial={false}
            animate={{ x: hx, y: hy, width: hw, height: hh, rx: radius, ry: radius }}
            transition={{ type: "spring", stiffness: 260, damping: 30, mass: 0.7 }}
            fill="none"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth={1.5}
          />
          <motion.rect
            initial={false}
            animate={{
              x: hx - 4,
              y: hy - 4,
              width: hw + 8,
              height: hh + 8,
              rx: radius + 4,
              ry: radius + 4,
              opacity: reduced ? 0 : [0.0, 0.35, 0.0],
            }}
            transition={{
              x: { type: "spring", stiffness: 260, damping: 30 },
              y: { type: "spring", stiffness: 260, damping: 30 },
              width: { type: "spring", stiffness: 260, damping: 30 },
              height: { type: "spring", stiffness: 260, damping: 30 },
              opacity: { duration: 1.6, repeat: Infinity, ease: "easeInOut" },
            }}
            fill="none"
            stroke="var(--overlay-white-90)"
            strokeWidth={2}
          />
        </svg>

        {/* Close button — top right, always reachable */}
        <button
          type="button"
          onClick={finish}
          aria-label="Skip tour"
          className="absolute right-3 z-[2] flex h-9 w-9 items-center justify-center rounded-full bg-foreground/10 text-foreground/80 backdrop-blur-md hover:bg-foreground/20"
          style={{ top: "max(env(safe-area-inset-top), 12px)" }}
        >
          <X className="h-4 w-4" />
        </button>

        {/* Tooltip */}
        <motion.div
          ref={tooltipRef}
          key={`tip-${step}`}
          initial={{ opacity: 0, y: placement === "top" ? 8 : -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.28, ease }}
          className="absolute rounded-2xl border border-foreground/10 bg-surface-1/95 p-4 text-left shadow-2xl backdrop-blur-xl"
          style={{
            left: tipX,
            top: tipY,
            width: TOOLTIP_W,
          }}
        >
          {/* Arrow */}
          <span
            aria-hidden
            className="absolute h-3 w-3 rotate-45 border border-foreground/10 bg-surface-1/95"
            style={{
              left: arrowX,
              ...(placement === "top"
                ? { bottom: -7, borderTop: "none", borderLeft: "none" }
                : { top: -7, borderBottom: "none", borderRight: "none" }),
            }}
          />

          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-foreground/65">
              Step {step + 1} of {STEPS.length}
            </span>
            <div className="flex items-center gap-1.5">
              {STEPS.map((_, i) => (
                <motion.span
                  key={i}
                  className="block h-1.5 rounded-full"
                  animate={{
                    width: i === step ? 18 : 6,
                    backgroundColor:
                      i === step ? "var(--overlay-white-90)" : "var(--overlay-white-25)",
                  }}
                  transition={{ duration: 0.25 }}
                />
              ))}
            </div>
          </div>

          <h3
            id="tour-title"
            className="mt-2.5 text-[16px] font-semibold leading-tight text-foreground"
          >
            {current.title}
          </h3>
          <p id="tour-text" className="mt-1.5 text-[13.5px] leading-6 text-foreground/70">
            {current.text}
          </p>

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={finish}
              className="text-[13px] text-foreground/55 hover:text-foreground/85"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={next}
              className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-background transition-transform active:scale-95"
            >
              {step >= STEPS.length - 1 ? "Got it" : "Next"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default MobileOnboardingTour;
