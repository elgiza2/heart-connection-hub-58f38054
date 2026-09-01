import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { m as motion, useInView } from "framer-motion";
import { TemplateProps, splitIntoSections } from "./templateUtils";
import { cn } from "@/lib/utils";

/**
 * Clean editorial reader for a deep-research report, in the app's own theme.
 * Real cover image from search results → the report's own title → lead →
 * flowing plain-text sections (no boxes) with a soft reading light on the
 * section in view. No links inside the body — sources sit behind a button
 * at the very end.
 *
 * Reading typography (Arabic-first): Almarai at ~18px with ~2.05 line-height
 * on a narrow ~42rem measure, no letter-spacing (it breaks Arabic joining),
 * no faux italics, headings in Almarai 800. Latin reports keep the display
 * font with tighter metrics.
 */

const AR_FONT = "'Almarai', 'Noto Serif Arabic', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif";

// Remove inline citation markers like [1] [12], bare-domain citations like
// (liverpoolfc.com) and any URL text — sources are listed at the end only.
const stripCitations = (s: string) =>
  s
    .replace(/\s?\[\s*\d+(?:\s*[,،-]\s*\d+)*\s*\]/g, "")
    .replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]+/g, "")
    .replace(/\((?:source|sources|reference|references|مصدر|المصدر|مرجع|المراجع)\s*\d+(?:\s*[,،-]\s*\d+)*\)/gi, "")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g, "$1")
    .replace(/https?:\/\/[^\s)\]<>\"]+/g, "")
    .replace(/\(\s*(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\.[a-z]{2})?\s*\)/gi, "")
    .replace(/\bwww\.[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s)\]<>"']*)?/gi, "")
    .replace(
      /(?<![\w/.])(?:[a-z0-9-]+\.)+(?:com|org|net|io|gov|edu|info|news|me|tv|co|ai|eg|sa|ae|tr|uk|de|fr)(?:\.[a-z]{2})?(?![\w/])/gi,
      "",
    )
    .replace(/\(\s*\)/g, "");

