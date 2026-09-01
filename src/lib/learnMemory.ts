/** @doc Learn Mode long-term memory — durable per-browser store of studied topics, mistake log, item log, SM-2-lite spaced-repetition due queue, and recurring misconceptions. Feeds compact [DUE_REVIEW] and [RECENT_MISSES] signals into the tutor's system prompt so the AI never forgets what the learner has seen. */

// ============================================================
// learnMemory.ts — the "long memory" of Learn Mode
// ------------------------------------------------------------
// studyProgress.ts holds the *session* metrics (streak, XP, Bloom).
// This module holds the *cross-session* memory the tutor needs to
// stop being a goldfish:
//
//   • topics       — every subject ever studied, with mastery %
//   • itemLog      — every card ever answered (deduped by cardId)
//   • mistakes     — recent wrong answers with the exact question,
//                    the learner's choice, and the correct one
//   • dueQueue     — SM-2-lite schedule for spaced repetition
//   • misconceptions — recurring wrong-pattern buckets per topic
//
// All localStorage, all safe on SSR, all fire the same event so a
// single subscribe() rerenders the HUD + review chip instantly.
// ============================================================

const STORAGE_KEY = "megsy:study:memory:v1";
const EVENT_NAME = "megsy:study-memory";

const MAX_ITEM_LOG = 500;
const MAX_MISTAKES = 60;
const MAX_TOPICS = 80;

// SM-2-lite intervals in minutes.
// index 0 = brand-new / just-missed, escalates on each correct review.
const SM2_INTERVALS_MIN = [10, 60, 24 * 60, 3 * 24 * 60, 7 * 24 * 60, 21 * 24 * 60, 45 * 24 * 60];

export interface TopicRecord {
  id: string;             // slug
  label: string;          // original casing
  firstSeenAt: number;
  lastSeenAt: number;
  totalAnswered: number;
  totalCorrect: number;
  mastery: number;        // 0..100, EMA of correctness weighted by recency
}

export interface ItemRecord {
  id: string;             // stable cardId hash
  topicId: string | null;
  type: string;
  correct: boolean;
  hintLevel: number;
  ts: number;
  reviewStage: number;    // SM-2 index
  dueAt: number;          // epoch ms
  attempts: number;
}

export interface MistakeRecord {
  id: string;             // cardId hash
  topicId: string | null;
  topicLabel?: string;
  question: string;
  chosen: string;
  correct: string;
  ts: number;
  count: number;          // times missed
}

export interface MemoryState {
  version: 1;
  topics: TopicRecord[];
  items: ItemRecord[];
  mistakes: MistakeRecord[];
  misconceptions: Record<string, string[]>; // topicId → list of one-line patterns
}

function defaultState(): MemoryState {
  return {
    version: 1,
    topics: [],
    items: [],
    mistakes: [],
    misconceptions: {},
  };
}

// Stable external-store snapshots for React. Components that use
// useSyncExternalStore must receive the same object reference until the backing
// localStorage value changes; otherwise React sees a changed snapshot on every
// render and can enter an update-depth loop.
const SERVER_MEMORY_STATE: MemoryState = defaultState();
let cachedRaw: string | null | undefined;
let cachedState: MemoryState | null = null;

function safeRead(): MemoryState {
  if (typeof window === "undefined") return SERVER_MEMORY_STATE;
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
    cachedState = { ...defaultState(), ...parsed } as MemoryState;
    return cachedState;
  } catch {
    if (!cachedState) cachedState = defaultState();
    return cachedState;
  }
}

function safeWrite(state: MemoryState) {
  if (typeof window === "undefined") return;
  try {
    const raw = JSON.stringify(state);
    cachedRaw = raw;
    cachedState = state;
    window.localStorage.setItem(STORAGE_KEY, raw);
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    /* quota — silent */
  }
}

/* ─────────────── slug + hash helpers ─────────────── */

