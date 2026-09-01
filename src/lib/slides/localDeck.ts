/**
 * Local (client-side) deck builder — used as a fallback when the external
 * presentation provider is unavailable (e.g. 401 Unauthorized). It reuses the
 * plan/brief the user already approved so the deck matches the outline exactly,
 * and never calls the external provider.
 */
import type { SlideDeck, SlideData } from "@/components/chat/SlidesDeckCard";
import { parseSlidesOutline } from "@/lib/slidesOutlineParser";
import { findSlidesTemplate } from "@/lib/slidesTemplates";
import { generateSlidesOutline } from "./generateOutline";

function paletteFor(templateId?: string): SlideDeck["palette"] {
  const tpl = findSlidesTemplate(templateId);
  const [primary, accent] = tpl.colors || ["#6366f1", "#22d3ee"];
  return { primary, accent, bg: "#0b0b0f", fg: "#ffffff" };
}

/** Turns "Slide N: title / - bullets" steps into renderable slides. */
function stepsToSlides(
  steps: { title: string; items: string[] }[],
  topic: string,
): SlideData[] {
  const slides: SlideData[] = [
    { type: "title", layout: "title", title: steps[0]?.title || topic, subtitle: topic },
  ];
  steps.forEach((s, i) => {
    if (i === 0 && steps.length > 1) return; // first step used as the cover
    const bullets = (s.items || []).filter(Boolean).slice(0, 6);
    slides.push({
      type: "bullets",
      layout: bullets.length ? "bullets" : "statement",
      title: s.title,
      bullets: bullets.length ? bullets : undefined,
      body: bullets.length ? undefined : s.title,
    });
  });
  return slides;
}

export async function buildLocalDeck(params: {
  topic: string;
  brief?: string;
  templateId?: string;
  language?: "ar" | "en";
  userId?: string;
}): Promise<SlideDeck | null> {
  const tpl = findSlidesTemplate(params.templateId);
  let steps = params.brief ? parseSlidesOutline(params.brief).steps : [];

  if (!steps.length) {
    const plan = await generateSlidesOutline({
      topic: params.topic,
      language: params.language,
      userId: params.userId,
    }).catch(() => null);
    steps = plan?.outline?.steps || [];
  }
  if (!steps.length) return null;

  return {
    title: steps[0]?.title || params.topic,
    subtitle: params.topic,
    language: params.language || "en",
    templateId: tpl.id,
    palette: paletteFor(params.templateId),
    slides: stepsToSlides(steps, params.topic),
  };
}

/**
 * Builds the deck straight from the approved plan (outline + the content the
 * user reviewed), so every slide in the deck carries exactly the text shown in
 * the planning card. Used whenever a reviewed plan exists.
 */
export function buildDeckFromPlan(
  plan: import("./planTypes").SlidesPlanState,
): SlideDeck | null {
  const steps = plan.outline?.steps || [];
  if (!steps.length) return null;
  const tpl = findSlidesTemplate(plan.templateId);
  const ar = plan.language === "ar";

  const slides: SlideData[] = [];
  const cover = steps[0];
  slides.push({
    type: "cover",
    layout: "title",
    title: cover?.title || plan.topic,
    subtitle: plan.topic,
  });

  steps.forEach((step, i) => {
    if (i === 0 && steps.length > 1) return;
    const written = plan.content?.[i]?.body?.trim();
    const bullets = (step.items || []).filter(Boolean).slice(0, 6);
    slides.push({
      type: bullets.length ? "bullets" : "statement",
      layout: bullets.length ? "bullets" : "statement",
      title: step.title,
      bullets: bullets.length ? bullets : undefined,
      body: written || (bullets.length ? undefined : step.title),
    });
  });

  const sources = plan.research?.sources?.slice(0, 6) || [];
  if (sources.length) {
    slides.push({
      type: "bullets",
      layout: "bullets",
      title: "Sources",
      bullets: sources.map((s) => `${s.title} — ${s.url}`),
    });
  }

  return {
    title: cover?.title || plan.topic,
    subtitle: plan.topic,
    language: plan.language || "en",
    templateId: tpl.id,
    palette: paletteFor(plan.templateId),
    slides,
  };
}