const imageScore = (url: string, subject: string): number => {
  if (!/^https?:\/\//i.test(url) || /\.svg(?:\?|$)/i.test(url)) return -100;
  const lower = decodeURIComponent(url).toLowerCase();
  if (/(favicon|sprite|logo|avatar|icon|badge|pixel|tracking|emoji|screenshot)/.test(lower)) return -100;
  const terms = subject
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((term) => term.length > 2)
    .slice(0, 10);
  return terms.reduce((score, term) => score + (lower.includes(term) ? 3 : 0), 1);
};

// ---------------------- animated headline ----------------------

const WordsPullUp = ({
  text,
  className = "",
  stagger = 0.04,
  delay = 0,
  dir,
}: {
  text: string;
  className?: string;
  stagger?: number;
  delay?: number;
  dir?: "ltr" | "rtl";
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <span ref={ref} dir={dir} className={`inline-flex flex-wrap gap-x-[0.28em] ${className}`}>
      {words.map((w, i) => (
        <span key={`${w}-${i}`} className="inline-block overflow-hidden pb-[0.12em]">
          <motion.span
            initial={{ y: 26, opacity: 0 }}
            animate={inView ? { y: 0, opacity: 1 } : {}}
            transition={{ duration: 0.65, delay: delay + i * stagger, ease: [0.16, 1, 0.3, 1] }}
            className="inline-block"
          >
            {w}
          </motion.span>
        </span>
      ))}
    </span>
  );
};

// ---------------------- hero cover image ----------------------
// Shows only a REAL image collected from search results. When the research
// run found none, the hero renders text-only — never a random placeholder.

const CoverImage = ({ src, alt, query, isRtl }: { src?: string; alt: string; query: string; isRtl: boolean }) => {
  const [resolvedSrc, setResolvedSrc] = useState(src ?? "");

  useEffect(() => {
    setResolvedSrc(src ?? "");
    if (src) return;

    const controller = new AbortController();
    const findWikipediaImage = async () => {
      const languages = isRtl ? ["ar", "en"] : ["en"];
      for (const language of languages) {
        try {
          const endpoint = new URL(`https://${language}.wikipedia.org/w/api.php`);
          endpoint.search = new URLSearchParams({
            action: "query",
            generator: "search",
            gsrsearch: `${alt} ${query}`.slice(0, 180),
            gsrlimit: "6",
            prop: "pageimages",
            piprop: "original|thumbnail",
            pithumbsize: "1600",
            format: "json",
            origin: "*",
          }).toString();
          const response = await fetch(endpoint, { signal: controller.signal });
          if (!response.ok) continue;
          const payload = (await response.json()) as {
            query?: { pages?: Record<string, { original?: { source?: string }; thumbnail?: { source?: string } }> };
          };
          const pages = Object.values(payload.query?.pages ?? {});
          const image = pages
            .map((page) => page.original?.source ?? page.thumbnail?.source ?? "")
            .find((url) => /^https?:\/\//i.test(url) && !/\.svg(?:\?|$)/i.test(url));
          if (image) {
            setResolvedSrc(image);
            return;
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
        }
      }
    };
    void findWikipediaImage();
    return () => controller.abort();
  }, [alt, isRtl, query, src]);

  const ok = /^https?:\/\//i.test(resolvedSrc) && !/\.svg(\?|$)/i.test(resolvedSrc);
  if (!ok) {
    return <div className="aspect-[16/9] w-full animate-pulse rounded-2xl bg-muted" aria-hidden="true" />;
  }
  return (
    <figure className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl bg-muted ring-1 ring-border/60 shadow-sm">
      <img
        decoding="async"
        src={resolvedSrc}
        alt={alt}
        loading="eager"
        referrerPolicy="no-referrer"
        onError={() => setResolvedSrc("")}
        className="absolute inset-0 h-full w-full object-cover motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700"
      />
      <span className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background/70 to-transparent" aria-hidden="true" />
    </figure>
  );
};

const plainStandfirst = (value: string): string => {
  const cleaned = stripCitations(value)
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>]/g, "")
    .replace(/^\s*(?:الملخص التنفيذي|ملخص|executive summary|summary)\s*[:：-]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 240 ? `${cleaned.slice(0, 237).trimEnd()}…` : cleaned;
};

// ---------------------- markdown renderer (plain text, no links) ----------------------
// Built per-direction: Arabic gets Almarai + airy leading and no italics /
// letter-spacing; Latin keeps the display font and tighter metrics.
// textAlign is set inline ("start") because the app's RTL compatibility
// layer resolves the `text-start` utility against the page root, not the
// report's own direction.

const makeMdComponents = (isRtl: boolean) => {
  const headStyle: CSSProperties = {
    textAlign: "start",
    ...(isRtl ? { fontFamily: AR_FONT } : {}),
  };
  const tracking = isRtl ? "" : "tracking-tight";
  const bodyText = isRtl
    ? "text-[17px] leading-[2.05] sm:text-[18px]"
    : "text-[16.5px] leading-[1.85] sm:text-[17.5px]";

  return {
    h1: ({ node: _n, ...p }: any) => (
      <h3
        dir="auto"
        style={headStyle}
        className={cn("mb-3 mt-9 break-words text-[19px] font-extrabold leading-[1.5] text-foreground", tracking)}
        {...p}
      />
    ),
    h2: ({ node: _n, ...p }: any) => (
      <h3
        dir="auto"
        style={headStyle}
        className={cn("mb-3 mt-9 break-words text-[19px] font-extrabold leading-[1.5] text-foreground", tracking)}
        {...p}
      />
    ),
    h3: ({ node: _n, ...p }: any) => (
      <h4
        dir="auto"
        style={headStyle}
        className="mb-2 mt-7 break-words text-[16.5px] font-bold leading-[1.6] text-foreground"
        {...p}
      />
    ),
    p: ({ node: _n, ...p }: any) => (
      <p dir="auto" className={cn("my-5 break-words text-foreground/90", bodyText)} {...p} />
    ),
    ul: ({ node: _n, ...p }: any) => (
      <ul
        style={{ paddingInlineStart: "1.4rem" }}
        className="my-5 list-disc space-y-2.5 marker:text-primary/70"
        {...p}
      />
    ),
    ol: ({ node: _n, ...p }: any) => (
      <ol
        style={{ paddingInlineStart: "1.4rem" }}
        className="my-5 list-decimal space-y-2.5 marker:font-bold marker:text-primary/80"
        {...p}
      />
    ),
    li: ({ node: _n, ...p }: any) => (
      <li
        dir="auto"
        style={{ paddingInlineStart: "0.3rem" }}
        className={cn("break-words text-foreground/90", bodyText)}
        {...p}
      />
    ),
    strong: ({ node: _n, ...p }: any) => <strong className="font-extrabold text-foreground" {...p} />,
    // Links render as plain text — every source is listed in the sources section.
    a: ({ node: _n, children, ..._p }: any) => <span>{children}</span>,
    blockquote: ({ node: _n, ...p }: any) => (
      <blockquote
        dir="auto"
        style={{ paddingInlineStart: "1rem", textAlign: "start" }}
        className={cn(
          "my-7 border-s-[3px] border-primary/40 text-muted-foreground",
          isRtl ? "text-[16.5px] leading-[2]" : "text-[16px] italic leading-[1.85]",
        )}
        {...p}
      />
    ),
    hr: () => <hr className="my-12 border-border/60" />,
    // Editorial "booktabs" table: no box, no zebra — a strong rule under the
    // header, whisper-thin row separators, and a closing rule at the foot.
    table: ({ node: _n, ...p }: any) => (
      <div className="my-9 overflow-x-auto [-webkit-overflow-scrolling:touch]">
        <table
          className="w-full min-w-[520px] border-collapse text-[13.5px] leading-7 tabular-nums sm:text-[14.5px]"
          {...p}
        />
      </div>
    ),
    thead: ({ node: _n, ...p }: any) => <thead {...p} />,
    tbody: ({ node: _n, ...p }: any) => (
      <tbody
        className="[&_tr:last-child]:border-b-2 [&_tr:last-child]:border-foreground/50"
        {...p}
      />
    ),
    tr: ({ node: _n, ...p }: any) => (
      <tr
        className="border-b border-border/60 transition-colors hover:bg-muted/25"
        {...p}
      />
    ),
    th: ({ node: _n, style, ...p }: any) => (
      <th
        dir="auto"
        style={{ textAlign: "start", textWrap: "balance", ...(isRtl ? { fontFamily: AR_FONT } : {}), ...style }}
        className="border-b-2 border-foreground/60 px-3 pb-3 pt-1 align-bottom text-[12.5px] font-bold leading-6 text-muted-foreground first:ps-0 last:pe-0 sm:text-[13px]"
        {...p}
      />
    ),
    td: ({ node: _n, style, ...p }: any) => (
      <td
        dir="auto"
        style={style}
        className="px-3 py-3.5 align-top leading-8 text-foreground/85 first:ps-0 first:font-semibold first:text-foreground last:pe-0"
        {...p}
      />
    ),
    code: ({ node: _n, inline, className, children, ...p }: any) =>
      inline ? (
        <code
          dir="ltr"
          className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground"
          {...p}
        >
          {children}
        </code>
      ) : (
        <code dir="ltr" className={className} {...p}>
          {children}
        </code>
      ),
    pre: ({ node: _n, ...p }: any) => (
      <pre
        dir="ltr"
        className="my-6 overflow-x-auto rounded-lg border border-border bg-muted/50 p-4 text-left text-[13px] leading-6"
        {...p}
      />
    ),
    img: () => null,
  };
};

// ---------------------- template ----------------------

const ResearchLandingTemplate = ({ data, cleanReport, isRtl }: TemplateProps) => {
  const dir: "ltr" | "rtl" = isRtl ? "rtl" : "ltr";

  const { title: reportTitle, intro, sections } = useMemo(() => splitIntoSections(cleanReport), [cleanReport]);
  const mdComponents = useMemo(() => makeMdComponents(isRtl), [isRtl]);

  // The hero title is the report's own model-written "# title"; the raw user
  // query is only a fallback when a report has no title line.
  const title = reportTitle || data.query;

  // Hero lead: first intro paragraph. The remaining intro opens the body.
  const { lead, restIntro } = useMemo(() => {
    const paras = intro
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter(Boolean);
    const first = paras[0] ?? "";
    const leadText = plainStandfirst(first);
    const rest =
      first.length > 320 ? [first, ...paras.slice(1)].join("\n\n") : paras.slice(1).join("\n\n");
    return { lead: leadText, restIntro: rest };
  }, [intro]);

  // Reading light: track which section is in the reading band.
  const [activeIdx, setActiveIdx] = useState(-1);
  const sectionRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    const els = sectionRefs.current.filter(Boolean) as HTMLElement[];
    if (els.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const idx = Number((e.target as HTMLElement).dataset.idx ?? -1);
            setActiveIdx(idx);
          }
        }
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections.length]);

  const coverSrc = useMemo(() => {
    const reportImages = Array.from(data.report.matchAll(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g)).map(
      (match) => match[1],
    );
    const collectedImages = Array.isArray(data.images) ? data.images : [];
    return [...new Set([...reportImages, ...collectedImages])]
      .map((url) => ({ url, score: imageScore(url, `${title} ${data.query}`) }))
      .filter((item) => item.score > -50)
      .sort((a, b) => b.score - a.score)[0]?.url;
  }, [data.images, data.query, data.report, title]);

  return (
    <article dir={dir} style={isRtl ? { fontFamily: AR_FONT } : undefined} className="bg-background pb-12">
      {/* ------------------------------ hero ------------------------------ */}
      <div className="mx-auto w-full max-w-5xl px-4 pt-24 sm:px-8 sm:pt-28">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto max-w-[46rem]"
        >
          <CoverImage src={coverSrc} alt={title} query={data.query} isRtl={isRtl} />
        </motion.div>

        <header className="mx-auto max-w-[46rem] border-b border-border/70 pb-12 sm:pb-14">
          <div className="mt-9 h-1 w-12 rounded-full bg-primary sm:mt-12" aria-hidden="true" />
          <h1
            dir={dir}
            style={{ textAlign: "start", ...(isRtl ? { fontFamily: AR_FONT } : {}) }}
            className={cn(
              "mt-5 text-[2.25rem] font-extrabold leading-[1.4] text-foreground sm:text-[3.15rem]",
              !isRtl && "leading-[1.2] tracking-tight",
            )}
          >
            <WordsPullUp text={title} dir={dir} />
          </h1>

          {lead && (
            <motion.p
              dir="auto"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                "mt-6 max-w-[42rem] text-foreground/70",
                isRtl ? "text-[17.5px] font-medium leading-[2] sm:text-[19px]" : "text-[17px] font-medium leading-[1.8] sm:text-[19px]",
              )}
            >
              {lead}
            </motion.p>
          )}
        </header>
      </div>

      {/* ------------------------------ body ------------------------------ */}
      <div className="mx-auto w-full max-w-[46rem] px-5 sm:px-6">
        {restIntro && (
          <section data-report-section className="mt-14 pb-4">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {stripCitations(restIntro)}
            </ReactMarkdown>
          </section>
        )}

        {sections.map((sec, i) => {
          const active = i === activeIdx;
          return (
            <section
              key={`${sec.heading}-${i}`}
              data-report-section
              data-idx={i}
              ref={(el) => {
                sectionRefs.current[i] = el;
              }}
               className={cn(
                 "relative mt-16 scroll-mt-24 border-s-2 ps-5 transition-colors duration-500 sm:ps-7",
                 active ? "border-primary" : "border-transparent",
               )}
            >
              <h2
                dir="auto"
                style={{ textAlign: "start", ...(isRtl ? { fontFamily: AR_FONT } : {}) }}
                className={cn(
                   "relative mb-5 text-[23px] font-extrabold leading-[1.55] text-foreground sm:text-[28px]",
                  !isRtl && "tracking-tight",
                )}
              >
                {sec.heading}
              </h2>

              <div className={cn("relative transition-opacity duration-500", active ? "opacity-100" : "opacity-80")}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                  {stripCitations(sec.body)}
                </ReactMarkdown>
              </div>
            </section>
          );
        })}
      </div>
    </article>
  );
};

export default ResearchLandingTemplate;
