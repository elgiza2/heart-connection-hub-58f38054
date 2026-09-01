/**
 * Maps a detected ChatIntent to a concrete UI action:
 * which ChatMode to switch to, which agent (if any), whether the feature is
 * paid, and a nice localized nudge to show the user.
 */

import type { ChatIntent } from "./intentDetector";
import { isPaidUser } from "./subscriptionGating";

export interface IntentAction {
  intent: ChatIntent;
  chatMode?: string;
  agentId?: string;
  /** True → gated behind a paid plan (video generation, premium code, etc.). */
  paid: boolean;
  /** Free fallback the user can try instead (e.g. Nano Banana for images). */
  freeAlternative?: { label: string; modelId?: string };
  /** Localized nudge text shown in the switch-mode toast. */
  nudge: Record<string, string>;
  /** Emoji shown in the nudge banner. */
  emoji: string;
  /** Achievement event name (if any) to `track()` on apply. */
  trackEvent?:
    | "image_generated"
    | "video_generated"
    | "research_started"
    | "code_ran"
    | "slides_created"
    | "docs_created"
    | "voice_used";
}

const NUDGE = (
  en: string,
  ar: string,
  arEg?: string,
  fr?: string,
  es?: string,
  de?: string,
): Record<string, string> => ({
  en,
  ar,
  "ar-eg": arEg || ar,
  fr: fr || en,
  es: es || en,
  de: de || en,
});

