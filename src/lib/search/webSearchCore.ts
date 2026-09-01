/** @doc Server-only web search core: You.com search with smart key rotation from the Supabase key pool (provider "y"). */
import { createClient } from "@supabase/supabase-js";

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchResponse {
  results: WebSearchResult[];
  error?: string;
}

function serverClient() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase server credentials are not configured");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function normalise(payload: any): WebSearchResult[] {
  const buckets: any[] = [];
  if (Array.isArray(payload?.results)) buckets.push(...payload.results);
  if (Array.isArray(payload?.hits)) buckets.push(...payload.hits);
  if (Array.isArray(payload?.web?.results)) buckets.push(...payload.web.results);
  if (Array.isArray(payload?.data?.results)) buckets.push(...payload.data.results);
  if (Array.isArray(payload?.results?.web)) buckets.push(...payload.results.web);

  const out: WebSearchResult[] = [];
  for (const item of buckets) {
    const url = item?.url || item?.link || item?.source_url;
    if (!url) continue;
    const snippets = Array.isArray(item?.snippets) ? item.snippets.join(" ") : "";
    const snippet =
      snippets ||
      item?.snippet ||
      item?.description ||
      item?.text ||
      item?.content ||
      "";
    out.push({
      title: String(item?.title || item?.name || url).slice(0, 220),
      url: String(url),
      snippet: String(snippet).replace(/\s+/g, " ").slice(0, 900),
    });
  }
  // De-duplicate by URL.
  const seen = new Set<string>();
  return out.filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true)));
}

async function callYou(apiKey: string, query: string, count: number, offset = 0) {
  const url = new URL("https://api.you.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("count", String(Math.min(Math.max(count, 1), 20)));
  if (offset > 0) url.searchParams.set("offset", String(offset));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const resp = await fetch(url.toString(), {
      headers: { "X-API-Key": apiKey, Accept: "application/json" },
      signal: controller.signal,
    });
    const text = await resp.text();
    if (!resp.ok) {
      return { ok: false as const, status: resp.status, error: text.slice(0, 300) };
    }
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false as const, status: 502, error: "invalid json" };
    }
    return { ok: true as const, results: normalise(json) };
  } catch (err) {
    return {
      ok: false as const,
      status: 599,
      error: err instanceof Error ? err.message : "network error",
    };
  } finally {
    clearTimeout(timer);
  }
}

function decodeHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * Keyless primary fallback. Bing's RSS feed answers from datacenter IPs but its
 * results drift off-topic and its paging repeats, so read Brave's result page
 * first — it returns ~19 on-topic results per page and pages cleanly.
 */
