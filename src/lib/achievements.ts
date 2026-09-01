/**
 * Client-side achievements engine. Zero network cost, pure localStorage.
 * Tracks variety of use (message count tiers, time-of-day, feature usage)
 * without visible celebrations or toasts.
 */
const KEY = "megsy.achievements.v1";
const COUNTERS_KEY = "megsy.achievements.counters.v1";

export type AchievementId =
  | "chatty_10"
  | "chatty_50"
  | "chatty_250"
  | "chatty_1000"
  | "first_image"
  | "first_video"
  | "first_research"
  | "first_code"
  | "first_slides"
  | "first_docs"
  | "streak_3"
  | "streak_7"
  | "streak_30"
  | "streak_100"
  | "night_owl"
  | "early_bird"
  | "weekend_warrior"
  | "polyglot"
  | "voice_first"
  | "explorer_5" // used 5+ different features
  | "mind_reader_10"
  | "mind_reader_50";

export interface AchievementDef {
  id: AchievementId;
  emoji: string;
  title: string;
  titleAr: string;
  desc: string;
  descAr: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "chatty_10", emoji: "🗣️", title: "Getting warm", titleAr: "تسخين", desc: "10 messages sent", descAr: "أرسلت 10 رسائل" },
  { id: "chatty_50", emoji: "🔥", title: "On a roll", titleAr: "متحمس", desc: "50 messages sent", descAr: "أرسلت 50 رسالة" },
  { id: "chatty_250", emoji: "⚡", title: "Power user", titleAr: "مستخدم محترف", desc: "250 messages sent", descAr: "أرسلت 250 رسالة" },
  { id: "chatty_1000", emoji: "🏆", title: "Legend", titleAr: "أسطورة", desc: "1000 messages sent", descAr: "أرسلت 1000 رسالة" },
  { id: "first_image", emoji: "🎨", title: "Artist", titleAr: "فنان", desc: "Generated your first image", descAr: "أول صورة مولّدة" },
  { id: "first_video", emoji: "🎬", title: "Director", titleAr: "مخرج", desc: "Generated your first video", descAr: "أول فيديو مولّد" },
  { id: "first_research", emoji: "🔬", title: "Researcher", titleAr: "باحث", desc: "Ran your first deep research", descAr: "أول Deep research" },
  { id: "first_code", emoji: "💻", title: "Coder", titleAr: "مبرمج", desc: "Ran code for the first time", descAr: "أول Run code" },
  { id: "first_slides", emoji: "📊", title: "Presenter", titleAr: "مقدّم", desc: "Made your first slides", descAr: "أول عرض تقديمي" },
  { id: "first_docs", emoji: "📄", title: "Writer", titleAr: "كاتب", desc: "Created your first document", descAr: "أول مستند" },
  { id: "streak_3", emoji: "🌱", title: "Sprout", titleAr: "برعم", desc: "3-day streak", descAr: "سلسلة 3 أيام" },
  { id: "streak_7", emoji: "🌿", title: "Week strong", titleAr: "أسبوع قوي", desc: "7-day streak", descAr: "سلسلة أسبوع" },
  { id: "streak_30", emoji: "🌳", title: "Rooted", titleAr: "متجذّر", desc: "30-day streak", descAr: "سلسلة month" },
  { id: "streak_100", emoji: "💎", title: "Diamond mind", titleAr: "عقل ماسي", desc: "100-day streak", descAr: "سلسلة 100 يوم" },
  { id: "night_owl", emoji: "🦉", title: "Night owl", titleAr: "بومة الليل", desc: "Chatted after midnight", descAr: "دردشت بعد منتصف الليل" },
  { id: "early_bird", emoji: "🐦", title: "Early bird", titleAr: "طائر الفجر", desc: "Chatted before 6 AM", descAr: "دردشت قبل الفجر" },
  { id: "weekend_warrior", emoji: "⚔️", title: "Weekend warrior", titleAr: "محارب العطلة", desc: "Chatted on Fri + Sat", descAr: "دردشت الجمعة والسبت" },
  { id: "polyglot", emoji: "🌍", title: "Polyglot", titleAr: "متعدد اللغات", desc: "Used 3+ languages", descAr: "استخدمت 3 لغات أو أكثر" },
  { id: "voice_first", emoji: "🎙️", title: "Speak up", titleAr: "تكلم", desc: "First voice message", descAr: "أول رسالة صوتية" },
  { id: "explorer_5", emoji: "🧭", title: "Explorer", titleAr: "مستكشف", desc: "Tried 5+ features", descAr: "جربت 5 مزايا أو أكثر" },
  { id: "mind_reader_10", emoji: "🧠", title: "Mind reader", titleAr: "قارئ الأفكار", desc: "Auto-detected 10 intents", descAr: "اكتشف الشات نيّتك 10 مرات" },
  { id: "mind_reader_50", emoji: "🔮", title: "Telepath", titleAr: "قارئ عقول", desc: "Auto-detected 50 intents", descAr: "اكتشف الشات نيّتك 50 مرة" },
];

