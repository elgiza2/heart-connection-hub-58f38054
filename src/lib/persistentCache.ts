/**
 * Unified "load once, then serve from local storage" cache.
 *
 * Policy for the whole app: every library, icon, image, font, JSON dictionary
 * or code chunk is fetched *only when actually used*, and only the first time.
 * After that it is served from a local store with no network round-trip.
 *
 * Three storage tiers are used, picked automatically by payload size:
 *   1. In-memory map      — instant, per-session.
 *   2. localStorage       — small payloads (< SMALL_MAX bytes), survives reload.
 *   3. Cache Storage API  — large payloads (dictionaries, blobs) that would
 *                           blow the ~5 MB localStorage quota.
 *
 * Code chunks, images and fonts are handled by the service worker
 * (see `runtimeCaching` in vite.config.ts) — this module covers everything the
 * app fetches imperatively at runtime.
 */

const VERSION = "v1";
const PREFIX = `megsy:cache:${VERSION}:`;
const CACHE_STORAGE_NAME = `megsy-runtime-${VERSION}`;
const SMALL_MAX = 192 * 1024; // bytes of serialized JSON kept in localStorage
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type Entry<T> = { v: T; e: number };

const memory = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();

const hasWindow = typeof window !== "undefined";

function ls(): Storage | null {
  if (!hasWindow) return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function pruneLocalStorage(keepKey: string) {
  const store = ls();
  if (!store) return;
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && k.startsWith(PREFIX) && k !== keepKey) keys.push(k);
  }
  // Drop expired first, then oldest-expiry entries until we free room.
  const now = Date.now();
  const scored = keys.map((k) => {
    let exp = 0;
    try {
      exp = (JSON.parse(store.getItem(k) || "{}") as Entry<unknown>).e ?? 0;
    } catch {
      exp = 0;
    }
    return { k, exp };
  });
  scored.sort((a, b) => a.exp - b.exp);
  for (const { k, exp } of scored) {
    try {
      store.removeItem(k);
    } catch {
      /* ignore */
    }
    if (exp > now) break; // freed at least one live entry — enough for a retry
  }
}

function readLocal<T>(key: string): T | undefined {
  const store = ls();
  if (!store) return undefined;
  try {
    const raw = store.getItem(PREFIX + key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Entry<T>;
    if (!parsed || typeof parsed.e !== "number") return undefined;
    if (parsed.e < Date.now()) {
      store.removeItem(PREFIX + key);
      return undefined;
    }
    return parsed.v;
  } catch {
    return undefined;
  }
}

function writeLocal<T>(key: string, value: T, ttlMs: number): boolean {
  const store = ls();
  if (!store) return false;
  let raw: string;
  try {
    raw = JSON.stringify({ v: value, e: Date.now() + ttlMs } satisfies Entry<T>);
  } catch {
    return false;
  }
  if (raw.length > SMALL_MAX) return false;
  try {
    store.setItem(PREFIX + key, raw);
    return true;
  } catch {
    pruneLocalStorage(PREFIX + key);
    try {
      store.setItem(PREFIX + key, raw);
      return true;
    } catch {
      return false;
    }
  }
}

function cacheStorageUrl(key: string) {
  return `/__megsy-cache/${encodeURIComponent(key)}`;
}

async function readBig<T>(key: string): Promise<T | undefined> {
  if (!hasWindow || !("caches" in window)) return undefined;
  try {
    const c = await caches.open(CACHE_STORAGE_NAME);
    const res = await c.match(cacheStorageUrl(key));
    if (!res) return undefined;
    const exp = Number(res.headers.get("x-megsy-expires") || 0);
    if (exp && exp < Date.now()) {
      void c.delete(cacheStorageUrl(key));
      return undefined;
    }
    return (await res.json()) as T;
  } catch {
    return undefined;
  }
}

async function writeBig<T>(key: string, value: T, ttlMs: number): Promise<void> {
  if (!hasWindow || !("caches" in window)) return;
  try {
    const c = await caches.open(CACHE_STORAGE_NAME);
    await c.put(
      cacheStorageUrl(key),
      new Response(JSON.stringify(value), {
        headers: {
          "content-type": "application/json",
          "x-megsy-expires": String(Date.now() + ttlMs),
        },
      }),
    );
  } catch {
    /* quota / private mode — memory cache still applies */
  }
}

/** Synchronous peek: memory first, then localStorage. Never hits the network. */
export function peekCached<T>(key: string): T | undefined {
  if (memory.has(key)) return memory.get(key) as T;
  const local = readLocal<T>(key);
  if (local !== undefined) memory.set(key, local);
  return local;
}

/**
 * Load a value once and keep it locally forever (until TTL).
 * `loader` runs only on a true cache miss — repeat calls, reloads and new tabs
 * are served from local storage.
 */
export async function loadCached<T>(
  key: string,
  loader: () => Promise<T>,
  opts: { ttlMs?: number } = {},
): Promise<T> {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const hit = peekCached<T>(key);
  if (hit !== undefined) return hit;

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const task = (async () => {
    const big = await readBig<T>(key);
    if (big !== undefined) {
      memory.set(key, big);
      return big;
    }
    const value = await loader();
    memory.set(key, value);
    if (!writeLocal(key, value, ttlMs)) await writeBig(key, value, ttlMs);
    return value;
  })();

  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}

/** Fetch JSON once per URL, then serve it from local storage on every visit. */
export function cachedJson<T>(
  url: string,
  opts: { key?: string; ttlMs?: number } = {},
): Promise<T> {
  return loadCached<T>(
    opts.key ?? `json:${url}`,
    async () => {
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      return (await res.json()) as T;
    },
    { ttlMs: opts.ttlMs },
  );
}

/** Remove a single cached entry from every tier. */
export async function invalidateCached(key: string): Promise<void> {
  memory.delete(key);
  try {
    ls()?.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
  if (hasWindow && "caches" in window) {
    try {
      const c = await caches.open(CACHE_STORAGE_NAME);
      await c.delete(cacheStorageUrl(key));
    } catch {
      /* ignore */
    }
  }
}

/** Wipe the whole runtime cache (used by "clear local data" flows). */
export async function clearRuntimeCache(): Promise<void> {
  memory.clear();
  const store = ls();
  if (store) {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => {
      try {
        store.removeItem(k);
      } catch {
        /* ignore */
      }
    });
  }
  if (hasWindow && "caches" in window) {
    try {
      await caches.delete(CACHE_STORAGE_NAME);
    } catch {
      /* ignore */
    }
  }
}
