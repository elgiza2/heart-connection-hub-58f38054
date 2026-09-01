import { describe, expect, it } from "vitest";
import { shouldUseWebSearch } from "@/lib/shouldUseWebSearch";

/**
 * Cases the heuristic MUST suppress (return false) when toggle=true.
 * These are queries the model already knows or doesn't need fresh data for.
 */
const SHOULD_SUPPRESS: string[] = [
  // Math
  "2+2",
  "احسب 145 ضرب 23",
  "what is 5 plus 7",
  "ما هو 100 / 4",
  // Identity / chit-chat
  "hi",
  "مرحبا",
  "كيف حالك",
  "شكرا",
  "صباح الخير",
  // Formatting on previous content
  "ترجم النص السابق إلى الإنجليزية",
  "لخص هذا",
  "أكمل",
  // Code
  "اكتب دالة جافاسكربت لجمع رقمين",
  "write a function that reverses a string",
  // Creative
  "اكتب لي قصيدة عن الحب",
  "write me a haiku about cats",
  // Conceptual explanations
  "اشرح لي ما هو الذكاء الاصطناعي في 3 نقاط",
  "explain how neural networks work",
  "ما هو HTTP",
  "define recursion",
  "ما الفرق بين let و const",
];

/**
 * Cases the heuristic MUST keep ON (return true) — they need fresh data.
 */
const SHOULD_KEEP_ON: string[] = [
  "ما هي آخر أخبار الذكاء الاصطناعي اليوم؟",
  "what is the latest news about OpenAI today",
  "سعر بيتكوين الآن",
  "current stock price of AAPL",
  "weather in Cairo right now",
  "نتيجة مباراة الأهلي اليوم",
  "أخبار عاجلة عن الانتخابات",
  "https://example.com لخص هذا الرابط",
  "أحداث 2027",
  "ما الجديد في React 19",
];

describe("shouldUseWebSearch", () => {
  it("respects user toggle OFF regardless of query", () => {
    expect(shouldUseWebSearch("ما هي آخر الأخبار اليوم؟", false)).toBe(false);
    expect(shouldUseWebSearch("hi", false)).toBe(false);
  });

  it("returns toggle for empty input", () => {
    expect(shouldUseWebSearch("", true)).toBe(true);
    expect(shouldUseWebSearch("   ", true)).toBe(true);
  });

  it("respects toggle for very long prompts (>600 chars)", () => {
    const long = "أ".repeat(700);
    expect(shouldUseWebSearch(long, true)).toBe(true);
  });

  describe.each(SHOULD_SUPPRESS)('suppresses search for: "%s"', (q) => {
    it("returns false", () => {
      expect(shouldUseWebSearch(q, true)).toBe(false);
    });
  });

  describe.each(SHOULD_KEEP_ON)('keeps search ON for: "%s"', (q) => {
    it("returns true", () => {
      expect(shouldUseWebSearch(q, true)).toBe(true);
    });
  });

  it("NEEDS_SEARCH wins over NO_SEARCH (mixed query)", () => {
    // Conceptual phrasing but explicit fresh-data trigger — must keep search ON.
    expect(shouldUseWebSearch("اشرح لي آخر أخبار الذكاء الاصطناعي اليوم", true)).toBe(true);
  });
});