interface UnlockRecord {
  id: AchievementId;
  at: number;
}
interface Counters {
  messages: number;
  features: Record<string, boolean>;
  langs: Record<string, boolean>;
  daysOfWeek: Record<string, boolean>; // "0".."6"
  intentsAutoRouted?: number;
}

function readUnlocks(): UnlockRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as UnlockRecord[];
  } catch {
    return [];
  }
}

function writeUnlocks(list: UnlockRecord[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
}

function readCounters(): Counters {
  try {
    const raw = localStorage.getItem(COUNTERS_KEY);
    if (raw) return { messages: 0, features: {}, langs: {}, daysOfWeek: {}, ...JSON.parse(raw) };
  } catch {}
  return { messages: 0, features: {}, langs: {}, daysOfWeek: {} };
}

function writeCounters(c: Counters) {
  try { localStorage.setItem(COUNTERS_KEY, JSON.stringify(c)); } catch {}
}

export function isUnlocked(id: AchievementId): boolean {
  return readUnlocks().some((u) => u.id === id);
}

export function listUnlocked(): UnlockRecord[] {
  return readUnlocks();
}

function unlock(id: AchievementId) {
  const list = readUnlocks();
  if (list.some((u) => u.id === id)) return false;
  list.push({ id, at: Date.now() });
  writeUnlocks(list);
  return true;
}

/**
 * Main tracker. Call after any meaningful user action.
 * `event` names are stable strings — extend as new features ship.
 */
export function track(
  event:
    | "message_sent"
    | "image_generated"
    | "video_generated"
    | "research_started"
    | "code_ran"
    | "slides_created"
    | "docs_created"
    | "voice_used"
    | "intent_auto_routed"
    | "streak_milestone",
  meta?: { streakCount?: number; lang?: string; intent?: string },
) {
  const c = readCounters();

  if (event === "message_sent") {
    c.messages += 1;
    const hr = new Date().getHours();
    const dow = String(new Date().getDay());
    c.daysOfWeek[dow] = true;
    if (meta?.lang) c.langs[meta.lang] = true;

    if (c.messages >= 10) unlock("chatty_10");
    if (c.messages >= 50) unlock("chatty_50");
    if (c.messages >= 250) unlock("chatty_250");
    if (c.messages >= 1000) unlock("chatty_1000");
    if (hr >= 0 && hr < 5) unlock("night_owl");
    if (hr >= 4 && hr < 6) unlock("early_bird");
    if (c.daysOfWeek["5"] && c.daysOfWeek["6"]) unlock("weekend_warrior");
    if (Object.keys(c.langs).length >= 3) unlock("polyglot");
  }

  const featureMap: Partial<Record<typeof event, { key: string; id: AchievementId }>> = {
    image_generated: { key: "image", id: "first_image" },
    video_generated: { key: "video", id: "first_video" },
    research_started: { key: "research", id: "first_research" },
    code_ran: { key: "code", id: "first_code" },
    slides_created: { key: "slides", id: "first_slides" },
    docs_created: { key: "docs", id: "first_docs" },
    voice_used: { key: "voice", id: "voice_first" },
  };
  const fm = featureMap[event];
  if (fm) {
    c.features[fm.key] = true;
    unlock(fm.id);
    if (Object.keys(c.features).length >= 5) unlock("explorer_5");
  }

  if (event === "streak_milestone" && meta?.streakCount != null) {
    const n = meta.streakCount;
    if (n >= 3) unlock("streak_3");
    if (n >= 7) unlock("streak_7");
    if (n >= 30) unlock("streak_30");
    if (n >= 100) unlock("streak_100");
  }

  if (event === "intent_auto_routed") {
    c.intentsAutoRouted = (c.intentsAutoRouted ?? 0) + 1;
    if (c.intentsAutoRouted >= 10) unlock("mind_reader_10");
    if (c.intentsAutoRouted >= 50) unlock("mind_reader_50");
  }

  writeCounters(c);
}

export function progress() {
  const total = ACHIEVEMENTS.length;
  const unlocked = readUnlocks().length;
  return { unlocked, total, pct: Math.round((unlocked / total) * 100) };
}
