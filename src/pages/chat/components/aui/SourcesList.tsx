import { ExternalLink } from "lucide-react";

export interface SourceItem {
  title?: string;
  url: string;
  snippet?: string;
  favicon?: string;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function getDomain(url: string | undefined): string {
  if (!url) return "";
  return domainOf(url);
}


function faviconFor(url: string): string {
  const d = domainOf(url);
  return `https://www.google.com/s2/favicons?domain=${d}&sz=64`;
}

/**
 * Extract source list from arbitrary tool result payloads (web_search, browse, fetch_url, ...).
 * Supports common shapes: { results: [...] }, { sources: [...] }, [ ... ], { organic: [...] }.
 */
export function extractSources(result: unknown): SourceItem[] {
  if (!result) return [];
  const raw = result as Record<string, unknown>;
  const candidates: unknown[] =
    (Array.isArray(raw) ? raw : null) ||
    (Array.isArray(raw.sources) ? (raw.sources as unknown[]) : null) ||
    (Array.isArray(raw.results) ? (raw.results as unknown[]) : null) ||
    (Array.isArray(raw.organic) ? (raw.organic as unknown[]) : null) ||
    (Array.isArray(raw.citations) ? (raw.citations as unknown[]) : null) ||
    [];
  const items: SourceItem[] = [];
  for (const c of candidates) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    const url = String(o.url || o.link || o.href || "");
    if (!url || !/^https?:\/\//i.test(url)) continue;
    items.push({
      url,
      title: (o.title || o.name || o.heading) as string | undefined,
      snippet: (o.snippet || o.description || o.summary) as string | undefined,
      favicon: (o.favicon as string | undefined) || faviconFor(url),
    });
  }
  return items.slice(0, 12);
}

export function SourcesList({ sources }: { sources: SourceItem[] }) {
  if (!sources.length) return null;
  return (
    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
      {sources.map((s, i) => (
        <a
          key={`${s.url}-${i}`}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-start gap-2 rounded-xl border border-foreground/10 bg-background/40 p-2 hover:bg-foreground/5 transition-colors text-[12px]"
        >
          <img decoding="async"
            src={s.favicon}
            alt=""
            className="w-4 h-4 rounded-sm mt-0.5 shrink-0"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
            }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
              <span className="truncate">{domainOf(s.url)}</span>
              <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100" />
            </div>
            {s.title && (
              <div className="text-foreground/90 font-medium line-clamp-2">{s.title}</div>
            )}
            {s.snippet && (
              <div className="text-muted-foreground line-clamp-2 mt-0.5">{s.snippet}</div>
            )}
          </div>
        </a>
      ))}
    </div>
  );
}
