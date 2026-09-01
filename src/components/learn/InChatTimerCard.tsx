import { useEffect, useMemo, useRef, useState } from "react";
import { m as motion } from "framer-motion";
import { Check, Pause, Play, Timer as TimerIcon, X } from "lucide-react";

interface Props {
  id: string;
  totalSec: number;
  startedAt: number;
  paused: boolean;
  pausedRemaining: number | null;
  onPauseToggle: (id: string) => void;
  onCancel: (id: string) => void;
}

const fmt = (s: number) => {
  const m = Math.max(0, Math.floor(s / 60));
  const ss = Math.max(0, Math.floor(s % 60));
  return `${m.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`;
};

/**
 * A minimal, luxe focus-timer pill.
 *  - Emerald while running
 *  - Amber under 60s
 *  - Rose + pulse under 10s
 *  - Celebration state on complete
 */
const InChatTimerCard = ({
  id,
  totalSec,
  startedAt,
  paused,
  pausedRemaining,
  onPauseToggle,
  onCancel,
}: Props) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [paused]);

  const remaining = paused
    ? (pausedRemaining ?? totalSec)
    : Math.max(0, totalSec - Math.floor((now - startedAt) / 1000));
  const done = remaining === 0;
  const pct = totalSec > 0 ? ((totalSec - remaining) / totalSec) * 100 : 0;

  // Tone by urgency
  const tone = useMemo(() => {
    if (done) return "done";
    if (paused) return "paused";
    if (remaining <= 10) return "critical";
    if (remaining <= 60) return "warn";
    return "focus";
  }, [remaining, paused, done]);

  const style = {
    focus: {
      label: "Focus",
      ring: "text-emerald-500",
      bg: "text-emerald-500/15",
      chip: "text-emerald-700/80 dark:text-emerald-400/80",
      border: "border-emerald-500/25",
      shadow: "shadow-[0_8px_24px_-10px_rgba(5,150,105,0.4)]",
      icon: "text-emerald-600 dark:text-emerald-400",
      btn: "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
    },
    warn: {
      label: "Focus",
      ring: "text-amber-500",
      bg: "text-amber-500/15",
      chip: "text-amber-700/80 dark:text-amber-400/80",
      border: "border-amber-500/30",
      shadow: "shadow-[0_8px_24px_-10px_rgba(217,119,6,0.4)]",
      icon: "text-amber-600 dark:text-amber-400",
      btn: "bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300",
    },
    critical: {
      label: "Almost done",
      ring: "text-rose-500",
      bg: "text-rose-500/15",
      chip: "text-rose-700/90 dark:text-rose-400/90",
      border: "border-rose-500/40",
      shadow: "shadow-[0_8px_24px_-10px_rgba(244,63,94,0.55)]",
      icon: "text-rose-600 dark:text-rose-400",
      btn: "bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300",
    },
    paused: {
      label: "Paused",
      ring: "text-muted-foreground",
      bg: "text-muted-foreground",
      chip: "text-muted-foreground",
      border: "border-border/40",
      shadow: "shadow-[0_6px_20px_-10px_rgba(0,0,0,0.3)]",
      icon: "text-muted-foreground",
      btn: "bg-muted/40 hover:bg-muted/60 text-foreground/80",
    },
    done: {
      label: "Complete",
      ring: "text-emerald-500",
      bg: "text-emerald-500/15",
      chip: "text-emerald-700 dark:text-emerald-300",
      border: "border-emerald-500/40",
      shadow: "shadow-[0_10px_30px_-8px_rgba(16,185,129,0.55)]",
      icon: "text-emerald-600 dark:text-emerald-300",
      btn: "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-200",
    },
  }[tone];

  // Play a soft beep once on completion
  const bell = useRef(false);
  useEffect(() => {
    if (!done || bell.current) return;
    bell.current = true;
    try {
      const A = (window.AudioContext || (window as any).webkitAudioContext) as
        | typeof AudioContext
        | undefined;
      if (!A) return;
      const ctx = new A();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.35);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.55);
    } catch {
      /* silent */
    }
  }, [done]);

  const pulseClass = tone === "critical" ? "animate-pulse" : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.94 }}
      animate={
        done
          ? { opacity: 1, y: 0, scale: [1, 1.05, 1] }
          : { opacity: 1, y: 0, scale: 1 }
      }
      exit={{ opacity: 0, y: -8, scale: 0.94 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      className={`mx-auto w-fit max-w-[92%] rounded-full liquid-glass-milk px-3 py-1.5 border ${style.border} ${style.shadow} backdrop-blur-xl`}
      role="status"
      aria-live={done ? "polite" : "off"}
      aria-label={
        done
          ? "Focus timer complete"
          : `${style.label} timer: ${fmt(remaining)} remaining`
      }
    >
      <div className="flex items-center gap-2.5">
        <div className={`relative w-8 h-8 shrink-0 ${pulseClass}`}>
          <svg viewBox="0 0 36 36" className="w-8 h-8 -rotate-90">
            <circle
              cx="18"
              cy="18"
              r="15.9"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className={style.bg}
            />
            <circle
              cx="18"
              cy="18"
              r="15.9"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeDasharray={`${done ? 100 : pct}, 100`}
              strokeLinecap="round"
              className={`${style.ring} transition-[stroke-dasharray] duration-500 ease-out`}
            />
          </svg>
          {done ? (
            <Check className={`absolute inset-0 m-auto w-3.5 h-3.5 ${style.icon}`} />
          ) : (
            <TimerIcon className={`absolute inset-0 m-auto w-3 h-3 ${style.icon}`} />
          )}
        </div>
        <div className="flex flex-col min-w-0 leading-none">
          <span
            className={`text-[9px] uppercase tracking-[0.14em] font-semibold ${style.chip}`}
          >
            {style.label}
          </span>
          <span className="text-sm font-bold text-foreground tabular-nums">
            {done ? "🎉 Done" : fmt(remaining)}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {!done && (
            <button
              type="button"
              onClick={() => onPauseToggle(id)}
              className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${style.btn}`}
              aria-label={paused ? "Resume timer" : "Pause timer"}
            >
              {paused ? (
                <Play className="w-3 h-3" fill="currentColor" />
              ) : (
                <Pause className="w-3 h-3" fill="currentColor" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => onCancel(id)}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-accent/40 text-foreground/70 transition-colors"
            aria-label="Dismiss timer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default InChatTimerCard;
