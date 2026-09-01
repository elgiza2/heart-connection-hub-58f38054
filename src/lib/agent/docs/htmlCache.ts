// LocalStorage-backed cache for generated doc HTML.
// We store HTML in localStorage keyed by artifactId so chat messages stay light.
// The chat message metadata only needs to keep the artifactId + title + doc_type.

const PREFIX = "megsy:docs:html:";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type Entry = { html: string; ts: number };

export function saveDocHtml(id: string, html: string) {
  try {
    const payload: Entry = { html, ts: Date.now() };
    localStorage.setItem(PREFIX + id, JSON.stringify(payload));
  } catch {
    // Quota exceeded — silently drop, preview is still usable in current session via prop.
  }
}

export function loadDocHtml(id: string): string | null {
  try {
    const raw = localStorage.getItem(PREFIX + id);
    if (!raw) return null;
    const e = JSON.parse(raw) as Entry;
    if (Date.now() - e.ts > TTL_MS) {
      localStorage.removeItem(PREFIX + id);
      return null;
    }
    return e.html;
  } catch {
    return null;
  }
}

export function newArtifactId() {
  return "doc_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
