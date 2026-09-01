/**
 * Validate a `redirect` query param so it can only point to a same-origin
 * path. Rejects absolute URLs, protocol-relative URLs (`//evil.com`),
 * javascript: / data: URIs, and anything not starting with a single `/`.
 * Returns `null` when unsafe, allowing callers to fall back to a default.
 */
export function safeInternalPath(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const v = value.trim();
  if (v.length === 0 || v.length > 2048) return null;
  // Must start with a single slash and NOT be protocol-relative "//"
  if (!v.startsWith("/")) return null;
  if (v.startsWith("//") || v.startsWith("/\\")) return null;
  // Disallow scheme-like sequences and control chars
  if (/[\u0000-\u001f]/.test(v)) return null;
  if (/^\/[a-z][a-z0-9+.\-]*:/i.test(v)) return null;
  return v;
}

/**
 * Build a same-origin absolute redirectTo URL for OAuth providers, given
 * a user-supplied path. Falls back to the provided default path.
 */
export function safeRedirectTo(pathParam: string | null | undefined, fallbackPath: string): string {
  const path = safeInternalPath(pathParam) ?? fallbackPath;
  if (typeof window === "undefined") return path;
  return window.location.origin + path;
}
