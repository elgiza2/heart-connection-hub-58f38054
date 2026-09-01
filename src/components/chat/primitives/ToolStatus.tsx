/** @doc Unified loading / status / stage primitives shared by every tool card (docs, slides, media, research, coder). */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Inline spinner + label — the single loading style for all tool cards. */
export function ToolLoader({
  label,
  className,
}: {
  label?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-2 text-[12px] text-muted-foreground", className)}
      role="status"
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current opacity-60" aria-hidden />
      {label}
    </span>
  );
}

/** Pulsing dot + label — used in card headers while a job is streaming. */
export function ToolPulse({ label, className }: { label?: ReactNode; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-[11px] text-muted-foreground", className)}
      role="status"
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current opacity-60" aria-hidden />
      {label}
    </span>
  );
}

export type ToolStatus = "idle" | "running" | "done" | "error";

/** Unified trailing status badge for tool card headers. */
export function ToolStatusBadge({
  status,
  runningLabel,
  doneLabel,
  errorLabel,
  className,
}: {
  status: ToolStatus;
  runningLabel?: ReactNode;
  doneLabel?: ReactNode;
  errorLabel?: ReactNode;
  className?: string;
}) {
  if (status === "running") return <ToolPulse label={runningLabel} className={className} />;
  if (status === "done")
    return (
      <span
        className={cn("text-[11px] text-emerald-500", className)}
      >
        {doneLabel}
      </span>
    );
  if (status === "error")
    return (
      <span
        className={cn("text-[11px] text-destructive", className)}
      >
        {errorLabel}
      </span>
    );
  return null;
}

export interface ToolStage {
  key: string;
  label: ReactNode;
}

/** Unified stage stepper chips (plan → research → review …). */
export function ToolStages({
  stages,
  active,
  onSelect,
  className,
}: {
  stages: ToolStage[];
  active: string;
  onSelect?: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-center gap-2 text-[11px]", className)}>
      {stages.map((s) => {
        const isActive = s.key === active;
        const Tag = onSelect ? "button" : "span";
        return (
          <Tag
            key={s.key}
            {...(onSelect ? { type: "button" as const, onClick: () => onSelect(s.key) } : {})}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 transition-colors",
              isActive
                ? "border-primary/50 bg-primary/10 text-foreground"
                : "border-border/40 text-muted-foreground",
            )}
          >
            {s.label}
          </Tag>
        );
      })}
    </div>
  );
}

export default ToolLoader;
