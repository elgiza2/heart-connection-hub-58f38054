/** @doc Session-backed store for opening generated PPTX/PDF slide files in a dedicated preview route. */

export type SlidesFilePreviewKind = "pptx" | "pdf";

export interface SlidesFilePreviewPayload {
  kind: SlidesFilePreviewKind;
  title: string;
  url: string;
  chatName?: string;
}

const mem = new Map<string, SlidesFilePreviewPayload>();
const KEY = (id: string) => `slides-file-preview:${id}`;

export function stashSlidesFileForPreview(payload: SlidesFilePreviewPayload): string {
  const id = `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  mem.set(id, payload);
  try {
    sessionStorage.setItem(KEY(id), JSON.stringify(payload));
  } catch {
    /* ignore quota/private mode */
  }
  return id;
}

export function readSlidesFileForPreview(id: string): SlidesFilePreviewPayload | null {
  const cached = mem.get(id);
  if (cached) return cached;
  try {
    const raw = sessionStorage.getItem(KEY(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SlidesFilePreviewPayload;
    if (!parsed?.url || (parsed.kind !== "pptx" && parsed.kind !== "pdf")) return null;
    mem.set(id, parsed);
    return parsed;
  } catch {
    return null;
  }
}