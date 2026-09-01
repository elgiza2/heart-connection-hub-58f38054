// Parses an LLM "slides outline" message into structured steps.
// Looks for headers like:  "Slide 1: ...", "Slide 1: ...", "## Slide 1 ..."
// Returns: { intro, steps: [{ title, items }] }

export interface SlidesOutlineStep {
  title: string;
  items: string[];
}

export interface SlidesOutline {
  intro: string;
  steps: SlidesOutlineStep[];
}

const SLIDE_HEADER_RE =
  /^\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(?:Slide|slide|Slide|SLIDE)\s*\d+\s*[:：\-—]\s*(.+?)(?:\*\*)?\s*$/;

export function parseSlidesOutline(content: string): SlidesOutline {
  const lines = content.split(/\r?\n/);
  const intro: string[] = [];
  const steps: SlidesOutlineStep[] = [];
  let current: SlidesOutlineStep | null = null;

  for (const raw of lines) {
    const line = raw.replace(/\*\*/g, "").trim();
    const m = raw.match(SLIDE_HEADER_RE);
    if (m) {
      if (current) steps.push(current);
      current = { title: m[1].replace(/\*\*/g, "").trim(), items: [] };
      continue;
    }
    if (!current) {
      if (line) intro.push(line);
      continue;
    }
    if (!line) continue;
    // Strip bullet markers
    const cleaned = line
      .replace(/^[-*•·]\s+/, "")
      .replace(/^\d+[.)]\s+/, "")
      .trim();
    if (cleaned) current.items.push(cleaned);
  }
  if (current) steps.push(current);
  return { intro: intro.join("\n").trim(), steps };
}
