import { useEffect } from "react";

const FLAG = "megsy:embed_backfill_v1";

/**
 * One-time semantic backfill: embeds existing skills / system_skills /
 * messages so semantic recall works for legacy data. Guarded by a
 * localStorage flag so it only ever runs once per browser per user.
 */
export function useEmbedBackfill() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Disabled by default: bulk embedding backfills can saturate provider quota
    // and make chat feel frozen. Mark as completed so it never auto-runs here.
    localStorage.setItem(FLAG, String(Date.now()));
  }, []);
}
