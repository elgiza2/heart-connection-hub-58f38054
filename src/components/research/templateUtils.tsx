// Shared types + helpers for research templates
import { useEffect, useState } from "react";

export interface ReportData {
  query: string;
  report: string;
  images: string[];
}

const cleanHeading = (value: string): string =>
  value
    .replace(/^(?:deep\s*research|بحث\s*عميق)\s*[:\-–—|]?\s*/i, "")
    .replace(/^\s*(?:\d+|[٠-٩]+)(?:[.)\-–—:]|\s)+\s*/, "")
    .replace(/[*_`#]/g, "")
    .trim();

export interface TemplateProps {
  data: ReportData;
  cleanReport: string;
  isRtl: boolean;
  reportEmpty: boolean;
}

export interface Section {
  heading: string;
  body: string;
}

// Split markdown by ## headings into editorial sections. The report's single
// top-level "# title" is captured as the real, model-written report title.
export const splitIntoSections = (
  md: string,
): { title: string; intro: string; sections: Section[] } => {
  const lines = md.split("\n");
  const intro: string[] = [];
  const sections: Section[] = [];
  let title = "";
  let current: Section | null = null;
  let started = false;
  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m && !line.startsWith("###")) {
      if (current) sections.push(current);
      current = { heading: cleanHeading(m[1]), body: "" };
      started = true;
      continue;
    }
    if (!started && /^#\s+/.test(line)) {
      if (!title) title = cleanHeading(line.replace(/^#\s+/, ""));
      continue;
    }
    if (current) current.body += line + "\n";
    else intro.push(line);
  }
  if (current) sections.push(current);
  return { title, intro: intro.join("\n").trim(), sections };
};

export const extractUrls = (md: string): string[] => {
  const urls = new Set<string>();
  const re = /https?:\/\/[^\s)\]<>"]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    const u = m[0].replace(/[.,;:!?]+$/, "");
    if (urls.size < 18) urls.add(u);
  }
  return Array.from(urls);
};

export interface SourceItem {
  url: string;
  title: string;
}

// Extract ordered, deduped sources from a report. Prefers markdown links
// (keeps the link text as the title) and falls back to bare URLs.
export const extractSources = (md: string): SourceItem[] => {
  const byUrl = new Map<string, string>();
  const linkRe = /\[([^\]]{1,160})\]\((https?:\/\/[^\s)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(md))) {
    const url = m[2].replace(/[.,;:!?]+$/, "");
    const title = (m[1] || "").replace(/\s+/g, " ").trim();
    if (!byUrl.has(url)) byUrl.set(url, title);
  }
  const bareRe = /https?:\/\/[^\s)\]<>"]+/g;
  while ((m = bareRe.exec(md))) {
    const url = m[0].replace(/[.,;:!?]+$/, "");
    if (!byUrl.has(url)) byUrl.set(url, "");
  }
  // Bare-domain citations (liverpoolfc.com, www.fifa.com) count as sources too.
  const hostRe =
    /(?<![\w/.])((?:www\.)?(?:[a-z0-9-]+\.)+(?:com|org|net|io|gov|edu|info|news|me|tv|co|ai|eg|sa|ae|tr|uk|de|fr)(?:\.[a-z]{2})?)(?![\w/])/gi;
  while ((m = hostRe.exec(md))) {
    const host = m[1].toLowerCase();
    const url = `https://${host}`;
    const exists = Array.from(byUrl.keys()).some((u) => hostname(u) === host.replace(/^www\./, ""));
    if (!exists) byUrl.set(url, "");
  }
  return Array.from(byUrl.entries())
    .slice(0, 60)
    .map(([url, title]) => ({ url, title }));
};

export const hostname = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

// Deterministic template id from a string seed
export const pickTemplateFromSeed = (seed: string, count: number): number => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % count;
};

// Top scroll progress bar
export const ScrollProgress = () => {
  const [p, setP] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setP(max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className="fixed inset-x-0 top-0 z-40 h-[2px] bg-transparent">
      <div
        className="h-full bg-primary transition-[width] duration-150"
        style={{ width: `${p}%` }}
      />
    </div>
  );
};
