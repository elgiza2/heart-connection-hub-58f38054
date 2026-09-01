/** @doc Unified status pill for tool cards (running/done/error) — replaces ad-hoc chip styling. */
import { Check, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToolStatus = "running" | "done" | "error" | "idle";

interface StatusBadgeProps {
  status: ToolStatus;
  label?: string;
  className?: string;
  size?: "sm" | "md";
}

const StatusBadge = ({ status, label, className, size = "sm" }: StatusBadgeProps) => {
  const icon =
    status === "done" ? (
      <Check className={size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} />
    ) : status === "error" ? (
      <AlertCircle className={size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} />
    ) : status === "running" ? (
      <Loader2 className={cn(size === "md" ? "h-3.5 w-3.5" : "h-3 w-3", "animate-spin")} />
    ) : null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        size === "md" ? "px-2 py-0.5 text-[11px]" : "px-1.5 h-5 text-[10px]",
        !label && (size === "md" ? "min-w-6 justify-center" : "min-w-5 justify-center"),
        status === "done" && "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
        status === "error" && "bg-destructive/12 text-destructive",
        status === "running" && "bg-primary/12 text-primary",
        status === "idle" && "bg-muted/60 text-muted-foreground",
        className,
      )}
    >
      {icon}
      {label && <span className="truncate">{label}</span>}
    </span>
  );
};

export default StatusBadge;