async function braveSearch(query: string, count: number, offset = 0): Promise<WebSearchResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const url = new URL("https://search.brave.com/search");
    url.searchParams.set("q", query);
    // Brave pages by result-page index (~20 results each), not item offset.
    const page = Math.floor(Math.max(offset, 0) / 20);
    if (page > 0) url.searchParams.set("offset", String(page));
    const resp = await fetch(url.toString(), {
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });
    if (!resp.ok) return { results: [], error: `brave HTTP ${resp.status}` };
    const html = await resp.text();
    const results: WebSearchResult[] = [];
    const seen = new Set<string>();
    for (const block of html.split('<div class="snippet ').slice(1)) {
      if (!block.includes('data-type="web"')) continue;
      const href = block.match(/href="(https?:\/\/[^"]+)"/)?.[1];
      if (!href || /search\.brave\.com|imgs\.search\.brave/.test(href)) continue;
      const link = decodeHtml(href.replace(/&amp;/g, "&"));
      if (seen.has(link)) continue;
      seen.add(link);
      const title = decodeHtml(
        block.match(/class="title[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? link,
      ).slice(0, 220);
      const snippet = decodeHtml(
        block.match(/class="snippet-description[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "",
      ).slice(0, 900);
      results.push({ title, url: link, snippet });
      if (results.length >= count) break;
    }
    return results.length ? { results } : { results: [], error: "no results" };
  } catch (err) {
    return { results: [], error: err instanceof Error ? err.message : "search failed" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Google News RSS: always reachable (no key, no throttling) and always on
 * topic, which makes it the dependable half of the keyless path. It returns a
 * long single list, so paging is a slice of that list.
 */
async function googleNewsSearch(
  query: string,
  count: number,
  offset = 0,
): Promise<WebSearchResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const url = new URL("https://news.google.com/rss/search");
    url.searchParams.set("q", query);
    url.searchParams.set("hl", "en-US");
    url.searchParams.set("gl", "US");
    url.searchParams.set("ceid", "US:en");
    const resp = await fetch(url.toString(), {
      headers: { "User-Agent": BROWSER_UA, Accept: "application/rss+xml, application/xml" },
      signal: controller.signal,
    });
    if (!resp.ok) return { results: [], error: `news HTTP ${resp.status}` };
    const xml = await resp.text();
    const all: WebSearchResult[] = [];
    const seen = new Set<string>();
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml))) {
      const block = m[1];
      const link = decodeHtml(block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "");
      if (!/^https?:\/\//.test(link) || seen.has(link)) continue;
      seen.add(link);
      const source = decodeHtml(block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "");
      const title = decodeHtml(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? link);
      const date = decodeHtml(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "");
      all.push({
        title: title.slice(0, 220),
        url: link,
        snippet: [source, date, decodeHtml(block.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? "")]
          .filter(Boolean)
          .join(" · ")
          .slice(0, 900),
      });
    }
    const page = all.slice(offset, offset + count);
    return page.length ? { results: page } : { results: [], error: "no results" };
  } catch (err) {
    return { results: [], error: err instanceof Error ? err.message : "search failed" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Keyless path. Brave gives the best general web results but throttles bursts
 * hard (429), so its calls go through one spaced-out queue; Google News fills
 * the rest. The old Bing RSS backup was dropped on purpose — it answered with
 * cached, unrelated pages, and junk sources damage a report more than missing
 * ones.
 */
let braveQueue: Promise<unknown> = Promise.resolve();
let lastBraveAt = 0;

async function bravePaced(query: string, count: number, offset: number): Promise<WebSearchResult[]> {
  const run = braveQueue.then(async () => {
    const wait = Math.max(0, 1300 - (Date.now() - lastBraveAt));
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastBraveAt = Date.now();
    const brave = await braveSearch(query, count, offset);
    return brave.results;
  });
  braveQueue = run.catch(() => undefined);
  return run.catch(() => [] as WebSearchResult[]);
}

async function keylessSearch(query: string, count: number, offset = 0): Promise<WebSearchResponse> {
  const [brave, news] = await Promise.all([
    bravePaced(query, count, offset),
    googleNewsSearch(query, count, offset),
  ]);
  const seen = new Set<string>();
  const merged: WebSearchResult[] = [];
  for (const item of [...brave, ...news.results]) {
    if (seen.has(item.url) || merged.length >= count) continue;
    seen.add(item.url);
    merged.push(item);
  }
  return merged.length ? { results: merged } : { results: [], error: news.error ?? "no results" };
}

/**
 * Runs a web search, rotating through the pooled keys. A key that errors is
 * reported (3 strikes → blocked) and the next key is tried automatically.
 */
export async function webSearch(query: string, count = 8, offset = 0): Promise<WebSearchResponse> {
  const trimmed = (query || "").trim();
  if (!trimmed) return { results: [], error: "empty query" };

  let supabase: ReturnType<typeof serverClient>;
  try {
    supabase = serverClient();
  } catch {
    // No server credentials (local/preview runtime): Deep Research still needs
    // live sources, so fall back to the keyless provider instead of returning
    // an empty list, which makes the model answer without any evidence.
    return keylessSearch(trimmed, count, offset);
  }
  let lastError = "no keys configured";

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await supabase.rpc("next_provider_key", { p_provider: "y" });
    const row = Array.isArray(data) ? (data[0] as { id: string; api_key: string } | undefined) : undefined;
    if (error) return keylessSearch(trimmed, count, offset);
    if (!row?.api_key) return keylessSearch(trimmed, count, offset);

    const result = await callYou(row.api_key, trimmed, count, offset);
    if (result.ok && result.results.length) {
      await supabase.rpc("report_provider_key_success", { p_key_id: row.id });
      return { results: result.results };
    }
    if (result.ok) {
      await supabase.rpc("report_provider_key_success", { p_key_id: row.id });
      return keylessSearch(trimmed, count, offset);
    }
    lastError = `HTTP ${result.status}`;
    await supabase.rpc("report_provider_key_failure", {
      p_key_id: row.id,
      p_error: `${result.status}: ${result.error}`.slice(0, 300),
    });
  }

  return { results: [], error: lastError };
}
