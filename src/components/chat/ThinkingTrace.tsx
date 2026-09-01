import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  FileText,
  Globe,
  Image as ImageIcon,
  Plug,
  Search,
  Terminal,
} from "lucide-react";
import MegsyStar from "@/components/branding/MegsyStar";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { t as uiT, useUserLang } from "@/lib/authI18n";

export interface ThinkingTraceProps {
  /** Live status line — always the real current operation, never a placeholder. */
  status?: string;
  /** Ordered narration steps (deep research, tools, slides, media…). */
  steps?: string[];
  /** Raw reasoning tokens from the model. */
  text?: string;
  /** True while the turn is still running. */
  active?: boolean;
  /**
   * True only while a tool call is really executing. The Megsy star animates
   * exclusively during that window — never before the tool starts and never
   * after it settles.
   */
  running?: boolean;
  /** Real tool family currently executing — drives the row icon. */
  tool?: string | null;
  /** Start expanded (rarely needed — collapsed is the default look). */
  defaultOpen?: boolean;
  className?: string;
}

const RTL_LANGS = new Set(["ar", "ar-eg", "fa", "he"]);

/** Existing icon set, mapped onto the real tool that is running. */
const TOOL_ICONS: Record<string, typeof Globe> = {
  browser: Globe,
  code: Terminal,
  files: FileText,
  mcp: Plug,
  integration: Plug,
  search: Search,
  image: ImageIcon,
};

/**
 * The single "AI thinking" surface used across chat, deep research, slides,
 * media and tool turns. Borderless, quiet grey, collapsible — the Megsy star
 * stays as the marker of the row. The headline is always a real backend signal
 * (activity events, tool calls, reasoning); there is no timed or rotating
 * placeholder, so a quiet moment shows the last real operation instead of a
 * fabricated one.
 */
const ThinkingTrace = ({
  status,
  steps,
  text,
  active,
  running,
  tool,
  defaultOpen,
  className = "",
}: ThinkingTraceProps) => {

  const lang = useUserLang();
  const [open, setOpen] = useState(!!defaultOpen);
  const rtl = RTL_LANGS.has(lang);
  const isAr = lang.startsWith("ar");

  // Keep every distinct line we ever saw this turn, so expanding the badge
  // always shows the real trace instead of an empty panel.
  const historyRef = useRef<string[]>([]);
  const [, forceRender] = useState(0);
  useEffect(() => {
    const incoming: string[] = [];
    for (const s of steps || []) {
      const v = String(s || "").trim();
      if (v) incoming.push(v);
    }
    const st = String(status || "").trim();
    if (st) incoming.push(st);
    let changed = false;
    for (const line of incoming) {
      const h = historyRef.current;
      if (h[h.length - 1] !== line && !h.includes(line)) {
        h.push(line);
        changed = true;
      }
    }
    if (historyRef.current.length > 60) {
      historyRef.current = historyRef.current.slice(-60);
      changed = true;
    }
    if (changed) forceRender((n) => n + 1);
  }, [steps, status]);

  // No elapsed-seconds counter in the UI — the trace shows real activity only.

  const reasoningLines = useMemo(() => {
    if (!text?.trim()) return [] as string[];
    const out: string[] = [];
    for (const p of text.trim().split(/\n{2,}|\n/)) {
      const v = p.trim();
      if (v && out[out.length - 1] !== v) out.push(v);
    }
    return out;
  }, [text]);

  const lines = useMemo(
    () => [...historyRef.current, ...reasoningLines],
    // historyRef mutations are surfaced through forceRender
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reasoningLines, historyRef.current.length],
  );

  const hasBody = lines.length > 0;
  const label = active ? uiT("thinking", lang) : uiT("thoughts", lang);

  // Live headline: newest real signal wins. With no signal yet we keep the
  // neutral label instead of inventing progress.
  const headline = useMemo(() => {
    if (!active) return label;
    const live =
      String(status || "").trim() ||
      historyRef.current[historyRef.current.length - 1] ||
      reasoningLines[reasoningLines.length - 1] ||
      "";
    if (live) return live.length > 90 ? `${live.slice(0, 90)}…` : live;
    return label;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, status, label, reasoningLines, historyRef.current.length]);

  const ToolIcon = tool ? TOOL_ICONS[tool] : undefined;

  // Nothing to show at all.
  if (!hasBody && !active) return null;

  return (
    <div className={`mb-3 ${className}`} dir={rtl ? "rtl" : undefined}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 py-0.5 text-start"
      >
        {active ? (
          ToolIcon ? (
            <ToolIcon
              className={`h-3.5 w-3.5 shrink-0 text-[var(--megsy-blue)] ${
                running ? "motion-safe:animate-pulse" : ""
              }`}
            />
          ) : (
            <MegsyStar
              className={`h-3.5 w-3.5 shrink-0 text-[var(--megsy-blue)] ${
                running ? "motion-safe:animate-pulse" : ""
              }`}
            />
          )
        ) : (
          <BrandLogo className="h-3.5 w-3.5 shrink-0" />
        )}

        <span
          className={`truncate text-[13px] ${

            active ? "ai-shimmer font-medium motion-reduce:animate-none" : "text-muted-foreground"
          }`}
          aria-live="polite"
        >
          {headline}
        </span>
        <span className="ms-auto grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {open && (
        <div className="mt-1.5 max-h-80 overflow-y-auto">
          <div className="border-s border-border/40 ps-3 flex flex-col gap-2">
            {hasBody ? (
              lines.map((line, i) => (
                <div
                  key={`${i}-${line.slice(0, 24)}`}
                  className="text-[12.5px] leading-relaxed text-muted-foreground whitespace-pre-wrap"
                >
                  {line}
                </div>
              ))
            ) : (
              <div className="text-[12.5px] text-muted-foreground">
                {isAr ? "لا توجد تفاصيل بعد…" : "No details yet…"}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(ThinkingTrace);
