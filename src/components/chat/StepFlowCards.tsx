import { useMemo } from "react";

export type StepItem = {
  index: number;
  text: string;
};

/**
 * Step cards are an explicit AI tool — they only render when the assistant
 * emits a fenced block with the `steps` language tag, for example:
 *
 *   ```steps
 *   Define the target audience
 *   Choose the channels
 *   Build a 30-day calendar
 *   ```
 *
 * Each non-empty line inside the block becomes one card. The block is
 * stripped from the surrounding markdown so it renders as cards only.
 * We never auto-detect numbered lists — the model has full control.
 */
const STEPS_BLOCK_RE = /```steps\s*\n([\s\S]*?)\n?```/gi;

export function parseSteps(raw: string): { steps: StepItem[]; remaining: string } {
  if (!raw || typeof raw !== "string") return { steps: [], remaining: raw || "" };
  STEPS_BLOCK_RE.lastIndex = 0;
  const match = STEPS_BLOCK_RE.exec(raw);
  if (!match) return { steps: [], remaining: raw };

  const inner = match[1] || "";
  const lines = inner
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s+/, "").trim())
    .filter(Boolean);

  if (lines.length < 1) return { steps: [], remaining: raw };

  const steps: StepItem[] = lines.map((text, i) => ({ index: i + 1, text }));
  // Strip ALL steps blocks from remaining so they don't leak into markdown.
  const remaining = raw.replace(STEPS_BLOCK_RE, "").trim();
  return { steps, remaining };
}

interface Props {
  steps: StepItem[];
}

/**
 * Vertical stack of glossy purple "button"-style step cards.
 * Same look on mobile and desktop — never side by side.
 */
export default function StepFlowCards({ steps }: Props) {
  const points = useMemo(() => Array.from({ length: 10 }), []);
  if (!steps.length) return null;

  return (
    <div className="my-4 flex flex-col gap-3">
      {steps.map((s, i) => (
        <div
          key={i}
          className="step-card animate-in fade-in slide-in-from-bottom-2 duration-500"
          style={{ animationDelay: `${i * 80}ms`, animationFillMode: "backwards" }}
        >
          <span className="fold" aria-hidden />
          <span className="points_wrapper" aria-hidden>
            {points.map((_, p) => (
              <span key={p} className="point" />
            ))}
          </span>
          <span className="step-card-inner">
            <span className="step-card-index">{s.index}</span>
            <span className="step-card-text">{s.text}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
