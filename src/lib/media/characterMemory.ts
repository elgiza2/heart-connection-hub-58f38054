// Memory هوية الشخصيات المولدة (Character identity memory).
// نحتفظ محليًا بكل شخصية/موضوع تم توليده مع وصفه وصورته المرجعية، حتى يمكن
// إعادة استخدام نفس الهوية في أي وقت لاحق بمجرد ذكر اسمها في الطلب.

const KEY = "megsy_character_memory_v1";
const LIMIT = 40;

export interface RememberedCharacter {
  id: string;
  /** اسم مختصر يستخدمه المستخدم للنداء على الشخصية. */
  name: string;
  /** الوصف البصري الكامل (البرومبت الذي وُلدت منه). */
  descriptor: string;
  /** رابط Imagesة المرجعية. */
  refUrl?: string;
  createdAt: number;
}

function read(): RememberedCharacter[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as RememberedCharacter[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: RememberedCharacter[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, LIMIT)));
  } catch {
    /* storage full / disabled */
  }
}

export function listCharacters(): RememberedCharacter[] {
  return read();
}

/** يستخرج اسمًا قصيرًا صالحًا للنداء من البرومبت. */
export function deriveCharacterName(prompt: string): string {
  const cleaned = (prompt || "")
    .replace(/[\n\r]+/g, " ")
    .replace(/["'`*_#]/g, "")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 4);
  return words.join(" ").slice(0, 48) || "character";
}

export function rememberCharacter(input: {
  name?: string;
  descriptor: string;
  refUrl?: string;
}): RememberedCharacter | null {
  const descriptor = (input.descriptor || "").trim();
  if (!descriptor) return null;
  const name = (input.name || deriveCharacterName(descriptor)).trim();
  const list = read();
  const existing = list.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.descriptor = descriptor;
    if (input.refUrl) existing.refUrl = input.refUrl;
    existing.createdAt = Date.now();
    write([existing, ...list.filter((c) => c.id !== existing.id)]);
    return existing;
  }
  const entry: RememberedCharacter = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    descriptor,
    refUrl: input.refUrl,
    createdAt: Date.now(),
  };
  write([entry, ...list]);
  return entry;
}

export function forgetCharacter(id: string) {
  write(read().filter((c) => c.id !== id));
}

/**
 * يSearch عن شخصية محفوظة مذكورة داخل نص الطلب (مطابقة كلمات مميزة)،
 * فيتم إعادة استخدام هويتها تلقائيًا دون أن يعيد المستخدم وصفها.
 */
export function findMentionedCharacter(text: string): RememberedCharacter | null {
  const t = (text || "").toLowerCase();
  if (!t.trim()) return null;
  const list = read();
  let best: { c: RememberedCharacter; score: number } | null = null;
  for (const c of list) {
    const tokens = c.name
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 3);
    if (!tokens.length) continue;
    const hits = tokens.filter((w) => t.includes(w)).length;
    const score = hits / tokens.length;
    if (score >= 0.6 && (!best || score > best.score)) best = { c, score };
  }
  return best?.c ?? null;
}
