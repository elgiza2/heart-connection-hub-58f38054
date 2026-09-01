/** @doc In-memory + sessionStorage store to hand a SlideDeck to /slides/preview/:id. */
import type { SlideDeck } from "@/components/chat/SlidesDeckCard";

const mem = new Map<string, SlideDeck>();
const KEY = (id: string) => `slides-preview:${id}`;

export function stashSlidesDeckForPreview(deck: SlideDeck): string {
  const id = `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  mem.set(id, deck);
  try {
    sessionStorage.setItem(KEY(id), JSON.stringify(deck));
  } catch {
    /* ignore quota */
  }
  return id;
}

export function readSlidesDeckForPreview(id: string): SlideDeck | null {
  const m = mem.get(id);
  if (m) return m;
  try {
    const raw = sessionStorage.getItem(KEY(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SlideDeck;
    mem.set(id, parsed);
    return parsed;
  } catch {
    return null;
  }
}
