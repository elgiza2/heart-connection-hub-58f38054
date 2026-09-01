/**
 * @doc Unified in-app service router.
 *
 * Reads a free-text message and decides which internal service should handle
 * it (chat, images, video, slides, docs, deep research, computer agent).
 * Unlike the older single-intent detector it can return MORE than one service
 * for a single message ("اعمل سلايدس وصور عن الفضاء") so the app can run the
 * primary service immediately and offer the rest as one-tap follow-ups.
 *
 * Pure and client-safe: regex only, no network, no side effects.
 */

import type { ChatMode } from "@/pages/chat/chatConstants";

export type ServiceId =
  | "chat"
  | "images"
  | "video"
  | "slides"
  | "docs"
  | "research"
  | "computer";

export interface ServiceHit {
  service: ServiceId;
  score: number;
}

export interface RouteDecision {
  /** Best matching service; "chat" means keep the normal chat flow. */
  primary: ServiceId;
  /** Additional services the same message also asked for. */
  secondary: ServiceId[];
  /** 0..1 — how confident we are about `primary`. */
  confidence: number;
}

interface Rule {
  service: ServiceId;
  weight: number;
  re: RegExp;
}

const RULES: Rule[] = [
  // ── Images ───────────────────────────────────────────────
  { service: "images", weight: 3, re: /\b(generate|create|make|draw|design)\b[^.?!]{0,40}\b(image|picture|photo|logo|poster|illustration|artwork|avatar|thumbnail)s?\b/i },
  { service: "images", weight: 3, re: /(ارسم|إرسم|صمم|صمّم|اعمل|إعمل|انشئ|أنشئ|ولّد|ولد|هات)\s*(لي|لى)?\s*(صورة|صوره|صور|لوجو|شعار|بوستر|تصميم|رسمة|رسمه|خلفية)/ },
  { service: "images", weight: 2, re: /\b(image|photo)\s*(generation|gen)\b/i },

  // ── Video ────────────────────────────────────────────────
  { service: "video", weight: 3, re: /\b(generate|create|make|produce|animate)\b[^.?!]{0,40}\b(video|clip|reel|animation|short)s?\b/i },
  { service: "video", weight: 3, re: /(اعمل|إعمل|انشئ|أنشئ|ولّد|ولد|صمم)\s*(لي|لى)?\s*(فيديو|فيديوهات|كليب|ريلز|ريل|مقطع|أنيميشن|انيميشن)/ },

  // ── Slides ───────────────────────────────────────────────
  { service: "slides", weight: 3, re: /\b(slide|slides|deck|presentation|powerpoint|pitch deck|keynote)\b/i },
  { service: "slides", weight: 3, re: /(سلايد|سلايدز|سلايدس|عرض\s*تقديمي|بريزنتيشن|باوربوينت|بوربوينت|برزنتيشن)/ },

  // ── Docs / files ─────────────────────────────────────────
  { service: "docs", weight: 3, re: /\b(write|draft|prepare|generate)\b[^.?!]{0,40}\b(report|document|contract|proposal|cv|resume|letter|invoice|spreadsheet|excel|pdf|docx?)\b/i },
  { service: "docs", weight: 3, re: /(اكتب|اعمل|إعمل|جهّز|جهز|حضّر|حضر|انشئ|أنشئ)\s*(لي|لى)?\s*(تقرير|مستند|وثيقة|عقد|سيرة\s*ذاتية|رسالة\s*رسمية|فاتورة|شيت|اكسل|إكسل|ملف\s*ورد|pdf)/i },

  // ── Deep research ────────────────────────────────────────
  { service: "research", weight: 3, re: /\b(deep\s*research|research\s+(report|paper|about|on)|literature review|market research|competitive analysis)\b/i },
  { service: "research", weight: 3, re: /(بحث\s*(عميق|شامل|موسع|مفصل)|ابحث\s*بعمق|دراسة\s*سوق|تحليل\s*منافسين|اعمل\s*بحث)/ },

  // ── Computer agent ───────────────────────────────────────
  { service: "computer", weight: 4, re: /(^|\s)@computer\b/i },
  { service: "computer", weight: 3, re: /\b(go to|open|visit|log in to|login to|sign in to)\b[^.?!]{0,40}(https?:\/\/|www\.|\.com|\.net|\.org|website|site)/i },
  { service: "computer", weight: 3, re: /\b(scrape|crawl)\b|\b(run|execute)\b[^.?!]{0,30}\b(script|command|terminal|shell|program)\b|\bautomat(e|ion)\b/i },
  { service: "computer", weight: 3, re: /(افتح\s*(موقع|الموقع|المتصفح|كروم|رابط)|(شغّل|شغل|نفّذ|نفذ)\s*(كود|سكربت|أمر|برنامج|تيرمنال)|أتمتة|اوتوميشن|احجز|املأ\s*(فورم|نموذج))/ },
];

const NEGATION =
  /(\b(cancel|stop|don't|do not|without|no need)\b|لغيت|إلغاء|الغاء|مش\s*عايز|مش\s*عاوز|بلاش|متعملش)/i;

/** Maps a service to the chat mode that runs it (null → agent-based). */
export const SERVICE_TO_MODE: Record<ServiceId, ChatMode | null> = {
  chat: "normal",
  images: "images",
  video: "video",
  slides: "slides",
  docs: "normal",
  research: "deep-research",
  computer: null,
};

export const SERVICE_LABEL_AR: Record<ServiceId, string> = {
  chat: "المحادثة",
  images: "الصور",
  video: "الفيديو",
  slides: "السلايدز",
  docs: "المستندات",
  research: "البحث العميق",
  computer: "الكمبيوتر",
};

export const SERVICE_LABEL_EN: Record<ServiceId, string> = {
  chat: "Chat",
  images: "Images",
  video: "Video",
  slides: "Slides",
  docs: "Documents",
  research: "Deep Research",
  computer: "Agent",
};

export function serviceLabel(service: ServiceId, lang?: string): string {
  return lang?.startsWith("ar")
    ? SERVICE_LABEL_AR[service]
    : SERVICE_LABEL_EN[service];
}

/** Scores every service against the text and returns the ranked decision. */
export function routeServices(text: string): RouteDecision {
  const t = (text || "").trim();
  const empty: RouteDecision = { primary: "chat", secondary: [], confidence: 0 };
  if (!t || t.length < 6 || NEGATION.test(t)) return empty;

  const scores = new Map<ServiceId, number>();
  for (const rule of RULES) {
    if (!rule.re.test(t)) continue;
    scores.set(rule.service, (scores.get(rule.service) || 0) + rule.weight);
  }
  if (scores.size === 0) return empty;

  const ranked: ServiceHit[] = [...scores.entries()]
    .map(([service, score]) => ({ service, score }))
    .sort((a, b) => b.score - a.score);

  const [best, ...rest] = ranked;
  // Secondary services need a real signal of their own (score >= 3) so a
  // single stray keyword never spawns a follow-up suggestion.
  const secondary = rest.filter((h) => h.score >= 3).map((h) => h.service).slice(0, 2);

  return {
    primary: best.service,
    secondary,
    confidence: Math.min(1, best.score / 4),
  };
}

/** Confidence at/above which the router switches without asking. */
export const ROUTE_AUTO_APPLY = 0.7;
