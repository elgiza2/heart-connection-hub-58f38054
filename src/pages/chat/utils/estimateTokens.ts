/**
 * Rough client-side token estimation.
 * Uses ~4 chars/token for English/code, ~2 for CJK/Arabic. Good enough for
 * a UI indicator when the backend doesn't return usage stats.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Detect if text has significant non-latin content (Arabic, CJK).
  const nonLatin = text.match(/[\u0600-\u06FF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/g)?.length ?? 0;
  const ratio = nonLatin / text.length;
  const charsPerToken = ratio > 0.3 ? 2 : 4;
  return Math.max(1, Math.round(text.length / charsPerToken));
}

export function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
