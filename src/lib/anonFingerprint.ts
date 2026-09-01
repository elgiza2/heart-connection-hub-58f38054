/**
 * Stable per-browser fingerprint for unauthenticated chat usage tracking.
 *
 * Combines a few low-entropy browser signals with a persistent random ID
 * stored in localStorage. The server hashes (IP + this fingerprint) with a
 * server-side salt and checks it against the anonymous_chat_usage table to
 * allow exactly ONE free chat per visitor before requiring sign-up.
 *
 * This is NOT a security boundary — a determined attacker can clear storage
 * and/or rotate IP. It's just enough friction to prevent casual API-key abuse.
 */

const STORAGE_KEY = "megsy.anonId.v1";

function readPersistentId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing && existing.length >= 16) return existing;
  } catch {
    /* localStorage unavailable */
  }
  const fresh =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  try {
    localStorage.setItem(STORAGE_KEY, fresh);
  } catch {
    /* ignore */
  }
  return fresh;
}

function browserSignal(): string {
  try {
    const nav = typeof navigator !== "undefined" ? navigator : ({} as Navigator);
    const scr = typeof screen !== "undefined" ? screen : ({} as Screen);
    const parts = [
      nav.userAgent || "",
      nav.language || "",
      String(scr.width || 0),
      String(scr.height || 0),
      String(scr.colorDepth || 0),
      String(new Date().getTimezoneOffset()),
    ];
    return parts.join("|");
  } catch {
    return "";
  }
}

let _cached: string | null = null;
export function getAnonFingerprint(): string {
  if (_cached) return _cached;
  const id = readPersistentId();
  const sig = browserSignal();
  // Keep it readable + bounded (server validates length 16..200).
  _cached = `${id}::${sig}`.slice(0, 180);
  return _cached;
}
