import { useState } from "react";
import { ChevronDown, Check, AlertCircle, Loader2, ShieldAlert, Download } from "lucide-react";
import type { ToolPart } from "@/pages/chat/chatConstants";
import { isSensitiveTool } from "@/pages/chat/hitl/sensitiveTools";
import { getHitlDecision, setHitlDecision } from "@/pages/chat/hitl/hitlStorage";
import { trackChatInteraction } from "@/pages/chat/services/trackInteraction";
import { extractSources, SourcesList } from "./SourcesList";
import {
  describeArgs,
  describeResult,
  extractFiles,
  extractImages,
  getToolMeta,
  isArabicUI,
  readableBody,
  safeStringifyTool,
} from "./toolPresentation";

const SEARCH_TOOL_PATTERN = /(search|browse|fetch_url|web|serp|scrape)/i;

/**
 * Compact, collapsible card that surfaces a single tool invocation.
 *
 * Collapsed it reads like a sentence — icon + what the tool is + what it did —
 * so the transcript stays scannable. Expanded it shows a human-readable
 * result: source list, image previews, downloadable files, then raw payload
 * only as a last resort.
 */
export function ToolCard({ part, userId }: { part: ToolPart; userId?: string | null }) {
  const [open, setOpen] = useState(false);
  const ar = isArabicUI();
  const sensitive = isSensitiveTool(part.name);
  const initialDecision = sensitive ? getHitlDecision(userId, part.name) : "approved";
  const [decision, setDecision] = useState<"approved" | "denied" | null>(initialDecision);
  const needsApproval = sensitive && decision === null && part.result !== undefined;
  const denied = decision === "denied";

  const meta = getToolMeta(part.name, part.appSlug);
  const Icon = meta.icon;
  const running = part.state === "running";
  const failed = part.state === "error";

  const inputHint = part.target || describeArgs(part.args);
  const summary = running
    ? ar
      ? "جارٍ التنفيذ…"
      : "Working…"
    : failed
      ? ar
        ? "فشلت العملية"
        : "Failed"
      : describeResult(part.result);

  const images = !denied ? extractImages(part.result) : [];
  const files = !denied ? extractFiles(part.result).filter((f) => !images.includes(f)) : [];
  const sources = SEARCH_TOOL_PATTERN.test(part.name) ? extractSources(part.result) : [];

  const StatusIcon = needsApproval ? ShieldAlert : running ? Loader2 : failed ? AlertCircle : Check;
  const statusColor = needsApproval
    ? "text-amber-400"
    : running
      ? "text-primary"
      : failed
        ? "text-destructive"
        : "text-emerald-500";

  return (
    <div
      className={`my-2 w-full max-w-[640px] overflow-hidden rounded-2xl border text-[13px] ${
        needsApproval
          ? "border-amber-400/40 bg-amber-500/5"
          : failed
            ? "border-destructive/30 bg-destructive/5"
            : "border-foreground/10 bg-foreground/[0.04]"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-start transition-colors hover:bg-foreground/5"
        aria-expanded={open}
      >
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-background/60 ${meta.tint}`}
        >
          <Icon className="h-4 w-4" strokeWidth={1.9} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-semibold text-foreground">{meta.label}</span>
            {inputHint && (
              <span className="truncate text-[12px] text-muted-foreground">· {inputHint}</span>
            )}
          </span>
          {summary && (
            <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
              {summary}
            </span>
          )}
        </span>
        {needsApproval && (
          <span className="shrink-0 rounded-md border border-amber-400/30 bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
            {ar ? "تحتاج موافقة" : "Needs approval"}
          </span>
        )}
        <StatusIcon
          className={`h-4 w-4 shrink-0 ${statusColor} ${running ? "animate-spin" : ""}`}
          strokeWidth={2}
        />
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={1.8}
        />
      </button>

      {needsApproval && (
        <div className="flex items-center gap-2 border-t border-amber-400/20 bg-amber-400/5 px-3 py-2 text-[12px]">
          <span className="flex-1 text-amber-200/90">
            {ar
              ? "هذه الأداة حساسة. وافق لعرض النتيجة (سنحفظ اختيارك)."
              : "This tool is sensitive. Approve execution to see the result."}
          </span>
          <button
            type="button"
            onClick={() => {
              setHitlDecision(userId, part.name, "denied");
              setDecision("denied");
              trackChatInteraction("tool_denied", { userId, metadata: { tool: part.name } });
            }}
            className="rounded-md px-2 py-1 text-muted-foreground hover:bg-foreground/5"
          >
            {ar ? "رفض" : "Reject"}
          </button>
          <button
            type="button"
            onClick={() => {
              setHitlDecision(userId, part.name, "approved");
              setDecision("approved");
              trackChatInteraction("tool_approved", { userId, metadata: { tool: part.name } });
            }}
            className="rounded-md bg-emerald-500/20 px-2 py-1 text-emerald-200 hover:bg-emerald-500/30"
          >
            {ar ? "موافقة" : "Approve"}
          </button>
        </div>
      )}

      {open && !needsApproval && (
        <div className="space-y-3 border-t border-foreground/5 px-3 pb-3 pt-2.5">
          {sources.length > 0 && <SourcesList sources={sources} />}

          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {images.map((src) => (
                <a
                  key={src}
                  href={src}
                  target="_blank"
                  rel="noreferrer"
                  className="overflow-hidden rounded-xl border border-foreground/10"
                >
                  <img src={src} alt="" loading="lazy" className="h-24 w-full object-cover" />
                </a>
              ))}
            </div>
          )}

          {files.length > 0 && (
            <div className="space-y-1.5">
              {files.map((href) => (
                <a
                  key={href}
                  href={href}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-foreground/10 bg-background/40 px-2.5 py-2 text-[12px] hover:bg-foreground/5"
                >
                  <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{decodeURIComponent(href.split("/").pop() || href)}</span>
                </a>
              ))}
            </div>
          )}

          {part.result !== undefined && !denied && sources.length === 0 && images.length === 0 && (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-background/40 p-2.5 text-[12px] leading-relaxed text-foreground/85">
              {readableBody(part.result)}
            </pre>
          )}

          {part.args !== undefined && (
            <details className="group">
              <summary className="cursor-pointer text-[11px] uppercase tracking-wide text-muted-foreground">
                {ar ? "المُدخلات" : "Input"}
              </summary>
              <pre
                dir="ltr"
                className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-background/40 p-2 text-[11px] text-foreground/70"
              >
                {safeStringifyTool(part.args)}
              </pre>
            </details>
          )}

          {denied && (
            <div className="text-[12px] text-destructive/90">
              {ar ? "تم رفض عرض نتيجة هذه الأداة." : "Showing this tool's result was rejected."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
