// Parses ::learn cards (JSON blocks tagged "learn_card") out of an assistant message.
// Format expected from the AI:
//
// ```learn
// { "type": "mcq", "question": "...", "options": [...], "correct": 0, "explain": "..." }
// ```
//
// Multiple ```learn blocks per message are supported; surrounding text becomes
// regular markdown segments.

export type LearnCardType =
  | "mcq"
  | "multi"
  | "truefalse"
  | "explain"
  | "fill"
  | "match"
  | "checkin"
  | "mermaid"
  | "roadmap"
  | "exam_setup"
  | "exam_runner"
  | "photo_solve"
  | "onboarding"
  // ── new world-class card types ──
  | "flashcard"      // spaced-repetition flip card (fact-dense recall)
  | "ordering"       // put steps/events in the right order
  | "summary_write"  // Feynman "teach it back in your words"
  | "scenario";      // branching case: medicine, law, ethics, languages

export interface LearnCardData {
  type: LearnCardType;
  [k: string]: any;
}

export interface LearnSegment {
  kind: "text" | "card";
  text?: string;
  card?: LearnCardData;
}

const KNOWN_TYPES = new Set<string>([
  "mcq",
  "multi",
  "truefalse",
  "explain",
  "fill",
  "match",
  "checkin",
  "mermaid",
  "roadmap",
  "exam_setup",
  "exam_runner",
  "photo_solve",
  "onboarding",
  "flashcard",
  "ordering",
  "summary_write",
  "scenario",
]);


// Normalize options so the UI always receives an array of plain strings.
// Some models emit options as { text, correct } / { label, is_correct } / etc.
// In that case we also derive `correct` (index or index[]) when missing.
//
// This function is intentionally forgiving — different models spell every
// field a different way, and we'd rather render a card than silently drop
// it because a key was `question_text` instead of `question`.
function normalizeCard(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;

  // ── Field aliases ────────────────────────────────────────────────
  // Question text: models emit prompt / q / question_text / stem / body
  if (obj.question == null) {
    obj.question =
      obj.prompt ??
      obj.q ??
      obj.question_text ??
      obj.stem ??
      obj.body ??
      obj.text ??
      undefined;
  }
  // Explanation: rationale / reason / because / why / feedback
  if (obj.explain == null) {
    obj.explain =
      obj.explanation ??
      obj.rationale ??
      obj.reason ??
      obj.because ??
      obj.why ??
      obj.feedback ??
      undefined;
  }
  // Correct-answer: answer / correct_answer / correctIndex / correct_option /
  //                  correct_index / correctOption
  if (obj.correct == null) {
    const candidate =
      obj.answer ??
      obj.correct_answer ??
      obj.correctAnswer ??
      obj.correctIndex ??
      obj.correct_index ??
      obj.correctOption ??
      obj.correct_option;
    if (candidate != null) obj.correct = candidate;
  }
  // Some models emit `correct` as a single-letter string ("B"), the full
  // answer text, or a 1-indexed integer. Normalize BEFORE grading — a wrong
  // `correct` value is the #1 cause of the tutor marking a correct pick wrong.
  if (
    (obj.type === "mcq" || obj.type === "truefalse") &&
    typeof obj.correct === "string"
  ) {
    const s = obj.correct.trim();
    if (/^[A-Za-z]$/.test(s)) {
      obj.correct = s.toUpperCase().charCodeAt(0) - 65;
    } else if (/^\d+$/.test(s)) {
      obj.correct = parseInt(s, 10);
    } else if (obj.type === "truefalse") {
      const low = s.toLowerCase();
      if (["true", "t", "yes", "y", "صح", "نعم"].includes(low)) obj.correct = true;
      else if (["false", "f", "no", "n", "خطأ", "لا"].includes(low)) obj.correct = false;
    } else if (obj.type === "mcq" && Array.isArray(obj.options)) {
      // Answer supplied as full option text — resolve to its index.
      const norm = (x: any) => String(x ?? "").trim().toLowerCase();
      const target = norm(s);
      const idx = obj.options.findIndex(
        (o: any) => norm(typeof o === "string" ? o : o?.text ?? o?.label) === target,
      );
      if (idx >= 0) obj.correct = idx;
    }
  }

  if (Array.isArray(obj.options) && obj.options.some((o: any) => o && typeof o === "object")) {
    const derivedCorrect: number[] = [];
    const flat = obj.options.map((o: any, i: number) => {
      if (typeof o === "string") return o;
      if (o && typeof o === "object") {
        const isCorrect =
          o.correct === true ||
          o.is_correct === true ||
          o.isCorrect === true ||
          o.right === true;
        if (isCorrect) derivedCorrect.push(i);
        return String(o.text ?? o.label ?? o.value ?? o.answer ?? o.option ?? "");
      }
      return String(o ?? "");
    });
    obj.options = flat;
    if (obj.correct == null && derivedCorrect.length > 0) {
      obj.correct = obj.type === "multi" ? derivedCorrect : derivedCorrect[0];
    }
  }
  // MCQ: shift 1-indexed `correct` (== options.length) down to 0-indexed.
  if (
    obj.type === "mcq" &&
    Array.isArray(obj.options) &&
    typeof obj.correct === "number" &&
    Number.isFinite(obj.correct) &&
    obj.correct === obj.options.length &&
    obj.correct > 0
  ) {
    obj.correct = obj.correct - 1;
  }
  if (Array.isArray(obj.pairs)) {
    obj.pairs = obj.pairs.map((p: any) => {
      if (Array.isArray(p)) return [String(p[0] ?? ""), String(p[1] ?? "")];
      if (p && typeof p === "object")
        return [
          String(p.left ?? p.a ?? p.term ?? ""),
          String(p.right ?? p.b ?? p.definition ?? ""),
        ];
      return [String(p ?? ""), ""];
    });
  }
  // Ordering card: normalize `steps` / `items` / `sequence` into `steps: string[]`
  // and derive `correct` = the ordered indices [0..n-1] if not provided.
  if (obj.type === "ordering") {
    const raw = obj.steps ?? obj.items ?? obj.sequence ?? obj.options ?? [];
    if (Array.isArray(raw)) {
      obj.steps = raw.map((s: any) => (typeof s === "string" ? s : String(s?.text ?? s?.label ?? s ?? "")));
      if (!Array.isArray(obj.correct)) obj.correct = obj.steps.map((_: any, i: number) => i);
    }
  }
  // Scenario: normalize branching `choices`
  if (obj.type === "scenario" && Array.isArray(obj.choices)) {
    obj.choices = obj.choices.map((c: any) => {
      if (typeof c === "string") return { text: c };
      return {
        text: String(c?.text ?? c?.label ?? ""),
        outcome: c?.outcome ?? c?.result ?? "",
        correct: c?.correct === true || c?.best === true,
      };
    });
  }
  return obj;
}

