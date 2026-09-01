import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { animate, m as motion, type PanInfo, useMotionValue, useTransform } from "framer-motion";
import AppSidebar from "@/components/layout/AppSidebar";
import { useUserLang } from "@/lib/authI18n";

const RTL_UI_LANGS = new Set(["ar", "ar-eg", "he", "fa"]);
const CLOSE_SNAP = 0.64;
const FLING_VELOCITY = 520;
const PUSH_SPRING = { type: "spring" as const, stiffness: 240, damping: 34, mass: 1.05 };

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewChat?: () => void;
  onSelectConversation?: (id: string) => void;
  activeConversationId?: string | null;
  currentMode?: string;
  children: ReactNode;
}

/**
 * Claude-style "push" sidebar shell for mobile.
 * Renders the AppSidebar as a fixed underlay beneath the page content and
 * pushes the page to the right with rounded corners, dim overlay and drag
 * gestures (edge-swipe to open, drag-left to close).
 *
 * Desktop is untouched — children render normally and the sidebar underlay
 * is hidden.
 */
export default function MobilePushShell({
  open,
  onOpenChange,
  onNewChat,
  onSelectConversation,
  activeConversationId,
  currentMode = "chat",
  children,
}: Props) {
  const [revealX, setRevealX] = useState(0);
  const lang = useUserLang();
  const isRtlUi = RTL_UI_LANGS.has(lang);
  const pushX = isRtlUi ? -revealX : revealX;
  const shellX = useMotionValue(0);
  const progress = useTransform(shellX, (latest) =>
    revealX > 0 ? clamp(Math.abs(latest) / revealX, 0, 1) : 0,
  );
  const shellScale = useTransform(progress, [0, 1], [1, 0.94]);
  const shellRadius = useTransform(progress, [0, 1], [0, 32]);
  const shellShadow = useTransform(progress, (p) =>
    p > 0.02
      ? `0 30px 90px -20px rgba(0,0,0,${0.36 + p * 0.34}), 0 0 0 1px rgba(255,255,255,${p * 0.06})`
      : "0 0 0 rgba(0,0,0,0)",
  );
  const animationRef = useRef<{ stop: () => void } | null>(null);
  const animateShellTo = useCallback(
    (nextOpen: boolean) => {
      animationRef.current?.stop();
      animationRef.current = animate(
        shellX,
        nextOpen ? pushX : 0,
        nextOpen ? PUSH_SPRING : { type: "spring", stiffness: 360, damping: 42, mass: 0.9 },
      );
    },
    [pushX, shellX],
  );

  useEffect(() => {
    animateShellTo(open);
    return () => animationRef.current?.stop();
  }, [animateShellTo, open]);

  useEffect(() => {
    const compute = () =>
      setRevealX(Math.min(Math.round(window.innerWidth * 0.82), 320));
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  // Edge swipe to open. Listeners are passive (no preventDefault), so tap /
  // click synthesis on touch devices is never cancelled — the reason the old
  // pointer-capture implementation was removed.
  const touchRef = useRef<{ x: number; y: number; edge: boolean } | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    if (open) return;
    const t = e.touches[0];
    if (!t) return;
    const fromLeading = isRtlUi ? window.innerWidth - t.clientX : t.clientX;
    touchRef.current = { x: t.clientX, y: t.clientY, edge: fromLeading <= 28 };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start || !start.edge || open) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = Math.abs(t.clientY - start.y);
    const openDx = isRtlUi ? -dx : dx;
    if (openDx > 56 && dy < 44) onOpenChange(true);
  };

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (!open) return;
    const shouldClose = isRtlUi
      ? info.offset.x > Math.max(72, revealX * (1 - CLOSE_SNAP)) || info.velocity.x > FLING_VELOCITY
      : info.offset.x < -Math.max(72, revealX * (1 - CLOSE_SNAP)) || info.velocity.x < -FLING_VELOCITY;
    onOpenChange(!shouldClose);
    animateShellTo(!shouldClose);
  };

  return (
    <>
      {/* Mobile underlay sidebar */}
      <div className="md:hidden">
        <AppSidebar
          underlay
          mobileSide={isRtlUi ? "right" : "left"}
          open={open}
          onClose={() => onOpenChange(false)}
          onNewChat={onNewChat ?? (() => {})}
          onSelectConversation={onSelectConversation}
          activeConversationId={activeConversationId ?? null}
          currentMode={currentMode}
        />
      </div>

      {/* Pushed page surface — desktop passes through unchanged. */}
      <motion.div
        data-mobile-push-shell="true"
        style={{
          x: shellX,
          scale: shellScale,
          borderRadius: shellRadius,
          boxShadow: shellShadow,
          transformOrigin: isRtlUi ? "right center" : "left center",
          touchAction: "pan-y",
        }}
        drag={open ? "x" : false}
        dragDirectionLock
        dragConstraints={isRtlUi ? { left: -revealX, right: 0 } : { left: 0, right: revealX }}
        dragElastic={isRtlUi ? { left: 0.03, right: 0.14 } : { left: 0.14, right: 0.03 }}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => {
          touchRef.current = null;
        }}
        className="relative min-h-[100dvh] overflow-visible max-md:z-[2] max-md:overflow-x-clip max-md:overscroll-x-none max-md:bg-background md:!transform-none"
      >
        {children}

        {/* Tap-to-close overlay + dim, mobile only */}
        <motion.div
          className={`md:hidden absolute inset-0 z-[60] ${
            open
              ? "pointer-events-auto"
              : "pointer-events-none"
          }`}
          style={{ background: "rgba(0,0,0,0.42)", opacity: progress }}
          onClick={() => onOpenChange(false)}
          aria-hidden={!open}
        />
      </motion.div>
    </>
  );
}
