/**
 * @doc Router for "does this turn need a real computer?".
 * Regex/heuristic only — it runs before every send, so it must never block on
 * a network call.
 */
import { isAffirmation, shouldUseComputer } from "./shouldUseComputer";

export interface ComputerIntent {
  /** Run this turn on the computer agent. */
  use: boolean;
  /** Normalized task text to hand to the agent. */
  task: string;
  /** Where the verdict came from (debugging / telemetry). */
  source: "explicit" | "heuristic" | "model" | "continuation" | "none";
}

/**
 * Decides how a chat turn should be routed.
 * `pendingIntent` is the last computer-flavoured request in this conversation,
 * so short confirmations ("تمام يلا", "ok") continue the same task.
 */
export async function routeComputerIntent(
  text: string,
  pendingIntent?: string | null,
): Promise<ComputerIntent> {
  const raw = (text || "").trim();
  if (!raw) return { use: false, task: "", source: "none" };

  if (/(^|\s)@computer\b/i.test(raw)) {
    return { use: true, task: raw, source: "explicit" };
  }

  if (pendingIntent && isAffirmation(raw)) {
    return { use: true, task: `${pendingIntent}\n\n${raw}`, source: "continuation" };
  }

  if (shouldUseComputer(raw)) {
    return { use: true, task: raw, source: "heuristic" };
  }

  // Deliberately no model round-trip here: this runs before every send, and
  // waiting on an extra LLM call made the first Send feel frozen. The regex
  // heuristic above is the router; anything it doesn't recognise stays a
  // normal chat turn, and the user can still say "@computer" explicitly.
  return { use: false, task: raw, source: "none" };

}
