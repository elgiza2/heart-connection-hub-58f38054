/**
 * Disabled by product decision: the chat must never show the model name,
 * token counts, cost or latency chips. Kept as a no-op so existing imports
 * (if any) keep compiling.
 */
export function MessageInsights(_props: { metadata?: Record<string, any> | null }) {
  return null;
}
