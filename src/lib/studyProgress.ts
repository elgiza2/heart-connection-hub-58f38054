/** @doc Study progress persistence — tracks streak, XP, Bloom rung, mastery per topic across the Learn Mode session, and feeds a compact [LEARN_STATE] hint into the tutor system prompt so responses adapt in real time. */

import { formatMemoryForPrompt } from "@/lib/learnMemory";

// ============================================================
// Study Progress — the "memory" of Learn Mode
// ------------------------------------------------------------
// Stores lightweight learner-state in localStorage so:
//  • the AI tutor can see streak/XP/Bloom rung and truly adapt
//    (not just claim to adapt in the system prompt)
//  • the StudyHUD can render live progress across turns
//  • the exam runner + flashcards can survive a page reload
//
// Zero external deps. Safe on SSR (guards every window/localStorage
// touch). Fires a "megsy:study-progress" event on every write so
// subscribers rerender without prop-drilling.
// ============================================================

export type BloomRung =
  | "remember"
  | "understand"
  | "apply"
  | "analyze"
  | "evaluate"
  | "create";

export const BLOOM_ORDER: BloomRung[] = [
  "remember",
  "understand",
  "apply",
  "analyze",
  "evaluate",
  "create",
];

export const BLOOM_LABEL: Record<BloomRung, string> = {
  remember: "Remember",
  understand: "Understand",
  apply: "Apply",
  analyze: "Analyze",
  evaluate: "Evaluate",
  create: "Create",
};

export interface StudyState {
  version: 1;
  topic: string; // best guess of the current subject
  streak: number; // current correct-in-a-row streak
  bestStreak: number; // all-time best (nice HUD flex)
  xp: number; // total XP earned across the session
  rung: BloomRung; // current Bloom's ladder rung
  correctInRow: number; // for promotion logic (3 correct → promote)
  wrongInRow: number; // for demotion logic (2 wrong → drop)
  cardsAnswered: number;
  cardsCorrect: number;
  sessionStartedAt: number; // epoch ms
  lastAnsweredAt: number; // epoch ms
  hintsUsed: number; // laddered-hint count (affects XP)
}

const STORAGE_KEY = "megsy:study:v1";
const EVENT_NAME = "megsy:study-progress";

const defaultState = (): StudyState => ({
  version: 1,
  topic: "",
  streak: 0,
  bestStreak: 0,
  xp: 0,
  rung: "remember",
  correctInRow: 0,
  wrongInRow: 0,
  cardsAnswered: 0,
  cardsCorrect: 0,
  sessionStartedAt: Date.now(),
  lastAnsweredAt: 0,
  hintsUsed: 0,
});

// useSyncExternalStore requires getSnapshot() to return the exact same object
// while the underlying store has not changed. Reading localStorage and merging
// defaults on every call creates a fresh object each render, which React treats
// as a changed snapshot and can trigger an infinite re-render loop in Learn Mode.
const SERVER_STATE: StudyState = defaultState();
let cachedRaw: string | null | undefined;
let cachedState: StudyState | null = null;

function safeRead(): StudyState {
  if (typeof window === "undefined") return SERVER_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (cachedRaw === raw && cachedState) return cachedState;
    if (!raw) {
      cachedRaw = raw;
      cachedState = defaultState();
      return cachedState;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) {
      cachedRaw = raw;
      cachedState = defaultState();
      return cachedState;
    }
    cachedRaw = raw;
    cachedState = { ...defaultState(), ...parsed } as StudyState;
    return cachedState;
  } catch {
    if (!cachedState) cachedState = defaultState();
    return cachedState;
  }
}

function safeWrite(state: StudyState) {
  if (typeof window === "undefined") return;
  try {
    const raw = JSON.stringify(state);
    cachedRaw = raw;
    cachedState = state;
    window.localStorage.setItem(STORAGE_KEY, raw);
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    /* quota / private mode — silent */
  }
}

export function getStudyState(): StudyState {
  return safeRead();
}

/** Full reset — used by the HUD "reset" affordance or a new session. */
export function resetStudyState(): StudyState {
  const fresh = defaultState();
  safeWrite(fresh);
  return fresh;
}

/** Update the topic label the tutor is drilling on (from checkin/onboarding). */
export function setStudyTopic(topic: string): void {
  const s = safeRead();
  const clean = String(topic || "").slice(0, 80).trim();
  if (!clean || s.topic === clean) return;
  safeWrite({ ...s, topic: clean });
}

function promote(rung: BloomRung): BloomRung {
  const i = BLOOM_ORDER.indexOf(rung);
  return BLOOM_ORDER[Math.min(BLOOM_ORDER.length - 1, i + 1)];
}
function demote(rung: BloomRung): BloomRung {
  const i = BLOOM_ORDER.indexOf(rung);
  return BLOOM_ORDER[Math.max(0, i - 1)];
}

