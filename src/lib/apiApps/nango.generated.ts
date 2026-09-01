/** GENERATED data lives in `nango.generated.json` — do not edit by hand.
 *
 *  586 real SaaS APIs from Nango's provider registry. The payload is ~460 KB, so
 *  it is loaded on demand instead of being bundled into any route chunk.
 */
import type { ApiApp } from "./types";

let cache: ApiApp[] | null = null;
let inflight: Promise<ApiApp[]> | null = null;

/** Lazily load the Nango registry (cached after the first call). */
export async function loadNangoApps(): Promise<ApiApp[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = import("./nango.generated.json")
      .then((m) => {
        cache = (m.default ?? m) as unknown as ApiApp[];
        return cache;
      })
      .catch(() => {
        inflight = null;
        return [];
      });
  }
  return inflight;
}

/** Registry entries already loaded, if any. Empty until `loadNangoApps` resolves. */
export const loadedNangoApps = (): ApiApp[] => cache ?? [];
