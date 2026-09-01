import { lazy, ComponentType } from "react";

// Wraps React.lazy with automatic recovery from stale chunk errors after a new
// deploy. On a dynamic-import failure we first retry the import a couple of
// times (transient network blip, slow chunk). Only if those retries also fail
// do we force a one-time hard reload so the user gets the new asset manifest
// — and even then we never reload more than once per 5 minutes to avoid
// reload loops on slow networks.
const RELOAD_KEY = "megsy:chunk-reloaded-at";
const RELOAD_COOLDOWN_MS = 5 * 60_000;

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): ReturnType<typeof lazy<T>> {
  return lazy(async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await factory();
      } catch (err) {
        lastErr = err;
        const msg = String((err as any)?.message || err || "");
        const isChunkError =
          /Loading chunk|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed|dynamically imported module/i.test(
            msg,
          );
        if (!isChunkError) throw err;
        if (attempt < 2) {
          await sleep(300 * (attempt + 1));
          continue;
        }
      }
    }

    // All retries failed — reload once (rate-limited) to pick up new manifest.
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || "0");
      if (Date.now() - last < RELOAD_COOLDOWN_MS) throw lastErr;
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
      throw lastErr;
    }

    window.location.reload();
    return new Promise<never>(() => {});
  });
}
