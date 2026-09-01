/** @doc Fire-and-forget warmup pings to hot edge functions. Called on Chat page
 *  mount to cut cold-start latency on the user's first message. Uses OPTIONS
 *  (CORS preflight) which is ~0 cost server-side but wakes the isolate. */
const SUPABASE_URL = "https://ltgampdtawuefwwayncx.supabase.co";

const DEFAULT_TARGETS = ["chat-fast", "chat-alibaba", "anything-api"];

let lastWarmAt = 0;

export function warmEdgeFunctions(targets: string[] = DEFAULT_TARGETS) {
  const now = Date.now();
  // Debounce: don't re-warm more than once per 60s per tab.
  if (now - lastWarmAt < 60_000) return;
  lastWarmAt = now;
  for (const name of targets) {
    try {
      // Plain OPTIONS preflight — no custom headers so any CORS config accepts it.
      fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
        method: "OPTIONS",
        keepalive: true,
        mode: "cors",
      }).catch(() => {});
    } catch {
      /* noop */
    }
  }
}
