import { supabase } from "@/integrations/supabase/client";

/**
 * Single-flight cache for the signed-in user's own `profiles` row.
 *
 * Boot used to fire ~15 separate `profiles` requests because every hook
 * (credits, plan, sidebar, active account, chat hydration…) selected its own
 * two or three columns of the very same row. They now share one request for a
 * superset of those columns, deduped while in flight and cached briefly.
 */
export interface OwnProfileRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  credits: number | null;
  plan: string | null;
  chat_greeted: boolean | null;
}

const COLUMNS = "id, display_name, avatar_url, credits, plan, chat_greeted";
const TTL_MS = 15_000;

let cachedUserId: string | null = null;
let cached: OwnProfileRow | null = null;
let cachedAt = 0;
let inflight: Promise<OwnProfileRow | null> | null = null;

export function invalidateOwnProfile() {
  cached = null;
  cachedUserId = null;
  cachedAt = 0;
  inflight = null;
}

supabase.auth.onAuthStateChange(() => {
  invalidateOwnProfile();
});

export async function getOwnProfile(
  userId: string,
  opts?: { force?: boolean },
): Promise<OwnProfileRow | null> {
  const fresh = cachedUserId === userId && Date.now() - cachedAt < TTL_MS;
  if (!opts?.force && fresh) return cached;
  if (!opts?.force && inflight && cachedUserId === userId) return inflight;

  cachedUserId = userId;
  inflight = (async () => {
    const { data } = await supabase
      .from("profiles")
      .select(COLUMNS)
      .eq("id", userId)
      .maybeSingle();
    cached = (data as OwnProfileRow | null) ?? null;
    cachedAt = Date.now();
    inflight = null;
    return cached;
  })();
  return inflight;
}
