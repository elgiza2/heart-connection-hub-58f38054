/** @doc Globally wraps supabase.auth.getUser/getSession with a retry to swallow transient "Failed to fetch" blips. */
import { supabase } from "./client";

const TRANSIENT_RE = /failed to fetch|networkerror|load failed|fetch failed|network request failed/i;

function withRetry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 250): Promise<T> {
  return (async () => {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        if (!TRANSIENT_RE.test(msg)) throw err;
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
      }
    }
    throw lastErr;
  })();
}

let patched = false;
export function patchSupabaseAuth() {
  if (patched) return;
  patched = true;
  const auth = supabase.auth as unknown as {
    getUser: (...a: unknown[]) => Promise<unknown>;
    getSession: (...a: unknown[]) => Promise<unknown>;
  };
  const origGetUser = auth.getUser.bind(auth);
  const origGetSession = auth.getSession.bind(auth);

  auth.getUser = ((...args: unknown[]) =>
    withRetry(() => origGetUser(...args)).catch(() => ({
      data: { user: null },
      error: null,
    }))) as typeof auth.getUser;

  auth.getSession = ((...args: unknown[]) =>
    withRetry(() => origGetSession(...args)).catch(() => ({
      data: { session: null },
      error: null,
    }))) as typeof auth.getSession;
}
