/**
 * Detects "edit slide N …" style follow-ups so a user can tweak a single slide
 * of an already-generated deck from the chat composer, without rebuilding the
 * whole presentation from scratch.
 */
export interface SlideEditIntent {
  slideNumber: number;
  instruction: string;
}

const AR_DIGITS: Record<string, string> = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
};

const AR_ORDINALS: Record<string, number> = {
  الاولى: 1,
  الأولى: 1,
  الاول: 1,
  الأول: 1,
  الثانية: 2,
  الثاني: 2,
  الثالثة: 3,
  الثالث: 3,
  الرابعة: 4,
  الرابع: 4,
  الخامسة: 5,
  الخامس: 5,
  السادسة: 6,
  السادس: 6,
  السابعة: 7,
  السابع: 7,
  الثامنة: 8,
  الثامن: 8,
  التاسعة: 9,
  التاسع: 9,
  العاشرة: 10,
  العاشر: 10,
};

const normalizeDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => AR_DIGITS[d] ?? d);

const EDIT_VERB =
  /(عدّل|عدل|غيّر|غير|صحح|صحّح|احذف|امسح|اضف|أضف|حسّن|حسن|اعد كتابة|أعد كتابة|edit|change|update|rewrite|fix|replace|improve|remove|add)/i;

const SLIDE_WORD = /(سلايد|شريحة|شريحه|slide)/i;

export function parseSlideEditIntent(raw: string): SlideEditIntent | null {
  const text = normalizeDigits((raw || "").trim());
  if (!text) return null;
  if (!EDIT_VERB.test(text) || !SLIDE_WORD.test(text)) return null;

  let slideNumber: number | null = null;
  const numeric = text.match(/(?:سلايد|شريحة|شريحه|slide)\s*(?:رقم\s*)?#?\s*(\d{1,2})/i);
  if (numeric) slideNumber = parseInt(numeric[1], 10);

  if (slideNumber === null) {
    const ord = text.match(/(?:السلايد|الشريحة|الشريحه)\s+(\S+)/);
    const word = ord?.[1]?.replace(/[^\u0600-\u06FF]/g, "");
    if (word && AR_ORDINALS[word]) slideNumber = AR_ORDINALS[word];
  }

  if (slideNumber === null) {
    const en = text.match(/slide\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)/i);
    const map = [
      "first",
      "second",
      "third",
      "fourth",
      "fifth",
      "sixth",
      "seventh",
      "eighth",
      "ninth",
      "tenth",
    ];
    if (en) slideNumber = map.indexOf(en[1].toLowerCase()) + 1;
  }

  if (!slideNumber || slideNumber < 1 || slideNumber > 60) return null;
  return { slideNumber, instruction: raw.trim() };
}
