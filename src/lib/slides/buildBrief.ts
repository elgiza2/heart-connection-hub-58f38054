import type { SlidesPlanState } from "./planTypes";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * Turns the approved plan (outline + research findings + imported file data +
 * reviewed content) into a single rich brief string that is sent to the deck
 * generator as the "topic". This is what makes generation follow the plan the
 * user actually approved instead of re-inventing the deck.
 */
export function buildSlidesBrief(plan: SlidesPlanState): string {
  const ar = plan.language === "ar";
  const parts: string[] = [];

  parts.push(`Topic: ${plan.topic}`);
  parts.push(
    [
      "Follow this approved outline exactly: same order, same slide count, same titles.",
      "Do not add any extra slide after the last one: no credits, sources, references, graphics/icon library, thank-you or branding slide.",
      "Never mention the generation tool, template author, or any provider name in the deck.",
    ].join(" "),
  );

  const steps = plan.outline?.steps || [];
  steps.forEach((s, i) => {
    const written = plan.content?.[i]?.body?.trim();
    const bullets = (s.items || []).map((b) => `  - ${b}`).join("\n");
    parts.push(
      [`Slide ${i + 1}: ${s.title}`, bullets, written ? `  > ${clip(written, 700)}` : ""]
        .filter(Boolean)
        .join("\n"),
    );
  });

  if (plan.research?.summary) {
    parts.push(
      ("Deep research findings (use as the factual source):\n") +
        clip(plan.research.summary, 6000),
    );
    const src = (plan.research.sources || []).slice(0, 10);
    if (src.length) {
      parts.push(
        ("Sources:\n") + src.map((s) => `- ${s.title} (${s.url})`).join("\n"),
      );
    }
  }

  if (plan.sourceText?.trim()) {
    parts.push(
      ("User-provided data (analyze it and use its real numbers; do not invent data):\n") +
        clip(plan.sourceText.trim(), 8000),
    );
  }

  return parts.join("\n\n");
}
