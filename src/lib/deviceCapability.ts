/**
 * Device capability tiers.
 *
 * Weak phones choke on the decorative layer of this UI (backdrop blur,
 * infinite gradient animations, large box-shadow glows). Instead of guessing
 * per component, we classify the device once — before the first paint — and
 * expose the result as `<html data-perf="low|mid|high">`.
 *
 * `src/styles/perf-tier.css` then downgrades the expensive effects for the
 * `low` tier only. Nothing about layout, colour or content changes, so the
 * design stays identical; only the cost of painting it drops.
 *
 * Signals used (all optional, all cheap, no layout reads):
 *  - navigator.hardwareConcurrency — CPU cores
 *  - navigator.deviceMemory        — RAM in GB (Chromium)
 *  - navigator.connection          — saveData / effectiveType
 *  - prefers-reduced-motion        — explicit user request
 */

export type PerfTier = "low" | "mid" | "high";

type NavigatorWithHints = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
};

let cached: PerfTier | null = null;

export function detectPerfTier(): PerfTier {
  if (cached) return cached;
  if (typeof window === "undefined" || typeof navigator === "undefined") return "high";

  const nav = navigator as NavigatorWithHints;
  const cores = nav.hardwareConcurrency ?? 0;
  const memory = nav.deviceMemory ?? 0;
  const conn = nav.connection;
  const slowNetwork = conn?.saveData === true || /(^|-)2g$|slow-2g/i.test(conn?.effectiveType || "");
  const reducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let tier: PerfTier = "mid";
  if (reducedMotion || slowNetwork || (cores > 0 && cores <= 4) || (memory > 0 && memory <= 4)) {
    tier = "low";
  } else if ((cores >= 8 && memory >= 8) || (cores >= 8 && memory === 0)) {
    tier = "high";
  }

  cached = tier;
  return tier;
}

/** Applies the tier to `<html data-perf>`. Safe to call more than once. */
export function applyPerfTier(): PerfTier {
  const tier = detectPerfTier();
  try {
    document.documentElement.dataset.perf = tier;
  } catch {
    /* non-DOM environment — nothing to apply */
  }
  return tier;
}

/** True when the device should skip decorative work (blur, autoplay video). */
export const isLowEndDevice = () => detectPerfTier() === "low";
