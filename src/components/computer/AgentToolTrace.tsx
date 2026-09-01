import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Code2,
  FileText,
  Globe,
  ListChecks,
  Plug,
  Search,
  Sparkles,
  Terminal,
} from "lucide-react";
import type { LongRunEvent } from "@/lib/longrun/types";

/** Icon + label per event kind, so a trace line reads like a tool card. */
function kindOf(e: LongRunEvent) {
  const t = (e.type || "").toLowerCase();
  const title = (e.title || "").toLowerCase();
  if (t === "error") return { Icon: AlertTriangle, tone: "text-destructive" };
  if (t === "plan") return { Icon: ListChecks, tone: "text-[var(--megsy-blue,#3b82f6)]" };
  if (t === "review" || title.includes("براجع")) return { Icon: Sparkles, tone: "text-amber-500" };
  if (t === "done") return { Icon: Check, tone: "text-emerald-500" };
  if (title.includes("بحث") || title.includes("search")) return { Icon: Search, tone: "text-muted-foreground" };
  if (title.includes("كود") || title.includes("code")) return { Icon: Code2, tone: "text-muted-foreground" };
  if (title.includes("ملف") || title.includes("file")) return { Icon: FileText, tone: "text-muted-foreground" };
  if (title.includes("mcp")) return { Icon: Plug, tone: "text-muted-foreground" };
  if (title.includes("browser") || title.includes("متصفح")) return { Icon: Globe, tone: "text-muted-foreground" };
  if (t === "tool") return { Icon: Terminal, tone: "text-muted-foreground" };
  return { Icon: ChevronRight, tone: "text-muted-foreground" };
}

/** One collapsible trace row: title always visible, output on demand. */
function Row({ event }: { event: LongRunEvent }) {
  const [open, setOpen] = useState(false);
  const { Icon, tone } = kindOf(event);
  const detail = event.detail?.trim() || "";
  const long = detail.length > 90;

  return (
    <div className="flex items-start gap-2">
      <Icon className={`mt-[3px] h-3.5 w-3.5 shrink-0 ${tone}`} />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          disabled={!detail}
          onClick={() => setOpen((v) => !v)}
          className="w-full text-start text-[12.5px] leading-relaxed text-muted-foreground transition-colors enabled:hover:text-foreground"
        >
          {event.title}
          {detail && !long && !open ? ` — ${detail}` : ""}
          {long && !open ? ` — ${detail.slice(0, 90)}…` : ""}
        </button>
        {open && detail && (
          <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-foreground/[0.05] p-2 font-mono text-[11.5px] leading-relaxed text-muted-foreground">
            {detail}
          </pre>
        )}
      </div>
    </div>
  );
}

export function AgentToolTrace({
  events,
  fallback = [],
}: {
  events: LongRunEvent[];
  fallback?: string[];
}) {
  if (!events.length) {
    return (
      <div className="flex flex-col gap-2 border-s border-border/40 ps-3">
        {fallback.map((line, i) => (
          <div key={i} className="text-[12.5px] leading-relaxed text-muted-foreground">
            {line}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 border-s border-border/40 ps-3">
      {events.map((e) => (
        <Row key={e.id} event={e} />
      ))}
    </div>
  );
}

export default AgentToolTrace;
