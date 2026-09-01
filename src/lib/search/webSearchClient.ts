/** @doc Browser helper that asks our own search endpoint for live web results. */
import { authenticatedFetch } from "@/lib/authenticatedFetch";
export interface WebSource {
  title: string;
  url: string;
  snippet: string;
}

export async function fetchWebSources(
  query: string,
  count = 8,
  offset = 0,
): Promise<WebSource[]> {
  try {
    const resp = await authenticatedFetch("/api/web-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, count, offset }),
    });
    if (!resp.ok) return [];
    const data = (await resp.json()) as { results?: WebSource[] };
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
}

/**
 * Deep Research needs massive breadth, not one query's first page. Fan the
 * user's question out into many angled queries (facts, data, criticism,
 * timeline, expert analysis, official documents, future outlook) in both the
 * original language and English, read several result pages per angle, then
 * merge everything de-duplicated so a report can stand on 80+ distinct sources.
 */
export function buildResearchQueries(question: string): string[] {
  const q = (question || "").trim().replace(/\s+/g, " ").slice(0, 220);
  if (!q) return [];
  const isArabic = /[\u0600-\u06FF]/.test(q);
  const year = new Date().getFullYear();

  const base = [
    q,
    `${q} ${year}`,
    `${q} latest news analysis`,
    `${q} data statistics report`,
    `${q} official report study pdf`,
    `${q} expert analysis in depth`,
    `${q} criticism problems risks limitations`,
    `${q} comparison alternatives`,
    `${q} history timeline background`,
    `${q} future outlook forecast ${year + 1}`,
    `${q} case study real examples`,
    `${q} market size revenue numbers`,
  ];

  if (isArabic) {
    base.push(
      `${q} تحليل مفصل`,
      `${q} احصائيات وارقام`,
      `${q} دراسة تقرير رسمي`,
      `${q} مميزات وعيوب`,
    );
  }

  // De-duplicate while preserving order.
  const seen = new Set<string>();
  return base.filter((item) => (seen.has(item) ? false : (seen.add(item), true)));
}

export async function fetchResearchSources(
  question: string,
  limit = 90,
): Promise<WebSource[]> {
  const queries = buildResearchQueries(question);
  if (!queries.length) return [];
  // A single result page tops out around 20 links. Read the first pages of
  // every angle first (best signal), then go deeper on the strongest angles.
  const jobs: Array<[string, number]> = [];
  for (const offset of [0, 20, 40]) {
    for (const q of queries) {
      // Deep pages only for the primary angles — the long tail rarely pays off.
      if (offset > 0 && queries.indexOf(q) >= 8) continue;
      jobs.push([q, offset]);
    }
  }

  const batches: WebSource[][] = [];
  const WAVE = 3;
  for (let i = 0; i < jobs.length; i += WAVE) {
    const wave = jobs.slice(i, i + WAVE);
    batches.push(...(await Promise.all(wave.map(([q, o]) => fetchWebSources(q, 20, o)))));
    if (i + WAVE < jobs.length) await new Promise((r) => setTimeout(r, 1200));
  }
  const seen = new Set<string>();
  const out: WebSource[] = [];
  // Round-robin across queries so every angle is represented, not just the first.
  const maxLen = Math.max(...batches.map((b) => b.length), 0);
  for (let i = 0; i < maxLen && out.length < limit; i += 1) {
    for (const batch of batches) {
      const item = batch[i];
      if (!item || seen.has(item.url) || out.length >= limit) continue;
      seen.add(item.url);
      out.push(item);
    }
  }
  return out;
}

/** Formats sources as a numbered context block the model can cite from. */
export function formatSourcesBlock(sources: WebSource[]): string {
  if (!sources.length) return "";
  const lines = sources
    .map((s, i) => `[${i + 1}] ${s.title}\nURL: ${s.url}\n${s.snippet}`)
    .join("\n\n");
  return [
    `Live web results for this question (${sources.length} sources, fetched just now).`,
    "These are your evidence base. Mine them exhaustively — do NOT answer from",
    "memory and do NOT stop after the first few. Use at least 25 distinct",
    "sources when the material allows it, cite every factual claim inline as a",
    "Markdown link to the real URL, cross-check numbers across sources, note",
    "conflicts explicitly, and finish with a full Sources list of everything",
    "you actually used.",
    "",
    lines,
  ].join("\n");
}

