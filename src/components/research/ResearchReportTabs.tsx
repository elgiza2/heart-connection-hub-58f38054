import { useState } from "react";
import { ArrowUpRight, ChevronDown, Link2 } from "lucide-react";
import { SourceItem, hostname } from "./templateUtils";
import { cn } from "@/lib/utils";

/**
 * Sources live behind a single clean button at the end of the report.
 * Expands inline into a tidy list: favicon, page title, host.
 */

const favicon = (u: string) =>
  `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname(u))}&sz=64`;

interface Props {
  reportSources: SourceItem[];
  isRtl: boolean;
}

const ResearchReportTabs = ({ reportSources, isRtl }: Props) => {
  const [open, setOpen] = useState(false);
  if (!reportSources || reportSources.length === 0) return null;

  return (
    <section dir={isRtl ? "rtl" : "ltr"} className="mx-auto w-full max-w-3xl px-5 pb-28 sm:px-6">
      <div className="mt-16 flex justify-center border-t border-border/70 pt-10">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="group inline-flex items-center gap-2.5 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-foreground shadow-sm backdrop-blur transition hover:border-primary/40 hover:bg-accent/60"
        >
          <Link2 className="h-4 w-4 text-primary" />
          {isRtl ? "المصادر" : "Sources"}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-300",
              open && "rotate-180",
            )}
          />
        </button>
      </div>

      {/* smooth expand via grid-rows trick */}
      <div
        className={cn(
          "grid transition-all duration-500 ease-out",
          open ? "mt-4 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <ul className="space-y-1">
            {reportSources.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/60"
                >
                  <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border/60">
                    <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <img
                      src={favicon(s.url)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {s.title || hostname(s.url)}
                    </span>
                    <span
                      style={{ textAlign: "start" }}
                      className="block truncate text-xs text-muted-foreground"
                    >
                      {hostname(s.url)}
                    </span>
                  </span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-foreground" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};

export default ResearchReportTabs;
