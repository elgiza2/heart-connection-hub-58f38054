/** @doc Study HUD — the persistent progress bar for Learn Mode (streak, XP, Bloom rung, accuracy). Renders only when chatMode==="learning" and reads live from studyProgress via a subscription so every card answer updates it. */

import { useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { Flame, RotateCcw, Sparkles, Target, TrendingUp, Repeat, LayoutDashboard } from "lucide-react";
import {
  getStudyState,
  resetStudyState,
  subscribeStudyState,
  BLOOM_LABEL,
  BLOOM_ORDER,
  prefersReducedMotion,
  type StudyState,
} from "@/lib/studyProgress";
import { getDueSummary, subscribeMemory } from "@/lib/learnMemory";

let dueSnapshot = getDueSummary(Date.now(), 3);
const getDueSnapshot = () => dueSnapshot;
const subscribeDueSnapshot = (cb: () => void) =>
  subscribeMemory(() => {
    dueSnapshot = getDueSummary(Date.now(), 3);
    cb();
  });

/**
 * A calm, sticky top strip that shows learners how they're doing at
 * a glance. Only mounts inside Learning Mode (guarded by the parent).
 *
 * Design goals:
 *  • Reads like a system, not a game — no bright cartoons, no XP-bar
 *    dopamine bait. A single row of quiet metrics.
 *  • Silent when nothing has happened yet (0 cards answered → hidden).
 *  • Zero layout thrash — fixed height, absolute positioning inside
 *    the messages column so it never fights the composer.
 */
export function StudyHUD() {
  // useSyncExternalStore isn't strictly necessary here (no tearing risk
  // for this UI), but it gives us a clean subscribe-based rerender with
  // SSR-safe getServerSnapshot.
  const state = useSyncExternalStore<StudyState>(
    subscribeStudyState,
    getStudyState,
    getStudyState,
  );
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    // Cross-device sync — mirror local study state to `app_kv` and rehydrate on mount.
    let cleanup: (() => void) | undefined;
    import("@/lib/studyProgressSync").then((m) => {
      cleanup = m.installStudyProgressSync();
    });
    return () => cleanup?.();
  }, []);

  // Hide until the learner has actually done something. Prevents the
  // HUD from screaming "0 streak" the moment learning mode opens.
  if (!mounted) return null;
  if (state.cardsAnswered === 0 && !state.topic) return null;

  const rungIdx = BLOOM_ORDER.indexOf(state.rung);
  const rungPct = ((rungIdx + 1) / BLOOM_ORDER.length) * 100;
  const accuracy =
    state.cardsAnswered > 0
      ? Math.round((state.cardsCorrect / state.cardsAnswered) * 100)
      : 0;
  const reduced = prefersReducedMotion();

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Learning progress: streak ${state.streak}, XP ${state.xp}, Bloom rung ${BLOOM_LABEL[state.rung]}, accuracy ${accuracy} percent`}
      className={`sticky top-16 z-20 mx-auto mb-2 max-w-3xl px-3 ${
        reduced ? "" : "animate-fade-in"
      }`}
    >
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl px-3 py-2 shadow-[0_10px_30px_-20px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-2.5 md:gap-4 text-[11px] md:text-xs font-medium text-foreground/80">
          {/* Topic — truncates on mobile */}
          {state.topic ? (
            <div className="hidden md:flex items-center gap-1.5 min-w-0 max-w-[38%] pr-2 border-e border-border/50">
              <Target className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="truncate text-foreground/90" title={state.topic}>
                {state.topic}
              </span>
            </div>
          ) : null}

          {/* Streak */}
          <HudStat
            icon={<Flame className={`w-3.5 h-3.5 ${state.streak > 0 ? "text-amber-500" : "text-muted-foreground"}`} />}
            label="Streak"
            value={String(state.streak)}
            hint={state.bestStreak > state.streak ? `best ${state.bestStreak}` : undefined}
          />

          {/* XP */}
          <HudStat
            icon={<Sparkles className="w-3.5 h-3.5 text-violet-500" />}
            label="XP"
            value={state.xp.toLocaleString()}
          />

          {/* Accuracy */}
          <HudStat
            icon={<TrendingUp className="w-3.5 h-3.5 text-emerald-500" />}
            label="Accuracy"
            value={`${accuracy}%`}
            hint={`${state.cardsCorrect}/${state.cardsAnswered}`}
          />

          {/* Due review chip — surfaces spaced-repetition items */}
          <DueChip />


          {/* Bloom rung — takes remaining space */}
          <div className="ms-auto min-w-0 hidden sm:flex items-center gap-2 flex-1 max-w-[220px]">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground shrink-0">
              {BLOOM_LABEL[state.rung]}
            </span>
            <div
              className="relative h-1.5 flex-1 rounded-full bg-muted/70 overflow-hidden"
              aria-hidden
            >
              <div
                className={`absolute inset-y-0 start-0 bg-gradient-to-r from-emerald-400 via-blue-500 to-violet-500 ${
                  reduced ? "" : "transition-[width] duration-500 ease-out"
                }`}
                style={{ width: `${rungPct}%` }}
              />
            </div>
          </div>

          {/* Dashboard link */}
          <Link
            to="/learn"
            aria-label="Learning panel"
            title="Learning panel"
            className="ms-1 shrink-0 inline-flex items-center gap-1 px-1.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <LayoutDashboard className="w-3 h-3" />
          </Link>

          {/* Reset — quiet, confirm-then-clear */}
          <ResetButton />
        </div>
      </div>
    </div>
  );
}

function DueChip() {
  const summary = useSyncExternalStore(
    subscribeDueSnapshot,
    getDueSnapshot,
    getDueSnapshot,
  );
  const count = summary.count;
  if (count === 0) return null;
  const label = count === 1 ? "1 due" : `${count} due`;
  return (
    <div
      className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-400/40 bg-amber-500/10 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300"
      title="Items due for spaced-repetition review — ask the tutor to /review"
      aria-label={`${count} items due for review`}
    >
      <Repeat className="w-3 h-3" />
      {label}
    </div>
  );
}


function ResetButton() {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 3000);
    return () => window.clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        resetStudyState();
        setArmed(false);
      }}
      aria-label={armed ? "Confirm reset" : "Reset learning session"}
      title={armed ? "Tap again to confirm" : "Reset session"}
      className={`ms-1 shrink-0 inline-flex items-center gap-1 px-1.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors ${
        armed
          ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-400/40"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
      }`}
    >
      <RotateCcw className="w-3 h-3" />
      {armed ? "Confirm" : ""}
    </button>
  );
}

function HudStat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {icon}
      <div className="flex items-baseline gap-1 min-w-0">
        <span className="tabular-nums font-semibold text-foreground">{value}</span>
        <span className="hidden md:inline text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        {hint ? (
          <span className="hidden lg:inline text-[10px] text-muted-foreground">
            · {hint}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default StudyHUD;
