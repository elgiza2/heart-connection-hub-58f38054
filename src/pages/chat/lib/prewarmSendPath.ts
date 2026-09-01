import { runOnIdle } from "@/lib/lazyOnIdle";

/**
 * @doc The send path lazily imports a handful of small modules (intent
 * detection, plan gating, telemetry) *before* the optimistic user bubble can
 * be rendered. On the very first send those imports are cold, so the tap felt
 * dead for several hundred ms — seconds on a slow link.
 *
 * We therefore warm them during idle time right after the chat surface mounts,
 * and again on the first composer focus. By the time the user presses send the
 * modules are already in the module cache, so `await import(...)` resolves
 * synchronously in a microtask.
 */
let warmed = false;
let warmPromise: Promise<unknown> | null = null;

const loadSendPath = () => {
  if (warmPromise) return warmPromise;
  warmPromise = Promise.all([
    import("../services/runChatStreamTurn"),
    import("@/lib/computer/classifyIntent"),
    import("@/lib/chat/fastChat"),
    import("@/lib/achievements"),
    import("@/lib/streaks"),
    import("@/lib/chat/turnContext").then((m) => {
      // Also fill the per-turn settings cache: on a cold send those eight
      // queries sit in front of the very first token.
      m.prewarmTurnContext();
    }),
  ]).catch(() => undefined);
  return warmPromise;
};

export function prewarmSendPath(immediate = false): void {
  if (typeof window === "undefined") return;
  if (immediate) {
    void loadSendPath();
    return;
  }
  if (warmed) return;
  warmed = true;
  runOnIdle(() => {
    void loadSendPath();
  }, 1500);
}
