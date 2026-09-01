/** @doc Unified empty-state block: icon, title, description and an optional action. */
import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center text-center mx-auto",
        compact ? "gap-2 py-8 px-4 max-w-sm" : "gap-3 py-14 px-6 max-w-md",
        className,
      )}
    >
      {Icon ? (
        <span
          aria-hidden="true"
          className="flex items-center justify-center rounded-2xl border border-border bg-muted/40 size-11"
        >
          <Icon className="size-5 text-muted-foreground" />
        </span>
      ) : null}
      <h3 className={cn("font-medium text-foreground", compact ? "text-sm" : "text-base")}>
        {title}
      </h3>
      {description ? (
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export default EmptyState;
