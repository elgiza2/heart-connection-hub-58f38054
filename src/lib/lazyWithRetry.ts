import { lazy, ComponentType } from "react";

// Wraps React.lazy with automatic recovery from stale chunk errors after a new
// deploy. On a dynamic-import failure we retry the import a few times
// (transient network blip, slow chunk, new asset manifest). We NEVER reload the
// page automatically — the app must never refresh itself under the user; the
// error boundary shows a manual retry instead.
function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): ReturnType<typeof lazy<T>> {
  return lazy(async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
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
        if (attempt < 4) {
          await sleep(300 * (attempt + 1));
          continue;
        }
      }
    }
    throw lastErr;
  });
}
