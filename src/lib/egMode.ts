/**
 * @doc Egypt edition (/eg)
 *
 * The Egyptian version of the site lives under `megsyai.com/eg`. Entering
 * that path switches the whole UI to the Egyptian Arabic dialect (`ar-eg`)
 * and locks payments to Kashier (Visa card + Vodafone Cash). The main site
 * keeps Dodo Payments only and never shows Kashier.
 */
import { setUserLang } from "@/lib/authI18n";

const KEY = "eg_site";

/** True when the visitor is browsing the Egypt edition. */
export function isEgMode(): boolean {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname;
  if (path === "/eg" || path.startsWith("/eg/")) return true;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Turn the Egypt edition on (sticky) and force the Egyptian dialect. */
export function enableEgMode(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // ignore
  }
  void setUserLang("ar-eg");
}

/** Leave the Egypt edition. */
export function disableEgMode(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
