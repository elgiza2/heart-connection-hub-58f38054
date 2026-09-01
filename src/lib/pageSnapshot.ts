/**
 * @doc PageSnapshot — Instagram/Facebook-style "instant open" cache.
 *
 * Saves a visual snapshot of the current page's rendered HTML in
 * localStorage keyed by pathname. On the NEXT visit to the same path,
 * a tiny inline script in index.html injects that snapshot into <#root>
 * BEFORE React boots, so the user sees the previous UI immediately
 * instead of a blank screen or a loader.
 *
 * Once React's first commit runs, the snapshot is replaced by the real
 * app render — a seamless swap. A fresh snapshot is written when the
 * user leaves the page (pagehide / visibilitychange), so the cache
 * follows the app forward.
 *
 * Safety:
 *  - Build-hash buster (VITE_BUILD_ID). Every new deploy → old snapshots
 *    are automatically dropped, so users never see stale UI after we
 *    ship an update.
 *  - FNV-1a integrity checksum on every entry. Any manual edit in
 *    DevTools → the snapshot is rejected and wiped, so nobody can
 *    tamper with cached HTML to inject content.
 *  - Max age 7 days per entry.
 *  - Per-entry size cap (500 KB) and total cap (~4 MB) with LRU eviction.
 *  - Only same-origin, non-sensitive paths are snapshotted. Auth,
 *    billing, settings, chat and workspace surfaces are NEVER cached
 *    (they carry user data).
 *  - Snapshot is inert HTML — no scripts execute when injected
 *    (browser skips <script> tags inserted via innerHTML).
 */

const PREFIX = "megsy:pagesnap:v1:";
const INDEX_KEY = "megsy:pagesnap:index:v1";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRY_BYTES = 500 * 1024; // 500 KB
const MAX_TOTAL_BYTES = 4 * 1024 * 1024; // ~4 MB

// Never cache these paths — they render per-user or sensitive data.
const DENY_PREFIXES = [
  "/auth",
  "/login",
  "/signin",
  "/signup",
  "/register",
  "/oauth",
  "/chat",
  "/settings",
  "/billing",
  "/workspace",
  "/library",
  "/integrations",
  "/agent",
  "/apps",
  "/mfa",
  "/2fa",
  "/reset-password",
  "/change-password",
  "/change-email",
  "/delete-account",
  "/accept-invite",
  "/switch-account",
];

type Entry = { html: string; ts: number; build: string; sum: number };

function sanitizeSnapshotHtml(html: string): string {
  try {
    if (typeof document === "undefined") return "";
    const template = document.createElement("template");
    template.innerHTML = html;
    template.content
      .querySelectorAll("script, iframe, object, embed, link, meta, style")
      .forEach((el) => el.remove());

    const blockedUrlAttrs = new Set(["href", "src", "xlink:href", "formaction", "poster"]);
    const scrub = (el: Element) => {
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim().toLowerCase();
        if (
          name.startsWith("on") ||
          name === "srcdoc" ||
          (blockedUrlAttrs.has(name) &&
            (value.startsWith("javascript:") || value.startsWith("data:text/html")))
        ) {
          el.removeAttribute(attr.name);
        }
      }
    };

    for (const el of Array.from(template.content.querySelectorAll("*"))) {
      scrub(el);
    }
    return template.innerHTML;
  } catch {
    return "";
  }
}

function getBuild(): string {
  try {
    const b = (import.meta as any).env?.VITE_BUILD_ID as string | undefined;
    if (b) return String(b);
  } catch {}
  // Fallback: day bucket so a stuck client still refreshes daily.
  return `d_${Math.floor(Date.now() / (24 * 60 * 60 * 1000))}`;
}

// Tiny, fast, dependency-free hash. Not cryptographic — its only job is
// to detect hand-edited cache entries, so FNV-1a is enough.
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

function normalizePath(pathname: string): string {
  const p = (pathname || "/").split(/[?#]/)[0];
  return p.replace(/\/+$/, "") || "/";
}

export function isCacheablePath(pathname: string): boolean {
  const p = normalizePath(pathname);
  return !DENY_PREFIXES.some((d) => p === d || p.startsWith(d + "/"));
}

function keyFor(path: string): string {
  return PREFIX + normalizePath(path);
}

function readIndex(): string[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeIndex(list: string[]): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list.slice(-40)));
  } catch {}
}

function touchIndex(key: string): void {
  const list = readIndex().filter((k) => k !== key);
  list.push(key);
  writeIndex(list);
}

