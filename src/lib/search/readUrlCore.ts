/** @doc Server-only page reader used by the Deep Research agent: pulls the
 *  readable text of a URL (Jina reader first, raw HTML fallback).
 *  All outbound fetches go through the shared SSRF guard, which resolves DNS
 *  and re-validates every redirect hop. */

import { BROWSER_UA, resolveSafeUrl, safeFetch } from "./ssrfGuard";

export interface ReadUrlResult {
  url: string;
  title: string;
  text: string;
  error?: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export async function readUrl(rawUrl: string, maxChars = 9000): Promise<ReadUrlResult> {
  const url = String(rawUrl || "").trim();
  const target = await resolveSafeUrl(url);
  if (!target) return { url, title: "", text: "", error: "invalid or private url" };

  // 1) Jina reader — returns clean Markdown for most pages, no key needed.
  try {
    const out = await withTimeout(22_000, async (signal) => {
      const resp = await fetch(`https://r.jina.ai/${target.url.href}`, {
        headers: { "User-Agent": BROWSER_UA, Accept: "text/plain" },
        signal,
      });
      if (!resp.ok) throw new Error(`jina HTTP ${resp.status}`);
      return await resp.text();
    });
    const cleaned = out.replace(/\n{3,}/g, "\n\n").trim();
    if (cleaned.length > 400) {
      const title = cleaned.match(/^Title:\s*(.+)$/m)?.[1]?.trim() || "";
      return { url, title, text: cleaned.slice(0, maxChars) };
    }
  } catch {
    /* fall through */
  }

  // 2) Raw fetch + tag strip, with every redirect hop re-validated.
  try {
    const html = await withTimeout(18_000, async (signal) => {
      const { response } = await safeFetch(target.url.href, {
        headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xhtml+xml" },
        signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    });
    const title = stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").slice(0, 200);
    const text = stripHtml(html).slice(0, maxChars);
    if (text.length < 200) return { url, title, text, error: "too short" };
    return { url, title, text };
  } catch (err) {
    return {
      url,
      title: "",
      text: "",
      error: err instanceof Error ? err.message : "read failed",
    };
  }
}

export async function readUrls(urls: string[], maxChars = 9000): Promise<ReadUrlResult[]> {
  const list = urls.filter(Boolean).slice(0, 12);
  const out: ReadUrlResult[] = [];
  const WAVE = 4;
  for (let i = 0; i < list.length; i += WAVE) {
    const wave = list.slice(i, i + WAVE);
    out.push(...(await Promise.all(wave.map((u) => readUrl(u, maxChars)))));
  }
  return out;
}
