/**
 * Detects in-place text edits on an already generated document, e.g.
 *   «غيّر "شركة ألفا" إلى "شركة بيتا"»  /  `replace "Alpha" with "Beta"`
 *   «عدّل النص: ... »  /  `edit section 3 ...`
 * so a user can tweak specific wording without regenerating the whole file.
 */

export interface DocsTextReplace {
  kind: "replace";
  from: string;
  to: string;
}

export interface DocsSnippetEdit {
  kind: "snippet";
  snippet: string;
  instruction: string;
}

export interface DocsSectionEdit {
  kind: "section";
  sectionNumber: number;
  instruction: string;
}

export type DocsEditIntent = DocsTextReplace | DocsSnippetEdit | DocsSectionEdit;

const AR_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};
const normalizeDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => AR_DIGITS[d] ?? d);

const AR_ORDINALS: Record<string, number> = {
  الاول: 1, الأول: 1, الاولى: 1, الأولى: 1,
  الثاني: 2, الثانية: 2, التاني: 2, التانية: 2,
  الثالث: 3, الثالثة: 3, التالت: 3, التالتة: 3,
  الرابع: 4, الرابعة: 4, الخامس: 5, الخامسة: 5,
  السادس: 6, السادسة: 6, السابع: 7, السابعة: 7,
  الثامن: 8, الثامنة: 8, التاسع: 9, التاسعة: 9,
  العاشر: 10, العاشرة: 10,
};

const EDIT_VERB =
  /(عدّل|عدل|غيّر|غير|استبدل|بدّل|بدل|صحح|صحّح|احذف|امسح|اكتب|اضف|أضف|حسّن|حسن|edit|change|update|rewrite|fix|replace|swap|improve)/i;

const QUOTED = /["“”«»'‘’]([^"“”«»'‘’]{1,300})["“”«»'‘’]/g;

function quoted(text: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  QUOTED.lastIndex = 0;
  while ((m = QUOTED.exec(text))) out.push(m[1].trim());
  return out.filter(Boolean);
}

export function parseDocsEditIntent(raw: string): DocsEditIntent | null {
  const text = normalizeDigits((raw || "").trim());
  if (!text || !EDIT_VERB.test(text)) return null;

  // 1) Explicit replacement of two quoted strings.
  const q = quoted(text);
  if (q.length >= 2 && /(إلى|الى|ب|to|with|into)/i.test(text)) {
    return { kind: "replace", from: q[0], to: q[1] };
  }

  // 2) Unquoted "replace X with Y" / "غيّر X إلى Y".
  const pair =
    text.match(/(?:replace|change|swap)\s+(.{2,200}?)\s+(?:with|to|into)\s+(.{1,200})$/i) ||
    text.match(/(?:غيّر|غير|استبدل|بدّل|بدل)\s+(.{2,200}?)\s+(?:إلى|الى|ب)\s+(.{1,200})$/);
  if (pair) {
    const from = pair[1].replace(/^["“”«»'‘’]|["“”«»'‘’]$/g, "").trim();
    const to = pair[2].replace(/^["“”«»'‘’]|["“”«»'‘’]$/g, "").trim();
    if (from && to && from !== to) return { kind: "replace", from, to };
  }

  // 3) Section-level edit: "عدّل القسم 3 ..." / "edit section 2 ..."
  const secWord = /(القسم|الجزء|الفقره|الفقرة|section|paragraph)/i;
  if (secWord.test(text)) {
    const num =
      Number(text.match(/(?:section|paragraph|القسم|الجزء|الفقرة|الفقره)\s*(\d{1,2})/i)?.[1]) ||
      (() => {
        for (const [w, n] of Object.entries(AR_ORDINALS)) if (text.includes(w)) return n;
        return 0;
      })();
    if (num > 0) {
      const instruction = text.replace(/^\s*\S+\s*/, "").trim() || text;
      return { kind: "section", sectionNumber: num, instruction };
    }
  }

  // 4) One quoted snippet + a free instruction → rewrite that snippet only.
  if (q.length === 1) {
    return { kind: "snippet", snippet: q[0], instruction: text };
  }

  return null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Replaces visible text inside an HTML document without touching tags,
 * attributes, scripts or styles. Returns the new HTML and how many hits were
 * replaced — 0 means the text was not found and nothing changed.
 */
export function replaceTextInHtml(
  html: string,
  from: string,
  to: string,
): { html: string; count: number } {
  if (!html || !from) return { html, count: 0 };
  let count = 0;
  const re = new RegExp(escapeRe(from), "g");
  const out = html.replace(/>([^<]+)</g, (match, textNode: string) => {
    if (!re.test(textNode)) return match;
    re.lastIndex = 0;
    const replaced = textNode.replace(re, () => {
      count += 1;
      return to;
    });
    return `>${replaced}<`;
  });
  return { html: count ? out : html, count };
}
