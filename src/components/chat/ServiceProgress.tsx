import { Check, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProgressStepState = "pending" | "active" | "done" | "error";

export interface ProgressStep {
  id: string;
  label: string;
  state: ProgressStepState;
  detail?: string;
}

interface ServiceProgressProps {
  steps: ProgressStep[];
  /** Overall percentage 0-100 (optional; derived from done/total if omitted). */
  percent?: number;
  /** Accent color: emerald (default), primary (violet), sky, amber. */
  accent?: "emerald" | "primary" | "sky" | "amber";
  className?: string;
  compact?: boolean;
}

const ACCENT: Record<NonNullable<ServiceProgressProps["accent"]>, string> = {
  emerald: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30",
  primary: "text-violet-400 bg-violet-500/15 border-violet-500/30",
  sky: "text-sky-400 bg-sky-500/15 border-sky-500/30",
  amber: "text-amber-400 bg-amber-500/15 border-amber-500/30",
};

const ACCENT_BAR: Record<NonNullable<ServiceProgressProps["accent"]>, string> = {
  emerald: "from-emerald-500 to-emerald-400",
  primary: "from-violet-500 to-violet-400",
  sky: "from-sky-500 to-sky-400",
  amber: "from-amber-500 to-amber-400",
};

/**
 * Unified progress display for long-running services (research, slides, docs, video).
 * Shows step-by-step visual states with an accent bar. RTL-safe via flex/gap.
 */
export function ServiceProgress({
  steps,
  percent,
  accent = "primary",
  className,
  compact = false,
}: ServiceProgressProps) {
  const totalDone = steps.filter((s) => s.state === "done").length;
  const total = steps.length || 1;
  const computedPct = percent ?? Math.round((totalDone / total) * 100);
  const hasError = steps.some((s) => s.state === "error");

  return (
    <div
      className={cn(
        "rounded-2xl border border-foreground/10 bg-background/40 backdrop-blur-sm p-3",
        className,
      )}
    >
      {/* Top bar */}
      <div className="mb-3 flex items-center gap-3">
        <div className="flex-1 h-1.5 rounded-full bg-foreground/5 overflow-hidden">
          <div
            className={cn(
              "h-full bg-gradient-to-r transition-[width] duration-500 ease-out",
              ACCENT_BAR[accent],
              hasError && "from-red-500 to-red-400",
            )}
            style={{ width: `${computedPct}%` }}
          />
        </div>
        <span className="text-[11px] tabular-nums text-foreground/60 min-w-[3ch] text-end">
          {computedPct}%
        </span>
      </div>

      {/* Steps */}
      <ul className={cn("space-y-1.5", compact && "space-y-1")}>
        {steps.map((step) => (
          <li
            key={step.id}
            className={cn(
              "flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors",
              step.state === "active" && "bg-foreground/[0.04]",
            )}
          >
            <span
              className={cn(
                "mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border shrink-0",
                step.state === "done" && ACCENT[accent],
                step.state === "active" && ACCENT[accent],
                step.state === "pending" && "border-foreground/15 bg-foreground/[0.03] text-foreground/65",
                step.state === "error" && "border-red-500/40 bg-red-500/15 text-red-400",
              )}
            >
              {step.state === "done" && <Check className="h-3 w-3" strokeWidth={3} />}
              {step.state === "active" && <Loader2 className="h-3 w-3 animate-spin" />}
              {step.state === "error" && <AlertCircle className="h-3 w-3" />}
              {step.state === "pending" && (
                <span className="h-1.5 w-1.5 rounded-full bg-foreground/30" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "text-xs font-medium leading-5",
                  step.state === "pending" && "text-foreground/65",
                  step.state !== "pending" && "text-foreground/85",
                  step.state === "error" && "text-red-300",
                )}
              >
                {step.label}
              </div>
              {step.detail && step.state !== "pending" && (
                <div className="text-[11px] text-foreground/50 leading-4 mt-0.5 truncate">
                  {step.detail}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ServiceProgress;
