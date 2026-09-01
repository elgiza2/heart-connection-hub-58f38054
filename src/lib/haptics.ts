// Tiny haptics + spring presets for an iOS-feel layer.
// Vibrate API is supported on Android/some browsers; on iOS Safari it
// silently no-ops, which is fine — we'll never error.

type Tone = "tap" | "soft" | "success" | "warning" | "error";

const PATTERNS: Record<Tone, number | number[]> = {
  tap: 8,
  soft: 4,
  success: [10, 30, 10],
  warning: [12, 40, 12, 40, 12],
  error: [25, 40, 25, 40, 25],
};

let muted = false;

export function setHapticsMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem("megsy.haptics.muted", value ? "1" : "0");
  } catch {
    /* noop */
  }
}

try {
  if (typeof localStorage !== "undefined") {
    muted = localStorage.getItem("megsy.haptics.muted") === "1";
  }
} catch {
  /* noop */
}

export function haptic(tone: Tone = "tap") {
  if (muted) return;
  if (typeof navigator === "undefined") return;
  const v = (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate;
  if (typeof v !== "function") return;
  try {
    v.call(navigator, PATTERNS[tone]);
  } catch {
    /* noop */
  }
}

/** iOS-feel spring presets for framer-motion `transition`. */
export const iosSpring = {
  /** Default tap/press response. */
  tap: { type: "spring" as const, stiffness: 480, damping: 30, mass: 0.7 },
  /** Sheet / modal entry. */
  sheet: { type: "spring" as const, stiffness: 320, damping: 32, mass: 0.9 },
  /** Page slide. */
  page: { type: "spring" as const, stiffness: 260, damping: 30, mass: 1 },
  /** Subtle hover / hint. */
  hint: { type: "spring" as const, stiffness: 220, damping: 24, mass: 0.6 },
};
