/**
 * Lightweight daily-streak tracker. Purely client-side (localStorage) so it
 * works offline and instantly — no auth or DB dependency. If the user chats
 * on two consecutive local days the streak grows; a missed day resets to 1.
 *
 * v2 additions:
 *  - **Streak Freeze**: earn one freeze every 7-day milestone (max 2 stored).
 *    A missed day auto-consumes a freeze instead of resetting the streak.
 *  - **at-risk detection**: `isStreakAtRisk()` returns true when today has no
 *    message yet AND the user has an active streak (used for gentle nudges).
 */
const KEY = "megsy.streak.v2";
const LEGACY_KEY = "megsy.streak.v1";
const MAX_FREEZES = 2;

export interface StreakState {
  count: number;
  lastDay: string; // YYYY-MM-DD (local)
  best: number;
  daysThisWeek: string[]; // last 7 unique days
  freezes: number; // available freezes (0..MAX_FREEZES)
  freezesUsed: number; // lifetime consumed (analytics/UI)
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

function emptyState(): StreakState {
  return { count: 0, lastDay: "", best: 0, daysThisWeek: [], freezes: 0, freezesUsed: 0 };
}

export function readStreak(): StreakState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StreakState>;
      return { ...emptyState(), ...parsed };
    }
    // migrate v1 -> v2 once
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const p = JSON.parse(legacy) as Partial<StreakState>;
      const migrated: StreakState = { ...emptyState(), ...p };
      try { localStorage.setItem(KEY, JSON.stringify(migrated)); } catch {}
      return migrated;
    }
  } catch {}
  return emptyState();
}

function write(state: StreakState) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}

/**
 * Call after a successful user message send. Returns the updated state and
 * whether this call *incremented* the streak (useful to fire a celebration).
 */
export function bumpStreak(): {
  state: StreakState;
  incremented: boolean;
  milestone: boolean;
  freezeConsumed: boolean;
  freezeEarned: boolean;
} {
  const t = today();
  const prev = readStreak();
  if (prev.lastDay === t) {
    return { state: prev, incremented: false, milestone: false, freezeConsumed: false, freezeEarned: false };
  }
  let count = 1;
  let freezeConsumed = false;
  let freezes = prev.freezes;
  let freezesUsed = prev.freezesUsed;

  if (prev.lastDay) {
    const gap = daysBetween(prev.lastDay, t);
    if (gap === 1) {
      count = prev.count + 1;
    } else if (gap > 1 && prev.count > 0 && prev.freezes > 0 && gap <= 1 + prev.freezes) {
      // consume freezes to bridge missed day(s)
      const need = gap - 1;
      freezes = prev.freezes - need;
      freezesUsed = prev.freezesUsed + need;
      count = prev.count + 1;
      freezeConsumed = true;
    } else {
      count = 1;
    }
  }

  const best = Math.max(prev.best, count);
  const daysThisWeek = Array.from(new Set([...(prev.daysThisWeek || []), t])).slice(-7);
  const milestone = [3, 7, 14, 30, 60, 100, 365].includes(count);
  // Earn a freeze on every 7-day milestone (cap at MAX_FREEZES).
  const earnedNow = count > 0 && count % 7 === 0 && freezes < MAX_FREEZES;
  if (earnedNow) freezes = Math.min(MAX_FREEZES, freezes + 1);

  const next: StreakState = { count, lastDay: t, best, daysThisWeek, freezes, freezesUsed };
  write(next);
  return { state: next, incremented: true, milestone, freezeConsumed, freezeEarned: earnedNow };
}

/**
 * True when the user has an active streak but hasn't chatted yet today.
 * Used to render a gentle "your streak is at risk" cue after a threshold
 * (e.g. after 18:00 local time) without ever nagging.
 */
export function isStreakAtRisk(): boolean {
  const s = readStreak();
  if (s.count < 2) return false;
  if (s.lastDay === today()) return false;
  const gap = s.lastDay ? daysBetween(s.lastDay, today()) : 999;
  // Still salvageable today: yesterday was last active day.
  return gap === 1;
}

/** Returns count of available freezes without mutating state. */
export function availableFreezes(): number {
  return readStreak().freezes;
}
