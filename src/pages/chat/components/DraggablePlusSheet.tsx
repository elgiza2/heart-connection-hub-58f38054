import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { motion, useMotionValue, animate } from "framer-motion";

interface DraggablePlusSheetProps {
  height: number;
  /** Distance the sheet is pushed down when collapsed (compact state). */
  collapsedY?: number;
  onClose: () => void;
  children: ReactNode;
  initialExpanded?: boolean;
  dragEnabled?: boolean;
  view?: string;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  bottomOffset?: number;
  sheetKind?: "tools" | "integrations";
}

/**
 * iOS-style springs.
 * SNAP  - firm, used for every settle (open / collapse / expand / close).
 * SOFT  - slightly softer, used for the handle morph.
 */
const SNAP = { type: "spring" as const, stiffness: 460, damping: 44, mass: 0.9 };
const SOFT = { type: "spring" as const, stiffness: 300, damping: 34, mass: 0.9 };
/** Dismissal is a short, calm tween - never a spring fly-off. */
const EXIT = { duration: 0.26, ease: [0.32, 0.72, 0, 1] as const };
const EXIT_FADE = { duration: 0.2, ease: [0.4, 0, 1, 1] as const };

/** px/ms thresholds. */
const FLICK = 0.55;


/**
 * Bottom sheet with two snap points (collapsed / expanded) and one dismiss
 * point (fully off-screen).
 *
 * Gesture model (single pointer, no library drag - the library's drag fights
 * the inner scroller):
 *  - The gesture direction is decided once, after a 6px threshold, and the
 *    sheet either drags or the content scrolls for the rest of that gesture.
 *  - Dragging down is only allowed when the content is at scrollTop 0, so a
 *    mid-list drag never yanks the sheet.
 *  - An upward swipe inside compact content expands the sheet. Once expanded,
 *    content keeps native scrolling and never dismisses the sheet.
 *  - Upward dismissal is deliberately restricted to the grip, preventing an
 *    ordinary list scroll from being mistaken for a close gesture.
 *  - Dragging down from the grip collapses first, then dismisses.
 *  - Settling is velocity-projected: a flick decides the direction, distance
 *    only matters for slow drags.
 */
