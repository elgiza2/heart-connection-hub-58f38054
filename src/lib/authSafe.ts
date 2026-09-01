/** @doc Resilient wrappers around supabase.auth that retry transient "Failed to fetch" blips. */
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

const TRANSIENT_RE = /failed to fetch|networkerror|load failed|fetch failed/i;

async function withRetry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 250): Promise<T> {
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
}

/**
 * Returns the current authenticated user, swallowing transient network errors.
 * Returns null on persistent failure instead of throwing.
 */
export async function getUserSafe(): Promise<User | null> {
  try {
    const { data: sessionData } = await withRetry(() => supabase.auth.getSession());
    if (sessionData.session?.user) return sessionData.session.user;

    const { data, error } = await withRetry(() => supabase.auth.getUser());
    if (error) return null;
    return data.user ?? null;
  } catch {
    return null;
  }
}

export async function getSessionSafe(): Promise<Session | null> {
  try {
    const { data } = await withRetry(() => supabase.auth.getSession());
    return data.session ?? null;
  } catch {
    return null;
  }
}
