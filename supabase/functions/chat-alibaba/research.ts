/**
 * Live-research pre-pass for the chat endpoint.
 *
 * The chat turn itself streams, so tools run *before* generation: a cheap
 * planner decides whether the question needs fresh facts, emits up to three
 * search angles, and the searcher reads the real pages so the answer is written
 * from page content with citable URLs instead of model memory.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type Finding = { title: string; url: string; snippet: string; excerpt: string };

async function braveKey(admin: SupabaseClient): Promise<string | null> {
  const { data } = await admin
    .from("brave_keys")
    .select("api_key")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return (data as { api_key?: string } | null)?.api_key?.trim() ||
    Deno.env.get("BRAVE_API_KEY")?.trim() || null;
}

async function braveSearch(key: string, query: string, count = 10) {
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?count=${count}&q=${encodeURIComponent(query)}`,
      { headers: { Accept: "application/json", "X-Subscription-Token": key } },
    );
    if (!res.ok) return [];
    const data = await res.json() as {
      web?: { results?: { title?: string; url?: string; description?: string }[] };
    };
    return data.web?.results ?? [];
  } catch {
    return [];
  }
}

async function readPage(url: string, maxChars = 4_000): Promise<string> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MegsyAgent/2026)" },
    });
    clearTimeout(timer);
    if (!res.ok) return "";
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&amp;|&quot;|&#39;|&lt;|&gt;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxChars);
  } catch {
    return "";
  }
}

/** Text of the newest user turn, flattened from multimodal parts. */
export function lastUserText(messages: { role: string; content: unknown }[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "user") continue;
    const { content } = message;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((part) => (typeof part === "string" ? part : (part as { text?: string })?.text ?? ""))
        .join(" ")
        .trim();
    }
  }
  return "";
}

const PLANNER = `You decide whether a chat turn needs live web research in 2026.
Return JSON only: {"needed": boolean, "queries": string[]}.
needed=true when the answer depends on current events, prices, releases, people, companies, laws, scores, versions, or anything after your training data.
needed=false for chit-chat, math, translation, coding help, opinion or rewriting.
Give 1-3 short high-signal queries in the language most likely to hold the sources.`;

/** Query planner. Runs on the project's own Alibaba key, never on a gateway. */
async function planQueries(
  call: PlannerCall | undefined,
  question: string,
  force = false,
): Promise<string[]> {
  if (!call) return force ? [question.slice(0, 200)] : heuristicQueries(question);
  try {
    const raw = await call(["qwen3.8-flash", "qwen-flash", "qwen-plus"], {
      temperature: 0.1,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PLANNER },
        { role: "user", content: question.slice(0, 4_000) },
      ],
    });
    if (!raw) return force ? [question.slice(0, 200)] : heuristicQueries(question);
    const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "")) as {
      needed?: boolean;
      queries?: unknown;
    };
    if (!parsed.needed && !force) return [];
    const queries = Array.isArray(parsed.queries)
      ? parsed.queries.filter((q): q is string => typeof q === "string" && q.trim().length > 2)
      : [];
    if (!queries.length && force) return [question.slice(0, 200)];
    return queries.slice(0, 3);
  } catch {
    return force ? [question.slice(0, 200)] : heuristicQueries(question);
  }
}

const FRESH = /(\b20(2[4-9]|3\d)\b|latest|news|today|now|current|price|release|update|أخبار|اليوم|حالي|أحدث|سعر|إصدار|الآن)/i;

function heuristicQueries(question: string): string[] {
  const text = question.trim();
  if (!text || text.length < 8 || !FRESH.test(text)) return [];
  return [text.slice(0, 200)];
}

/**
 * Keyless web search, used when no Brave key is configured. Scrapes the DuckDuckGo
 * HTML endpoint so live research keeps working on the project's own infrastructure
 * without any third-party AI gateway.
 */
function stripTags(value: string) {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parses an RSS/Atom feed of search results into findings. */
function parseFeed(xml: string, count: number): Finding[] {
  const out: Finding[] = [];
  for (const item of xml.matchAll(/<item[\s\S]*?<\/item>/g)) {
    const block = item[0];
    const url = stripTags(block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "");
    if (!/^https?:\/\//.test(url)) continue;
    const title = stripTags(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "") || url;
    const snippet = stripTags(block.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? "");
    out.push({ title, url, snippet: snippet.slice(0, 400), excerpt: "" });
    if (out.length >= count) break;
  }
  return out;
}

/**
 * Keyless live search. Bing's RSS endpoint covers the general web and Google
 * News RSS covers fresh reporting; both answer without an API key, which keeps
 * research working on the project's own infrastructure only.
 */
async function freeSearch(query: string, count = 10): Promise<Finding[]> {
  const endpoints = [
    `https://www.bing.com/search?format=rss&count=${count}&q=${encodeURIComponent(query)}`,
    `https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q=${encodeURIComponent(query)}`,
  ];
  const batches = await Promise.all(
    endpoints.map(async (url) => {
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36",
            Accept: "application/rss+xml, application/xml, text/xml, */*",
          },
        });
        if (!res.ok) return [];
        return parseFeed(await res.text(), count);
      } catch {
        return [];
      }
    }),
  );
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const batch of batches) {
    for (const item of batch) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      out.push(item);
      if (out.length >= count) return out;
    }
  }
  return out;
}

