import { AnimatePresence, m as motion } from "framer-motion";
import { Check, ChevronDown, Lock } from "lucide-react";
import { Suspense, lazy, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { promptUpgrade } from "@/lib/upgradeMoment";
import { glassModelMenu, glassModelMenuStyle } from "@/components/model-picker/glassModelMenuStyles";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUserPlan } from "@/hooks/useUserPlan";
import { isPaidUser } from "@/lib/subscriptionGating";

const DraggablePlusSheet = lazy(() =>
  import("./DraggablePlusSheet").then((m) => ({ default: m.DraggablePlusSheet })),
);


export type ResearchDepth = "pro" | "ultra" | "ultra2x" | "ultra4x" | "ultra8x";

interface ResearchDepthDropdownProps {
  researchDepth: ResearchDepth;
  setResearchDepth: (depth: ResearchDepth) => void;
  researchDepthOpen: boolean;
  setResearchDepthOpen: (open: boolean | ((v: boolean) => boolean)) => void;
}

const DEPTH_OPTIONS: Array<{ id: ResearchDepth; label: string; hint: string; time: string; pro?: boolean }> = [
  { id: "pro", label: "Pro", hint: "Exploratory web research", time: "2 – 10 min" },
  { id: "ultra", label: "Ultra (Recommended)", hint: "Extensive deep research", time: "5 – 25 min" },
  { id: "ultra2x", label: "Ultra 2x", hint: "Advanced research · 2x compute", time: "5 – 50 min", pro: true },
  { id: "ultra4x", label: "Ultra 4x", hint: "Advanced research · 4x compute", time: "5 – 90 min", pro: true },
  { id: "ultra8x", label: "Ultra 8x", hint: "Advanced research · 8x compute", time: "5 min – 2 hr", pro: true },
];

const LABEL_MAP: Record<ResearchDepth, string> = {
  pro: "Pro",
  ultra: "Ultra",
  ultra2x: "Ultra 2x",
  ultra4x: "Ultra 4x",
  ultra8x: "Ultra 8x",
};

export default function ResearchDepthDropdown({
  researchDepth,
  setResearchDepth,
  researchDepthOpen,
  setResearchDepthOpen,
}: ResearchDepthDropdownProps) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = useState<{ left: number; bottom: number; width: number } | null>(null);
  const MENU_W = 200;
  const isMobile = useIsMobile();
  const { plan } = useUserPlan();
  const paid = isPaidUser(plan);


  useLayoutEffect(() => {
    if (!researchDepthOpen || !btnRef.current || isMobile) return;
    const update = () => {
      const r = btnRef.current!.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const bottom = Math.max(8, vh - r.top + 8);
      let left = r.right - MENU_W;
      left = Math.max(8, Math.min(left, vw - MENU_W - 8));
      setPos({ left, bottom, width: MENU_W });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [researchDepthOpen, isMobile]);

  const renderOptions = (variant: "sheet" | "dropdown") => (
    <>
      {DEPTH_OPTIONS.map((d) => {
        const active = researchDepth === d.id;
        const locked = !!d.pro && !paid;
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => {
              if (locked) {
                promptUpgrade(d.label, `${d.label} runs ${d.hint.toLowerCase()} — available on Pro.`);
                setResearchDepthOpen(false);
                return;
              }
              setResearchDepth(d.id);
              toast.success(`Selected: ${d.label}`);
              setResearchDepthOpen(false);
            }}

            className={
              variant === "sheet"
                ? `w-full flex items-center justify-between gap-3 px-4 py-4 rounded-2xl text-[15px] font-semibold text-left transition-all ${active ? "text-foreground bg-foreground/8" : "text-foreground/85 hover:text-foreground hover:bg-foreground/5"}`
                : `w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-[13px] font-semibold text-left transition-all ${active ? "text-foreground bg-foreground/5" : "text-foreground/85 hover:text-foreground hover:bg-foreground/5"}`
            }
          >
            <span className="flex flex-col items-start">
              <span className="flex items-center gap-1.5">
                <span>{d.label}</span>
                {d.pro && (
                  <span
                    className={
                      variant === "sheet"
                        ? "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-amber-400/25 to-orange-400/25 text-amber-500 border border-amber-400/30"
                        : "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-gradient-to-r from-amber-400/25 to-orange-400/25 text-amber-500 border border-amber-400/30"
                    }
                  >
                    {locked && <Lock className="w-2.5 h-2.5" />}
                    Pro
                  </span>
                )}

              </span>
              <span
                className={
                  variant === "sheet"
                    ? "text-[12.5px] font-normal text-foreground/55 mt-0.5"
                    : "text-[11px] font-normal text-foreground/50"
                }
              >
                {d.hint}
              </span>
              <span
                className={
                  variant === "sheet"
                    ? "text-[11.5px] font-normal text-foreground/65 mt-0.5"
                    : "text-[10.5px] font-normal text-foreground/65 mt-0.5"
                }
              >
                {d.time}
              </span>
            </span>
            {active && (
              <Check
                className={variant === "sheet" ? "w-5 h-5" : "w-4 h-4"}
                strokeWidth={2.5}
              />
            )}
          </button>
        );
      })}
    </>
  );

  const renderMobileSheet = () => {
    if (typeof document === "undefined" || !researchDepthOpen) return null;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const composerTop = btnRef.current?.getBoundingClientRect().top ?? vh - 96;
    const collapsedH = Math.max(360, Math.min(vh * 0.6, composerTop - 24));
    const expandedH = Math.max(collapsedH, Math.min(vh * 0.75, composerTop - 8));

    return createPortal(
      <AnimatePresence>
        <motion.div
          key="depth-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="md:hidden fixed inset-0 z-[55] bg-transparent"
          onClick={() => setResearchDepthOpen(false)}
        />
        <Suspense fallback={null}>
          <DraggablePlusSheet
            height={expandedH}
            collapsedY={0}
            onClose={() => setResearchDepthOpen(false)}
            initialExpanded
            dragEnabled={false}
          >
            <div className="px-2 pt-1 pb-3 h-full flex flex-col min-h-0">
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/65 shrink-0">
                Report depth
              </p>
              <div
                className="flex flex-col gap-1 flex-1 min-h-0 pb-4"
                style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", touchAction: "pan-y" }}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
              >
                {renderOptions("sheet")}
              </div>
            </div>
          </DraggablePlusSheet>
        </Suspense>
      </AnimatePresence>,
      document.body,
    );
  };

  const renderDesktopDropdown = () => {
    if (typeof document === "undefined") return null;
    return createPortal(
      <AnimatePresence>
        {researchDepthOpen && pos && (
          <>
            <div
              className="fixed inset-0 z-[9998]"
              onClick={() => setResearchDepthOpen(false)}
            />
            <motion.div
              data-tier-menu
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.97 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              style={{
                position: "fixed",
                left: pos.left,
                bottom: pos.bottom,
                width: pos.width,
                zIndex: 9999,
                maxHeight: "50vh",
                overflowY: "auto",
                ...glassModelMenuStyle,
              }}
              className={`${glassModelMenu.panel} p-1.5 unified-menu-surface`}
            >
              {renderOptions("dropdown")}
            </motion.div>
          </>
        )}
      </AnimatePresence>,
      document.body,
    );
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setResearchDepthOpen((v) => !v)}
        className={glassModelMenu.triggerPill}
        aria-label="Report depth"
        aria-expanded={researchDepthOpen}
      >
        <span>{LABEL_MAP[researchDepth]}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 opacity-70 transition-transform ${researchDepthOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isMobile ? renderMobileSheet() : renderDesktopDropdown()}
    </div>
  );
}
