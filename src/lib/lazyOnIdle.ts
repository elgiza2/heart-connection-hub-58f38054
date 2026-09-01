/**
 * @doc lazyOnIdle — schedule non-critical work (analytics, prefetch, warmups)
 * during the browser's idle time so it never competes with LCP or user input.
 */
export function runOnIdle(cb: () => void, timeout = 2000): void {
  if (typeof window === "undefined") return;
  const ric = (window as any).requestIdleCallback as
    | ((cb: IdleRequestCallback, opts?: { timeout?: number }) => number)
    | undefined;
  if (ric) {
    ric(() => cb(), { timeout });
  } else {
    setTimeout(cb, 200);
  }
}

export function importOnIdle<T>(factory: () => Promise<T>): Promise<T> {
  return new Promise((resolve) => {
    runOnIdle(() => {
      factory().then(resolve).catch(() => resolve(undefined as unknown as T));
    });
  });
}
