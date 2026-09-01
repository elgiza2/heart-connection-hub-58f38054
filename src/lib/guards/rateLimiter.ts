import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Client-side throttles/debouncers to absorb accidental double-clicks,
 * rapid-fire taps, and impatient retries. Not a security boundary — the
 * server is still authoritative — just keeps users from triggering the
 * same expensive action 50 times in a row.
 */

/** Returns a callback that ignores invocations within `ms` of the last call. */
export function useDebouncedCallback<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void | Promise<void>,
  ms: number,
) {
  const lastRef = useRef(0);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);
  return useCallback(
    (...args: TArgs) => {
      const now = Date.now();
      if (now - lastRef.current < ms) return;
      lastRef.current = now;
      void fnRef.current(...args);
    },
    [ms],
  );
}

/**
 * Sliding-window rate limiter. Returns `{ allow, remaining, resetMs }` —
 * call `allow()` before performing the action; if false, show feedback.
 */
export function useRateLimit(max: number, windowMs: number) {
  const hits = useRef<number[]>([]);
  return useCallback(() => {
    const now = Date.now();
    hits.current = hits.current.filter((t) => now - t < windowMs);
    if (hits.current.length >= max) {
      const resetMs = windowMs - (now - hits.current[0]);
      return { allow: false as const, remaining: 0, resetMs };
    }
    hits.current.push(now);
    return { allow: true as const, remaining: max - hits.current.length, resetMs: 0 };
  }, [max, windowMs]);
}

/**
 * Countdown cooldown for resend-style buttons.
 * Returns the seconds remaining (0 when ready) and `start(seconds)`.
 */
export function useCooldown(initial = 0) {
  const [remaining, setRemaining] = useState(initial);
  const timerRef = useRef<number | null>(null);

  const tick = useCallback(() => {
    setRemaining((r) => {
      if (r <= 1) {
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        return 0;
      }
      return r - 1;
    });
  }, []);

  const start = useCallback(
    (seconds: number) => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      setRemaining(seconds);
      timerRef.current = window.setInterval(tick, 1000);
    },
    [tick],
  );

  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    },
    [],
  );

  return { remaining, start, ready: remaining === 0 };
}

/**
 * Process-wide in-flight guard so the same action keyed by `key` cannot
 * fire concurrently from different code paths.
 */
const inflight = new Map<string, Promise<unknown>>();

export async function withInflightGuard<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = (async () => {
    try {
      return await fn();
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}