export const DraggablePlusSheet = ({
  height,
  collapsedY = 0,
  onClose,
  children,
  onScroll,
  initialExpanded = false,
  bottomOffset = 0,
  sheetKind = "tools",
}: DraggablePlusSheetProps) => {
  const startSnap = initialExpanded || collapsedY <= 0 ? 0 : collapsedY;
  const y = useMotionValue(height);
  const opacity = useMotionValue(1);
  const [expanded, setExpanded] = useState(initialExpanded || collapsedY <= 0);
  const expandedRef = useRef(expanded);
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);

  useEffect(() => {
    const controls = animate(y, startSnap, SNAP);
    return controls.stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setExpandedState = useCallback((next: boolean) => {
    expandedRef.current = next;
    setExpanded(next);
  }, []);

  const close = useCallback(
    (_direction: "down" | "up" = "down") => {
      if (closingRef.current) return;
      closingRef.current = true;
      // Always leave the same way: a short slide out of the bottom with a
      // gentle fade. No velocity carry-over, so it never shoots off-screen.
      animate(opacity, 0, EXIT_FADE);
      animate(y, height, { ...EXIT, onComplete: onClose });
    },
    [height, onClose, opacity, y],
  );


  const snapTo = useCallback(
    (target: "expanded" | "collapsed", velocity = 0) => {
      setExpandedState(target === "expanded");
      animate(y, target === "expanded" ? 0 : collapsedY, { ...SNAP, velocity });
    },
    [collapsedY, setExpandedState, y],
  );

  /* ------------------------------ gestures ------------------------------ */

  const g = useRef({
    active: false,
    decided: false,
    dragging: false,
    startedExpanded: false,
    fromGrip: false,
    startY: 0,
    baseY: 0,
    lastY: 0,
    lastT: 0,
    velocity: 0,
  });

  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      g.current = {
        active: true,
        decided: false,
        dragging: false,
        startedExpanded: expandedRef.current,
        fromGrip: e.target instanceof Element && Boolean(e.target.closest("[data-sheet-grip]")),
        startY: e.clientY,
        baseY: y.get(),
        lastY: e.clientY,
        lastT: performance.now(),
        velocity: 0,
      };
    };

    const onMove = (e: PointerEvent) => {
      const s = g.current;
      if (!s.active) return;

      const dy = e.clientY - s.startY;
      const now = performance.now();
      const dt = now - s.lastT;
      if (dt > 0) {
        // Low-pass filtered velocity so a single jittery frame can't flick.
        const v = (e.clientY - s.lastY) / dt;
        s.velocity = s.velocity * 0.7 + v * 0.3;
        s.lastY = e.clientY;
        s.lastT = now;
      }

      if (!s.decided) {
        if (Math.abs(dy) < 6) return;
        s.decided = true;
        // Any surface can move the sheet: downward gestures drag the sheet
        // whenever the content is already scrolled to the top, otherwise the
        // native scroller keeps the gesture. Upward gestures from compact
        // expand the sheet; once expanded they always scroll the content.
        const atTop = (scrollRef.current?.scrollTop ?? 0) <= 0;
        s.dragging = s.fromGrip || !s.startedExpanded || (dy > 0 && atTop);
        if (s.dragging) {
          try {
            el.setPointerCapture(e.pointerId);
          } catch {
            /* capture is best-effort */
          }
        }
      }


      if (!s.dragging) return;
      e.preventDefault();

      // Content swiped upward from compact follows the finger only as far as
      // the expanded snap. It must never cross zero and enter the dismiss path.
      const nextY = s.baseY + dy;
      y.set(!s.fromGrip && !s.startedExpanded && dy < 0 ? Math.max(0, nextY) : nextY);
    };

    const settle = (e: PointerEvent) => {
      const s = g.current;
      if (!s.active) return;
      s.active = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      const v = s.velocity; // px/ms, + is downward
      const upFlick = -v;
      if (!s.dragging) return;

      // Upward is a dedicated dismiss path. Requiring either meaningful
      // travel or velocity prevents accidental closes from taps and jitter.
      const travel = e.clientY - s.startY;
      if (travel < 0) {
        // A regular upward scroll in compact content reveals the full list.
        // Only the isolated grip surface can dismiss upward.
        if (!s.fromGrip && !s.startedExpanded) {
          snapTo("expanded", Math.min(v, -0.12) * 1000);
          return;
        }
        if (upFlick > FLICK || travel < -64) close("up");
        else snapTo(s.startedExpanded ? "expanded" : "collapsed", v * 1000);
        return;
      }

      const current = y.get();
      // Project where the sheet lands with the current momentum (~120ms).
      const projected = current + v * 120;
      const dismissLine = collapsedY + Math.max(96, (height - collapsedY) * 0.4);

      if (v > FLICK || projected > dismissLine) {
        // The grip steps expanded -> compact -> closed. A downward gesture on
        // the content itself dismisses in one go.
        if (s.startedExpanded && s.fromGrip && collapsedY > 0) snapTo("collapsed", v * 1000);
        else close("down");
        return;
      }

      if (collapsedY <= 0) {
        snapTo("expanded", v * 1000);
        return;
      }
      const midpoint = collapsedY / 2;
      if (s.startedExpanded) snapTo(projected > midpoint ? "collapsed" : "expanded", v * 1000);
      else snapTo(projected < midpoint ? "expanded" : "collapsed", v * 1000);
    };

    el.addEventListener("pointerdown", onDown, { passive: true });
    el.addEventListener("pointermove", onMove, { passive: false });
    el.addEventListener("pointerup", settle);
    el.addEventListener("pointercancel", settle);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", settle);
      el.removeEventListener("pointercancel", settle);
    };
  }, [close, collapsedY, height, snapTo, y]);

  return (
    <motion.div
      ref={sheetRef}
      key="plus-sheet"
      exit={{ y: height, opacity: 0, transition: EXIT }}
      style={{
        y,
        opacity,
        height,
        paddingBottom: bottomOffset,
        boxShadow: "none",
        // The scroller owns vertical panning while expanded; while collapsed
        // nothing may pan natively so the first gesture always hits the sheet.
        touchAction: expanded ? "pan-y" : "none",
      }}

      data-plus-menu
      data-integrations-sheet={sheetKind === "integrations" ? "true" : undefined}
      onClick={(e) => e.stopPropagation()}
      onWheel={(e) => {
        if (e.deltaY > 0 && !expandedRef.current) snapTo("expanded");
      }}
      className={`mobile-plus-glass-menu fixed bottom-0 left-0 right-0 z-overlay flex flex-col rounded-t-[28px] outline-none will-change-transform ${
        sheetKind === "integrations"
          ? "md:mx-auto md:max-w-[640px] md:rounded-t-[24px]"
          : "md:hidden"
      }`}
    >
      <div data-sheet-grip className="shrink-0 cursor-grab touch-none pt-2.5 pb-3 active:cursor-grabbing">
        <motion.div
          animate={{ width: expanded ? 44 : 38, opacity: expanded ? 0.28 : 0.38 }}
          transition={SOFT}
          className="mx-auto h-[5px] rounded-full bg-foreground"
        />
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overscroll-contain px-3 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]"
        style={{
          WebkitOverflowScrolling: "touch",
          overflowY: expanded ? "auto" : "hidden",
          touchAction: expanded ? "pan-y" : "none",
        }}
      >
        {children}
      </div>
    </motion.div>
  );
};