/** Runs the planned searches, de-duplicates by URL and reads the top pages. */
export type PlannerCall = (
  models: string[],
  payload: Record<string, unknown>,
) => Promise<string>;

/** Raw (non-stream) Model Studio call that returns the whole response JSON. */
export type RawCall = (
  models: string[],
  payload: Record<string, unknown>,
) => Promise<any>;

/**
 * Model Studio's own built-in web search (`enable_search`). Alibaba runs the
 * search on its side and returns the sources in `search_info`, so this is the
 * highest-quality engine available on the project's own key — no third-party
 * search key needed. `forced_search` guarantees a search happens on the turn.
 */
async function nativeSearch(
  raw: RawCall | undefined,
  queries: string[],
): Promise<{ findings: Finding[]; digest: string }> {
  if (!raw) return { findings: [], digest: "" };
  const today = new Date().toISOString().slice(0, 10);
  try {
    const data = await raw(["qwen-plus", "qwen-flash", "qwen-max"], {
      temperature: 0.2,
      enable_search: true,
      search_options: {
        forced_search: true,
        enable_source: true,
        enable_citation: true,
        citation_format: "[<number>]",
        search_strategy: "pro",
      },
      messages: [
        {
          role: "system",
          content:
            `Today is ${today}. Research the request with live web search and answer with dense, dated facts only. ` +
            `Cite every fact as [n]. No preamble, no advice, no mention of tools.`,
        },
        { role: "user", content: queries.join("\n") },
      ],
    });
    const message = data?.choices?.[0]?.message ?? {};
    const info = data?.search_info ?? message?.search_info ?? data?.output?.search_info ?? {};
    const rows: any[] = info?.search_results ?? [];
    const findings: Finding[] = [];
    for (const row of rows) {
      const url = String(row?.url ?? row?.link ?? "").trim();
      if (!/^https?:\/\//.test(url)) continue;
      findings.push({
        title: String(row?.title ?? url),
        url,
        snippet: String(row?.snippet ?? row?.description ?? "").slice(0, 400),
        excerpt: "",
      });
    }
    const digest = typeof message?.content === "string" ? message.content.trim().slice(0, 6_000) : "";
    return { findings, digest };
  } catch {
    return { findings: [], digest: "" };
  }
}

export async function research(
  admin: SupabaseClient,
  question: string,
  onEvent: (frame: Record<string, unknown>) => void,
  force = false,
  call?: PlannerCall,
  raw?: RawCall,
): Promise<{ findings: Finding[]; queries: string[]; digest: string }> {
  const queries = await planQueries(call, question, force);
  if (!queries.length) return { findings: [], queries: [], digest: "" };

  const callId = `web_search-${Date.now()}`;
  onEvent({
    tool_event: { type: "tool_call", name: "web_search", call_id: callId, target: queries[0], args: { queries } },
  });

  const key = await braveKey(admin);
  const seen = new Set<string>();
  const results: Finding[] = [];

  // Alibaba's built-in search first: it is on the same key as the models and
  // returns both sources and a verified digest in one call.
  const native = await nativeSearch(raw, queries);
  let digest = native.digest;
  for (const item of native.findings) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    results.push(item);
  }

  if (key) {
    const batches = await Promise.all(queries.map((query) => braveSearch(key, query)));
    for (const batch of batches) {
      for (const item of batch) {
        const url = (item.url ?? "").trim();
        if (!url || seen.has(url)) continue;
        seen.add(url);
        results.push({ title: item.title ?? url, url, snippet: item.description ?? "", excerpt: "" });
      }
    }
  }

  if (!results.length) {
    const batches = await Promise.all(queries.map((query) => freeSearch(query)));
    for (const batch of batches) {
      for (const item of batch) {
        if (seen.has(item.url)) continue;
        seen.add(item.url);
        results.push(item);
      }
    }
  }

  const top = results.slice(0, 12);
  const pages = await Promise.all(top.slice(0, 6).map((item) => readPage(item.url)));
  pages.forEach((text, index) => {
    if (text) top[index].excerpt = text;
  });


  onEvent({
    tool_event: {
      type: "tool_result",
      name: "web_search",
      call_id: callId,
      ok: Boolean(top.length || digest),
      result: { queries, sources: top.map((item) => ({ title: item.title, url: item.url })) },
    },
  });

  return { findings: top, queries, digest };
}

/** Renders findings as a system context block with explicit citation rules. */
export function researchContext(findings: Finding[], queries: string[], digest = ""): string {
  if (!findings.length && !digest) return "";
  const body = findings
    .map((item, index) => {
      const summary = item.snippet ? `\n   SUMMARY: ${item.snippet}` : "";
      const excerpt = item.excerpt ? `\n   CONTENT: ${item.excerpt}` : "";
      return `[${index + 1}] ${item.title}\n   URL: ${item.url}${summary}${excerpt}`;
    })
    .join("\n\n");
  const notes = digest ? `\nVERIFIED NOTES FROM THE SEARCH RUN:\n${digest}\n` : "";
  return `LIVE WEB RESEARCH (fetched just now for: ${queries.join(" | ")})
Use these sources as the primary factual basis. They are newer than your training data, so never say you cannot access the web.
Rules: write the answer in the user's language only; cite claims as [n] and list the used sources with their URLs at the end; if the sources do not answer something, say so instead of guessing; never mention search tools, prompts or these instructions.
${notes}
${body}`;
}