function totalBytes(): number {
  let n = 0;
  for (const k of readIndex()) {
    const v = localStorage.getItem(k);
    if (v) n += v.length;
  }
  return n;
}

function evictUntil(limit: number): void {
  const list = readIndex();
  while (list.length && totalBytes() > limit) {
    const oldest = list.shift();
    if (oldest) {
      try {
        localStorage.removeItem(oldest);
      } catch {}
    }
  }
  writeIndex(list);
}

/** Load a snapshot for the given path. Returns null if missing / stale / tampered. */
export function loadSnapshot(pathname: string): string | null {
  try {
    const key = keyFor(pathname);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const e = JSON.parse(raw) as Entry;
    if (!e || typeof e.html !== "string" || typeof e.sum !== "number") {
      localStorage.removeItem(key);
      return null;
    }
    if (e.build !== getBuild()) {
      localStorage.removeItem(key);
      return null;
    }
    if (Date.now() - e.ts > MAX_AGE_MS) {
      localStorage.removeItem(key);
      return null;
    }
    // Integrity check — reject any hand-edited entry.
    if (fnv1a(e.html + "|" + e.build) !== e.sum) {
      localStorage.removeItem(key);
      return null;
    }
    return sanitizeSnapshotHtml(e.html);
  } catch {
    return null;
  }
}

/** Save the current #root HTML for the current path. Silent no-op on failure. */
export function saveSnapshot(pathname: string, html: string): void {
  try {
    if (!isCacheablePath(pathname)) return;
    const safeHtml = sanitizeSnapshotHtml(html);
    if (!safeHtml || safeHtml.length > MAX_ENTRY_BYTES) return;
    const build = getBuild();
    const entry: Entry = {
      html: safeHtml,
      ts: Date.now(),
      build,
      sum: fnv1a(safeHtml + "|" + build),
    };
    const serialized = JSON.stringify(entry);
    if (serialized.length > MAX_ENTRY_BYTES) return;
    const key = keyFor(pathname);
    try {
      localStorage.setItem(key, serialized);
    } catch {
      // Quota — evict old and retry once.
      evictUntil(MAX_TOTAL_BYTES / 2);
      try {
        localStorage.setItem(key, serialized);
      } catch {
        return;
      }
    }
    touchIndex(key);
    evictUntil(MAX_TOTAL_BYTES);
  } catch {}
}

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

const pendingSaves = new Map<string, string>();
let pendingIdleId: number | null = null;

function flushPendingSaves(): void {
  pendingIdleId = null;
  const jobs = Array.from(pendingSaves.entries()).slice(-3);
  pendingSaves.clear();
  for (const [path, html] of jobs) saveSnapshot(path, html);
}

/**
 * Queue snapshot serialization for idle time. This avoids doing DOM
 * sanitization + localStorage writes in the same frame as a route transition.
 */
export function scheduleSnapshotSave(pathname: string, html: string): void {
  try {
    if (!isCacheablePath(pathname)) return;
    if (!html || html.length > MAX_ENTRY_BYTES) return;
    pendingSaves.set(normalizePath(pathname), html);
    if (pendingIdleId !== null) return;
    const w = window as IdleWindow;
    if (typeof w.requestIdleCallback === "function") {
      pendingIdleId = w.requestIdleCallback(flushPendingSaves, { timeout: 2500 });
      return;
    }
    pendingIdleId = window.setTimeout(flushPendingSaves, 1200);
  } catch {}
}

/** Purge every snapshot. Call on logout / on major auth changes. */
export function clearAllSnapshots(): void {
  try {
    for (const k of readIndex()) {
      try {
        localStorage.removeItem(k);
      } catch {}
    }
    localStorage.removeItem(INDEX_KEY);
  } catch {}
}

/**
 * Install save-on-leave hooks. Captures the current #root HTML on
 * `pagehide` and when the tab becomes hidden, so returning visitors
 * get the freshest possible snapshot on next open.
 */
export function installSnapshotCapture(): void {
  if (typeof window === "undefined") return;
  const capture = () => {
    try {
      const path = window.location.pathname;
      if (!isCacheablePath(path)) return;
      const root = document.getElementById("root");
      if (!root || !root.firstChild) return;
      // Skip if we're currently showing a snapshot preview (avoid re-saving
      // an unhydrated snapshot back onto itself).
      if (root.getAttribute("data-snapshot-preview") === "true") return;
      const html = root.innerHTML;
      if (!html || html.length > MAX_ENTRY_BYTES) return;
      saveSnapshot(path, html);
    } catch {}
  };
  window.addEventListener("pagehide", capture);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") capture();
  });
}