function tryParseCard(raw: string): LearnCardData | null {
  try {

    const obj = normalizeCard(JSON.parse(raw.trim()));
    if (!obj || typeof obj !== "object") return null;
    if (typeof obj.type === "string" && KNOWN_TYPES.has(obj.type)) {
      return obj as LearnCardData;
    }
    if (
      Array.isArray(obj.options) &&
      obj.options.length > 0 &&
      obj.options.every((o: any) => typeof o === "string")
    ) {
      return { type: "checkin", question: obj.question, options: obj.options } as LearnCardData;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseLearnSegments(content: string): LearnSegment[] {
  if (!content) return [];
  const segments: LearnSegment[] = [];

  // Match ```learn ... ```, ```learn_card ... ```, or ```json ... ``` (any fenced block)
  const fenceRe = /```(learn|learn_card|json)?\s*\n?([\s\S]*?)```/g;
  // Also detect bare top-level JSON-like blocks that contain "options" or "type"
  // We do fences first, then look for bare blocks in remaining text.

  let last = 0;
  let m: RegExpExecArray | null;
  const fenceRanges: Array<[number, number]> = [];
  while ((m = fenceRe.exec(content)) !== null) {
    if (m.index > last) {
      const t = content.slice(last, m.index);
      // Defer pushing — we'll re-scan text for bare JSON below
      pushTextWithBareCards(segments, t);
    }
    const tag = m[1];
    const body = m[2];
    const card = tryParseCard(body);
    if (card && (tag === "learn" || tag === "learn_card" || tag === "json")) {
      segments.push({ kind: "card", card });
    } else if (card && !tag) {
      // Untagged fence — only treat as card if parses cleanly to known type
      segments.push({ kind: "card", card });
    } else {
      segments.push({ kind: "text", text: m[0] });
    }
    fenceRanges.push([m.index, m.index + m[0].length]);
    last = m.index + m[0].length;
  }
  if (last < content.length) {
    pushTextWithBareCards(segments, content.slice(last));
  }
  if (segments.length === 0 && content.trim()) {
    segments.push({ kind: "text", text: content });
  }
  return segments;
}

// Find bare top-level JSON objects in a text chunk that look like learn cards
function pushTextWithBareCards(segments: LearnSegment[], text: string) {
  if (!text || !text.trim()) {
    if (text) segments.push({ kind: "text", text });
    return;
  }
  // Match balanced top-level { ... } blocks (single-line OR multi-line). We use
  // a simple scanner since regex can't balance braces.
  const out: Array<{ kind: "text" | "card"; value: any }> = [];
  let i = 0;
  let buf = "";
  while (i < text.length) {
    if (text[i] === "{") {
      // Try to find matching }
      let depth = 0;
      let j = i;
      let inStr = false;
      let esc = false;
      for (; j < text.length; j++) {
        const ch = text[j];
        if (inStr) {
          if (esc) {
            esc = false;
            continue;
          }
          if (ch === "\\") {
            esc = true;
            continue;
          }
          if (ch === '"') inStr = false;
          continue;
        }
        if (ch === '"') {
          inStr = true;
          continue;
        }
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) {
            j++;
            break;
          }
        }
      }
      if (depth === 0 && j > i) {
        const candidate = text.slice(i, j);
        const card = tryParseCard(candidate);
        if (card) {
          if (buf) {
            out.push({ kind: "text", value: buf });
            buf = "";
          }
          out.push({ kind: "card", value: card });
          i = j;
          continue;
        }
      }
    }
    buf += text[i];
    i++;
  }
  if (buf) out.push({ kind: "text", value: buf });
  for (const seg of out) {
    if (seg.kind === "card") segments.push({ kind: "card", card: seg.value });
    else if (seg.value && String(seg.value).trim())
      segments.push({ kind: "text", text: seg.value });
  }
}

export function hasLearnCards(content: string): boolean {
  if (/```(learn|learn_card)\s/.test(content)) return true;
  // Quick heuristic: contains a JSON-like { ... "options": [ ... ] }
  if (/\{[\s\S]*?"options"\s*:\s*\[[\s\S]*?\][\s\S]*?\}/.test(content)) return true;
  // ```json fenced with type matching known
  const m = content.match(/```json\s*\n?([\s\S]*?)```/);
  if (m) {
    try {
      const o = JSON.parse(m[1].trim());
      if (o && typeof o === "object" && KNOWN_TYPES.has(o.type)) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}