export const INTENT_ACTIONS: Record<ChatIntent, IntentAction> = {
  image: {
    intent: "image",
    chatMode: "images",
    agentId: "images",
    paid: false,
    emoji: "🎨",
    trackEvent: "image_generated",
    nudge: NUDGE(
      "Switched to Image mode — pick a model and send your prompt.",
      "تم التبديل إلى وضع Images — Choose a model وأرسل طلبك.",
      "حوّلتك على وضع Images — اختار الموديل وابعت الطلب.",
      "Passage en mode Image — choisis un modèle et envoie ta demande.",
      "Modo Imagen activado — elige un modelo y envía tu petición.",
      "In den Bildmodus gewechselt — Modell wählen und senden.",
    ),
  },
  video: {
    intent: "video",
    chatMode: "video",
    agentId: "videos",
    paid: true,
    freeAlternative: { label: "Image mode (free)", modelId: "megsy-image" },
    emoji: "🎬",
    trackEvent: "video_generated",
    nudge: NUDGE(
      "Switched to Video mode — pick a model and send your prompt.",
      "تم التبديل إلى وضع الفيديو — Choose a model وأرسل طلبك.",
      "حوّلتك على وضع الفيديو — اختار الموديل وابعت الطلب.",
      "Passage en mode Vidéo — choisis un modèle et envoie ta demande.",
      "Modo Vídeo activado — elige un modelo y envía tu petición.",
      "In den Videomodus gewechselt — Modell wählen und senden.",
    ),
  },
  research: {
    intent: "research",
    chatMode: "deep-research",
    agentId: "deep-research",
    paid: false,
    emoji: "🔬",
    trackEvent: "research_started",
    nudge: NUDGE(
      "Deep Research is on — choose depth and send your question.",
      "تم تفعيل الSearch العميق — اختر العمق وأرسل سؤالك.",
      "شغّلت الSearch العميق — اختار العمق وابعت سؤالك.",
      "Recherche approfondie activée — choisis la profondeur et envoie.",
      "Investigación profunda activada — elige la profundidad y envía.",
      "Tiefenrecherche aktiv — Tiefe wählen und Frage senden.",
    ),
  },
  learning: {
    intent: "learning",
    chatMode: "learning",
    paid: false,
    emoji: "🎓",
    nudge: NUDGE(
      "Learning mode is on — I'll teach step-by-step.",
      "تم تفعيل وضع التعليم — سأشرح خطوة بخطوة.",
      "شغّلت وضع التعليم — هشرحلك خطوة بخطوة.",
      "Mode Apprentissage activé — je t'expliquerai étape par étape.",
      "Modo Aprendizaje activado — te enseñaré paso a paso.",
      "Lernmodus aktiv — ich erkläre Schritt für Schritt.",
    ),
  },
  docs: {
    intent: "docs",
    agentId: "docs",
    paid: false,
    emoji: "📄",
    trackEvent: "docs_created",
    nudge: NUDGE(
      "Docs mode selected — pick a template and I'll draft it.",
      "تم اختيار وضع المستندات — اختر قالباً وسأصيغه.",
      "اختارت وضع الدوكس — اختار قالب وأنا هصيغهولك.",
      "Mode Docs sélectionné — choisis un modèle et je le rédige.",
      "Modo Documentos — elige una plantilla y lo redacto.",
      "Docs-Modus — Vorlage wählen und ich verfasse es.",
    ),
  },
  slides: {
    intent: "slides",
    chatMode: "slides",
    agentId: "slides",
    paid: false,
    emoji: "📊",
    trackEvent: "slides_created",
    nudge: NUDGE(
      "Slides mode is on — pick a template and I'll build your deck.",
      "تم تفعيل وضع العروض التقديمية — اختر قالباً وسأبني عرضك.",
      "شغّلت وضع البريزنتيشن — اختار قالب وأنا هبنيلك العرض.",
      "Mode Slides activé — choisis un modèle et je fais le deck.",
      "Modo Diapositivas activado — elige plantilla y creo el deck.",
      "Slides-Modus aktiv — Vorlage wählen und ich baue das Deck.",
    ),
  },
  code: {
    intent: "code",
    chatMode: "code",
    paid: true,
    emoji: "💻",
    trackEvent: "code_ran",
    nudge: NUDGE(
      "Coder is on — describe what to build.",
      "تم تفعيل وضع المبرمج — صف ما تريد بناءه.",
      "شغّلت الكودر — قوللي عايز تبني إيه.",
      "Coder activé — décris ce que tu veux construire.",
      "Modo Coder activado — describe qué construir.",
      "Coder-Modus aktiv — beschreibe, was gebaut werden soll.",
    ),
  },
  website: {
    intent: "website",
    chatMode: "code",
    paid: true,
    emoji: "🌐",
    trackEvent: "code_ran",
    nudge: NUDGE(
      "Coder is on to build your site — describe pages and style.",
      "تم تفعيل المبرمج لBuild a websiteك — صف الصفحات والتصميم.",
      "شغّلت المبرمج علشان يبنيلك الموقع — قوللي الصفحات والاستايل.",
      "Coder activé pour ton site — décris les pages et le style.",
      "Coder activado para tu sitio — describe páginas y estilo.",
      "Coder aktiv für deine Website — Seiten und Stil beschreiben.",
    ),
  },
  voice: {
    intent: "voice",
    agentId: "voice",
    paid: false,
    emoji: "🎙️",
    trackEvent: "voice_used",
    nudge: NUDGE(
      "Voice mode selected — paste the text you want spoken.",
      "تم اختيار وضع الصوت — الصق النص الذي تريد نطقه.",
      "اختارت وضع الصوت — الصقلي النص اللي عايز يتقال.",
      "Mode Voix sélectionné — colle le texte à lire.",
      "Modo Voz — pega el texto para narrar.",
      "Sprach-Modus — Text zum Vorlesen einfügen.",
    ),
  },
  normal: {
    intent: "normal",
    paid: false,
    emoji: "💬",
    nudge: NUDGE("", ""),
  },
};

const PAID_PLAN_NAMES = new Set([
  "starter",
  "pro",
  "pro_plus",
  "plus",
  "business",
  "team",
  "elite",
  "max",
  "ultimate",
  "premium",
  "enterprise",
]);

export function isPaidPlan(planLike?: string | null): boolean {
  const normalized = (planLike || "free").toString().toLowerCase();
  return PAID_PLAN_NAMES.has(normalized) || isPaidUser(normalized);
}

/**
 * Localized nudge lookup with graceful fallback to English then Arabic.
 */
export function nudgeText(action: IntentAction, lang: string): string {
  return (
    action.nudge[lang] ||
    action.nudge[lang?.split("-")[0] || ""] ||
    action.nudge.en ||
    action.nudge.ar ||
    ""
  );
}
