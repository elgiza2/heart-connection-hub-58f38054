/** @doc Client-side pricing offer state.
 *
 *  Two offers, both driven by what the user already did:
 *
 *  1. Abandoned checkout → win-back price.
 *     When the user opens checkout and comes back to /pricing without paying,
 *     the intro price drops from $7 to $5 (monthly) for a limited window.
 *
 *  2. Second month at the intro price (handled by SecondMonthOfferCard) is only
 *     shown AFTER a successful first payment — never before.
 *
 *  Amounts are display-only; the charged amount always comes from the server
 *  catalog (Dodo / Kashier product ids).
 */

const KEY = "megsy_checkout_abandoned_v1";

/** Intro (first month) price shown by default. */
export const INTRO_PRICE = 7;
/** Win-back price after an abandoned checkout. */
export const WINBACK_PRICE = 5;
/** Win-back yearly price (one month equivalent off the intro). */
export const WINBACK_YEARLY_PRICE = 149;
/** How long the win-back price stays valid. */
export const WINBACK_WINDOW_HOURS = 72;

interface AbandonState {
  /** ms epoch when checkout was opened. */
  at: number;
  interval: "monthly" | "yearly";
}

function read(): AbandonState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AbandonState;
    if (!parsed?.at) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Call right before redirecting the user to the payment provider. */
export function markCheckoutOpened(interval: "monthly" | "yearly") {
  try {
    localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), interval } satisfies AbandonState));
  } catch {
    /* storage unavailable */
  }
}

/** Call after a confirmed successful payment. */
export function clearAbandonedCheckout() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

/**
 * True when the user opened checkout, came back, and the win-back window is
 * still open. Expired records are cleaned up on read.
 */
export function hasAbandonedCheckout(): boolean {
  const state = read();
  if (!state) return false;
  const ageHours = (Date.now() - state.at) / 3_600_000;
  if (ageHours > WINBACK_WINDOW_HOURS) {
    clearAbandonedCheckout();
    return false;
  }
  // Ignore the first few seconds so the redirect itself never counts.
  return Date.now() - state.at > 10_000;
}