export function slugTopic(topic: string): string {
  return String(topic || "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Stable-ish hash for a card so we can dedupe answers across re-renders/stream resumes. */
export function hashCardKey(input: string): string {
  const s = String(input || "");
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return "c_" + (h >>> 0).toString(36);
}

/* ─────────────── read helpers ─────────────── */

export function getMemory(): MemoryState {
  return safeRead();
}

export function subscribeMemory(cb: () => void): () => void {
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

/* ─────────────── writes ─────────────── */

export function noteTopicVisit(topic: string): void {
  const label = String(topic || "").trim();
  if (!label) return;
  const id = slugTopic(label);
  if (!id) return;
  const s = safeRead();
  const now = Date.now();
  const existing = s.topics.find((t) => t.id === id);
  if (existing) {
    existing.lastSeenAt = now;
    existing.label = label; // refresh casing
  } else {
    s.topics.unshift({
      id,
      label,
      firstSeenAt: now,
      lastSeenAt: now,
      totalAnswered: 0,
      totalCorrect: 0,
      mastery: 0,
    });
    if (s.topics.length > MAX_TOPICS) s.topics.length = MAX_TOPICS;
  }
  safeWrite(s);
}

function nextDueFromStage(stage: number, correct: boolean, now: number): { stage: number; dueAt: number } {
  let next = stage;
  if (correct) next = Math.min(SM2_INTERVALS_MIN.length - 1, stage + 1);
  else next = 0; // wrong → back to the beginning
  const minutes = SM2_INTERVALS_MIN[next] ?? SM2_INTERVALS_MIN[SM2_INTERVALS_MIN.length - 1];
  return { stage: next, dueAt: now + minutes * 60_000 };
}

export function logItem(opts: {
  cardId: string;
  topic?: string;
  type: string;
  correct: boolean;
  hintLevel?: number;
}): void {
  const id = String(opts.cardId || "").slice(0, 40);
  if (!id) return;
  const s = safeRead();
  const now = Date.now();
  const topicId = opts.topic ? slugTopic(opts.topic) : null;

  const existing = s.items.find((it) => it.id === id);
  if (existing) {
    // Dedupe: don't double-count the same card mount. Only allow a NEW
    // attempt if enough time has passed (5s) OR the correctness flipped.
    if (now - existing.ts < 5000 && existing.correct === opts.correct) return;
    const nd = nextDueFromStage(existing.reviewStage, opts.correct, now);
    existing.correct = opts.correct;
    existing.hintLevel = opts.hintLevel ?? existing.hintLevel;
    existing.ts = now;
    existing.reviewStage = nd.stage;
    existing.dueAt = nd.dueAt;
    existing.attempts += 1;
    existing.type = opts.type || existing.type;
    if (topicId) existing.topicId = topicId;
  } else {
    const nd = nextDueFromStage(0, opts.correct, now);
    s.items.unshift({
      id,
      topicId,
      type: opts.type || "unknown",
      correct: opts.correct,
      hintLevel: opts.hintLevel ?? 0,
      ts: now,
      reviewStage: nd.stage,
      dueAt: nd.dueAt,
      attempts: 1,
    });
    if (s.items.length > MAX_ITEM_LOG) s.items.length = MAX_ITEM_LOG;
  }

  // Roll up mastery on the topic (EMA on correctness, recency weighted).
  if (topicId) {
    const t = s.topics.find((x) => x.id === topicId);
    if (t) {
      t.totalAnswered += 1;
      if (opts.correct) t.totalCorrect += 1;
      t.lastSeenAt = now;
      const raw = opts.correct ? 100 : 0;
      const alpha = 0.25;
      t.mastery = Math.round(t.mastery * (1 - alpha) + raw * alpha);
    }
  }

  safeWrite(s);
}

export function logMistake(opts: {
  cardId: string;
  topic?: string;
  question: string;
  chosen: string;
  correct: string;
}): void {
  const id = String(opts.cardId || "").slice(0, 40);
  if (!id) return;
  const q = String(opts.question || "").slice(0, 240).trim();
  if (!q) return;
  const s = safeRead();
  const topicId = opts.topic ? slugTopic(opts.topic) : null;
  const existing = s.mistakes.find((m) => m.id === id);
  const now = Date.now();
  if (existing) {
    existing.count += 1;
    existing.ts = now;
    existing.chosen = String(opts.chosen || "").slice(0, 160);
    existing.correct = String(opts.correct || "").slice(0, 160);
    if (topicId) existing.topicId = topicId;
    if (opts.topic) existing.topicLabel = opts.topic;
  } else {
    s.mistakes.unshift({
      id,
      topicId,
      topicLabel: opts.topic,
      question: q,
      chosen: String(opts.chosen || "").slice(0, 160),
      correct: String(opts.correct || "").slice(0, 160),
      ts: now,
      count: 1,
    });
    if (s.mistakes.length > MAX_MISTAKES) s.mistakes.length = MAX_MISTAKES;
  }
  // Track misconception pattern as short one-liner.
  if (topicId) {
    const key = topicId;
    const bucket = s.misconceptions[key] || [];
    const pattern = `confused "${String(opts.chosen).slice(0, 40)}" ↔ "${String(opts.correct).slice(0, 40)}"`;
    if (!bucket.includes(pattern)) {
      bucket.unshift(pattern);
      if (bucket.length > 6) bucket.length = 6;
    }
    s.misconceptions[key] = bucket;
  }
  safeWrite(s);
  // Fire-and-forget mirror to Supabase so the /learn dashboard shows the
  // same mistakes as the in-chat HUD, and progress follows the user across
  // devices. Never blocks the UI, never throws — localStorage remains the
  // source of truth if the DB write fails.
  void mirrorMistakeToDb({
    cardId: id,
    topic: opts.topic,
    chosen: String(opts.chosen || "").slice(0, 160),
    correct: String(opts.correct || "").slice(0, 160),
  });
}

async function mirrorMistakeToDb(opts: {
  cardId: string;
  topic?: string;
  chosen: string;
  correct: string;
}): Promise<void> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return; // anonymous — stays in localStorage only
    const topic = (opts.topic || "general").slice(0, 120);
    const concept = `${opts.chosen} ↔ ${opts.correct}`.slice(0, 240);
    // Look for existing row for this (user, topic, concept) to bump the count.
    const { data: existing } = await supabase
      .from("student_mistakes")
      .select("id, mistake_count, review_stage")
      .eq("user_id", userId)
      .eq("topic", topic)
      .eq("concept", concept)
      .maybeSingle();
    if (existing) {
      await supabase
        .from("student_mistakes")
        .update({
          mistake_count: (existing.mistake_count || 0) + 1,
          updated_at: new Date().toISOString(),
          resolved: false,
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("student_mistakes").insert({
        user_id: userId,
        topic,
        concept,
        mistake_type: "misconception",
        mistake_count: 1,
        review_stage: 0,
        resolved: false,
      });
    }
  } catch {
    // Best-effort only — offline / RLS failure must not break Learn mode.
  }
}

export function clearMemory(): void {
  safeWrite(defaultState());
}

/* ─────────────── prompt formatters ─────────────── */

export interface DueSummary {
  count: number;
  items: MistakeRecord[]; // most-relevant items to surface
}

export function getDueSummary(now: number = Date.now(), limit: number = 3): DueSummary {
  const s = safeRead();
  const overdue = s.items.filter((it) => it.dueAt <= now && !it.correct);
  const overdueOrLapsed = overdue.length
    ? overdue
    : s.items.filter((it) => it.dueAt <= now).slice(0, limit);
  // Map overdue items back to mistake records where possible for readable summaries.
  const mistakeMap = new Map(s.mistakes.map((m) => [m.id, m]));
  const picked: MistakeRecord[] = [];
  for (const it of overdueOrLapsed) {
    const m = mistakeMap.get(it.id);
    if (m) picked.push(m);
    if (picked.length >= limit) break;
  }
  return { count: overdue.length, items: picked };
}

export function getRecentMisses(limit: number = 3): MistakeRecord[] {
  const s = safeRead();
  return s.mistakes.slice(0, limit);
}

/**
 * Compact memory block appended to the [LEARN_STATE] hint so the tutor
 * can pre-empt misconceptions and weave overdue reviews into the turn.
 * Returns null when there's nothing worth saying (keeps the prompt lean).
 */
export function formatMemoryForPrompt(): string | null {
  const now = Date.now();
  const due = getDueSummary(now, 3);
  const misses = getRecentMisses(3);
  const lines: string[] = [];
  if (due.count > 0 && due.items.length > 0) {
    const bits = due.items
      .map((m) => `"${m.question.slice(0, 60)}" (correct: ${m.correct.slice(0, 40)})`)
      .join(" | ");
    lines.push(`[DUE_REVIEW] count=${due.count} items=${bits}`);
  }
  if (misses.length > 0) {
    const bits = misses
      .map((m) => `${m.topicLabel ? m.topicLabel + ": " : ""}chose "${m.chosen.slice(0, 40)}" instead of "${m.correct.slice(0, 40)}" (x${m.count})`)
      .join(" | ");
    lines.push(`[RECENT_MISSES] ${bits}`);
  }
  return lines.length ? lines.join("\n") : null;
}
