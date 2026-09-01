import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

// Cache the current user so we don't hammer auth/v1/user on every action.
// supabase-js auth state changes invalidate the cache automatically.
let _user: User | null = null;
let _ts = 0;
const TTL_MS = 30_000;

supabase.auth.onAuthStateChange((_evt, session) => {
  _user = session?.user ?? null;
  _ts = Date.now();
});

export async function getCachedUser(): Promise<User | null> {
  const now = Date.now();
  if (_user && now - _ts < TTL_MS) return _user;
  // Prefer getSession (no network) before falling back to getUser.
  const { data: sess } = await supabase.auth.getSession();
  if (sess.session?.user) {
    _user = sess.session.user;
    _ts = now;
    return _user;
  }
  const { data } = await supabase.auth.getUser();
  _user = data.user ?? null;
  _ts = now;
  return _user;
}

export function clearCachedUser() {
  _user = null;
  _ts = 0;
}
