/**
 * Usage limits for the Computer Agent.
 *
 * The agent runs a real cloud computer (browser + terminal + files) per task,
 * which is far more expensive than a chat turn — so every plan gets a daily
 * task budget. The counter is per-browser/day and is a soft guard on top of
 * the server-side key rotation and credit accounting.
 */

export const COMPUTER_DAILY_LIMITS: Record<string, number> = {
  free: 2,
  starter: 10,
  pro: 30,
  max: 60,
  ultra: 100,
};

const STORAGE_KEY = "megsy:computer-usage";

const today = () => new Date().toISOString().slice(0, 10);

export function computerDailyLimit(plan?: string | null): number {
  const p = (plan || "free").toLowerCase();
  return COMPUTER_DAILY_LIMITS[p] ?? COMPUTER_DAILY_LIMITS.free;
}

export function computerUsedToday(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return raw?.date === today() ? Number(raw.count) || 0 : 0;
  } catch {
    return 0;
  }
}

export function computerRemaining(plan?: string | null): number {
  return Math.max(0, computerDailyLimit(plan) - computerUsedToday());
}

export function canRunComputerTask(plan?: string | null): boolean {
  return computerRemaining(plan) > 0;
}

export function recordComputerTask(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ date: today(), count: computerUsedToday() + 1 }),
    );
  } catch {
    /* ignore */
  }
}
