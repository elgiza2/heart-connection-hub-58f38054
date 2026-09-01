import { useEffect, useState } from "react";
import { AlertTriangle, Sparkles, Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useCredits } from "@/hooks/useCredits";
import { cn } from "@/lib/utils";

interface CostEstimateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Estimated cost in credits. */
  estimatedCost: number;
  /** Human-readable operation label. */
  operation: string;
  /** Reason this operation is expensive. */
  reason?: string;
  /** Unique key for "do not ask again" preference. */
  suppressKey: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

const SUPPRESS_PREFIX = "cost-estimate-suppress:";

/** Static helper — check outside the component if user has suppressed this dialog. */
export function isCostDialogSuppressed(suppressKey: string): boolean {
  try {
    return localStorage.getItem(SUPPRESS_PREFIX + suppressKey) === "1";
  } catch {
    return false;
  }
}

/**
 * Modal shown before expensive operations (deep research ultra8x, long videos,
 * large slide decks). Displays estimated cost, current balance, and a
 * "don't ask again" checkbox scoped per-operation.
 */
export function CostEstimateDialog({
  open,
  onOpenChange,
  estimatedCost,
  operation,
  reason,
  suppressKey,
  onConfirm,
  onCancel,
}: CostEstimateDialogProps) {
  const { credits, isPaid, loading } = useCredits();
  const [suppress, setSuppress] = useState(false);

  useEffect(() => {
    if (open) setSuppress(false);
  }, [open]);

  const enough = isPaid || (credits ?? 0) >= estimatedCost;
  const remaining = credits === null ? null : Math.max(0, credits - estimatedCost);

  const confirm = () => {
    if (suppress) {
      try {
        localStorage.setItem(SUPPRESS_PREFIX + suppressKey, "1");
      } catch {
        /* ignore */
      }
    }
    onOpenChange(false);
    onConfirm();
  };

  const cancel = () => {
    onOpenChange(false);
    onCancel?.();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : cancel())}>
      <DialogContent className="sm:max-w-[420px] bg-background/85 backdrop-blur-xl border-foreground/10">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/30">
              <Zap className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="text-left">
              <DialogTitle className="text-foreground text-base">Confirm operation</DialogTitle>
              <DialogDescription className="text-foreground/60 text-xs">
                {operation}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Cost row */}
          <div className="flex items-center justify-between rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5">
            <span className="text-xs text-foreground/60">Estimated cost</span>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-400 tabular-nums">
              <Sparkles className="h-3.5 w-3.5" />
              {estimatedCost.toLocaleString()}
            </span>
          </div>

          {/* Balance row */}
          <div className="flex items-center justify-between rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5">
            <span className="text-xs text-foreground/60">Current balance</span>
            <span
              className={cn(
                "text-sm font-semibold tabular-nums",
                loading ? "text-foreground/65" : enough ? "text-foreground/90" : "text-red-400",
              )}
            >
              {isPaid
                ? "Paid plan"
                : loading || credits === null
                  ? "…"
                  : credits.toLocaleString()}
            </span>
          </div>

          {/* Remaining preview */}
          {!isPaid && remaining !== null && (
            <div className="flex items-center justify-between px-3.5 text-[11px] text-foreground/50">
              <span>After this operation</span>
              <span className="tabular-nums">{remaining.toLocaleString()} credits</span>
            </div>
          )}

          {reason && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11.5px] text-amber-200/90 leading-relaxed">{reason}</p>
            </div>
          )}

          {!enough && !loading && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-[11.5px] text-red-300">
              You don't have enough credits. Upgrade to Pro or top up to continue.
            </div>
          )}

          {/* Don't ask again */}
          <label className="flex items-center gap-2 px-1 pt-1 cursor-pointer select-none">
            <Checkbox
              checked={suppress}
              onCheckedChange={(v) => setSuppress(Boolean(v))}
              className="border-foreground/20 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
            />
            <span className="text-[11px] text-foreground/60">Don't ask me again for this</span>
          </label>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            onClick={cancel}
            className="flex-1 sm:flex-none text-foreground/70 hover:text-foreground hover:bg-foreground/5"
          >
            Cancel
          </Button>
          <Button
            onClick={confirm}
            disabled={!enough || loading}
            className={cn(
              "flex-1 sm:flex-none bg-emerald-500 text-background hover:bg-emerald-400 font-semibold",
              "shadow-[0_0_24px_-6px_rgba(80,200,120,0.65)]",
            )}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CostEstimateDialog;