/**
 * Record an answer. Handles:
 *  • streak bump / reset
 *  • XP award (harder Bloom rungs = more XP; hint use taxes reward)
 *  • Bloom promotion after 3-in-a-row correct
 *  • Bloom demotion after 2-in-a-row wrong
 *
 * Returns the fresh state so callers can drive micro-interactions
 * (confetti on streak milestones, haptic on promote/demote, etc).
 */
export function recordAnswer(opts: {
  correct: boolean;
  cardType?: string;
  hintLevel?: 0 | 1 | 2 | 3; // 0=none, higher=more revealed → less XP
}): StudyState {
  const s = safeRead();
  const now = Date.now();
  const rungIdx = BLOOM_ORDER.indexOf(s.rung);
  const baseXp = 10 + rungIdx * 5; // 10, 15, 20, 25, 30, 35
  const hintPenalty = Math.max(0, (opts.hintLevel || 0) * 0.25); // 0, 25%, 50%, 75%
  const earned = opts.correct ? Math.max(2, Math.round(baseXp * (1 - hintPenalty))) : 0;

  const nextStreak = opts.correct ? s.streak + 1 : 0;
  const nextCorrectInRow = opts.correct ? s.correctInRow + 1 : 0;
  const nextWrongInRow = opts.correct ? 0 : s.wrongInRow + 1;

  let nextRung = s.rung;
  if (nextCorrectInRow >= 3) nextRung = promote(s.rung);
  else if (nextWrongInRow >= 2) nextRung = demote(s.rung);

  // Reset the row-counter when rung shifts so the learner gets a fresh
  // 3-in-a-row window at the new level.
  const rungChanged = nextRung !== s.rung;

  const next: StudyState = {
    ...s,
    streak: nextStreak,
    bestStreak: Math.max(s.bestStreak, nextStreak),
    xp: s.xp + earned,
    rung: nextRung,
    correctInRow: rungChanged ? 0 : nextCorrectInRow,
    wrongInRow: rungChanged ? 0 : nextWrongInRow,
    cardsAnswered: s.cardsAnswered + 1,
    cardsCorrect: s.cardsCorrect + (opts.correct ? 1 : 0),
    lastAnsweredAt: now,
    hintsUsed: s.hintsUsed + (opts.hintLevel && opts.hintLevel > 0 ? 1 : 0),
  };
  safeWrite(next);
  return next;
}

/** Called by the laddered-hint UI whenever the learner opens a new tier. */
export function noteHintUsed(): void {
  const s = safeRead();
  safeWrite({ ...s, hintsUsed: s.hintsUsed + 1 });
}

/**
 * Compact single-line hint the tutor can parse from the system prompt.
 * Kept short on purpose — models parse short structured blocks better
 * than paragraphs. Only emitted when the learner has actually answered
 * at least one card in this session (avoids polluting the very first turn).
 */
export function formatStudyStateForPrompt(): string | null {
  const s = safeRead();
  const parts: string[] = [];
  parts.push(`streak=${s.streak}`);
  parts.push(`best_streak=${s.bestStreak}`);
  parts.push(`xp=${s.xp}`);
  parts.push(`rung=${BLOOM_LABEL[s.rung]}`);
  parts.push(`answered=${s.cardsAnswered}`);
  const accuracy =
    s.cardsAnswered > 0 ? Math.round((s.cardsCorrect / s.cardsAnswered) * 100) : 0;
  parts.push(`accuracy=${accuracy}%`);
  if (s.topic) parts.push(`topic="${s.topic.replace(/"/g, '\\"')}"`);
  const stateLine = `[LEARN_STATE] ${parts.join(" ")}`;

  // Append durable long-term memory (due reviews + recent misconceptions)
  // when available — this is what makes the tutor feel like it *remembers*
  // the learner across turns and sessions.
  let memoryBlock: string | null = null;
  try {
    memoryBlock = formatMemoryForPrompt();
  } catch {
    memoryBlock = null;
  }

  if (s.cardsAnswered === 0 && !s.topic && !memoryBlock) return null;
  return memoryBlock ? `${stateLine}\n${memoryBlock}` : stateLine;
}

/** React-friendly subscribe helper. Fires on every write from any tab. */
export function subscribeStudyState(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  const storageHandler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", storageHandler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", storageHandler);
  };
}

/** Small helper: unified haptic pulse for LearnCard interactions. */
export function hapticFeedback(kind: "correct" | "wrong" | "tap" | "streak"): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as any;
  if (typeof nav.vibrate !== "function") return;
  try {
    if (kind === "correct") nav.vibrate(8);
    else if (kind === "wrong") nav.vibrate([8, 40, 8]);
    else if (kind === "streak") nav.vibrate([12, 30, 12, 30, 20]);
    else nav.vibrate(4);
  } catch {
    /* iOS Safari & some browsers throw when called outside a gesture */
  }
}

/** Respect the OS "reduce motion" preference — used across LearnCard. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
