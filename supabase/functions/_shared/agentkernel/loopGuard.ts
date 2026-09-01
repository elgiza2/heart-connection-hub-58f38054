/**
 * Loop detection.
 *
 * A human who clicks the same button twice with no result changes approach.
 * The agent gets the same discipline: identical step fingerprints escalate
 * 1 strike -> nudge, 2 -> force a different method, 3 -> change strategy,
 * 4 -> stop and ask the user.
 */

export type LoopVerdict = "ok" | "nudge" | "change_method" | "change_strategy" | "ask_user";

/** Stable fingerprint of "what the agent just did, and where". */
export function fingerprint(parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .map((part) =>
      String(part)
        .toLowerCase()
        .replace(/\d{2,}/g, "#")
        .replace(/[^a-z0-9#./ ]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160),
    )
    .join(" | ");
}

export function verdictFor(strikes: number): LoopVerdict {
  if (strikes >= 4) return "ask_user";
  if (strikes === 3) return "change_strategy";
  if (strikes === 2) return "change_method";
  if (strikes === 1) return "nudge";
  return "ok";
}

/** Instruction injected into the provider task when a loop is detected. */
export function loopInstruction(verdict: LoopVerdict, lastAction: string): string {
  switch (verdict) {
    case "nudge":
      return `You just repeated the same action ("${lastAction}") with no visible progress. Re-read the page before acting again.`;
    case "change_method":
      return `"${lastAction}" has failed twice. Do NOT repeat it. Use a different method: another selector, keyboard input, direct URL, or a different entry point on the site.`;
    case "change_strategy":
      return `Three attempts at "${lastAction}" failed. Abandon this path completely and reach the goal a different way (different page, search, or alternative site).`;
    case "ask_user":
      return `Four attempts at "${lastAction}" failed. Stop and report exactly what is blocking you.`;
    default:
      return "";
  }
}
