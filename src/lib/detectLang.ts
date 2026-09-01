// Detect the dominant language family of a text block for layout/typography.
// Returns "ar" for Arabic-script dominant text, "en" for Latin-script dominant
// text, and "other" for everything else (CJK, Cyrillic, Indic, etc.).
//
// We only care about *layout direction* + *font family*, so a 3-way classifier
// is enough — finer language detection (es/fr/de) would all share the Latin LTR
// treatment anyway.

export type MessageLang = "ar" | "en" | "other";

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
const LATIN_RE = /[A-Za-zÀ-ÖØ-öø-ÿ]/g;
// CJK + Cyrillic + Hebrew + Devanagari etc. — anything that isn't Arabic or Latin
const OTHER_SCRIPT_RE =
  /[\u0400-\u04FF\u0590-\u05FF\u0900-\u097F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/g;

export function detectLang(text: string): MessageLang {
  if (!text) return "en";
  const ar = (text.match(ARABIC_RE) || []).length;
  const en = (text.match(LATIN_RE) || []).length;
  const other = (text.match(OTHER_SCRIPT_RE) || []).length;
  const max = Math.max(ar, en, other);
  if (max === 0) return "en"; // pure punctuation/numbers → ltr default
  if (ar === max) return "ar";
  if (other === max) return "other";
  return "en";
}

export function langDir(lang: MessageLang): "rtl" | "ltr" {
  return lang === "ar" ? "rtl" : "ltr";
}
