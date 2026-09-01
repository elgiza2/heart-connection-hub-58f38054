/** @doc Shared glass-card shell for all in-chat tool result cards. Provides unified radius, blur, padding and header slots so cards feel like one system. */
import { forwardRef, type ReactNode } from "react";
import { m as motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ToolCardProps {
  /** Deprecated — the unified card design is icon-free; this slot is ignored. */
  icon?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  footer?: ReactNode;
  dir?: "ltr" | "rtl";
  className?: string;
  children?: ReactNode;
  tone?: "default" | "muted";
}

const ToolCard = forwardRef<HTMLDivElement, ToolCardProps>(function ToolCard(
  { title, subtitle, trailing, footer, dir, className, children, tone = "default" },
  ref,
) {
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      dir={dir}
      className={cn(
        "my-2 w-full max-w-[640px] rounded-ios-lg border border-border/50 p-4 text-card-foreground",
        "bg-card/80 backdrop-blur-xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.15)] dark:bg-card/60 dark:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_8px_24px_-12px_rgba(0,0,0,0.5)]",
        tone === "muted" && "bg-card/60",
        className,
      )}
    >
      {(title || subtitle || trailing) && (
        <div className="mb-3 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {title && <div className="truncate text-sm font-semibold leading-tight">{title}</div>}
            {subtitle && (
              <div className="mt-0.5 text-[11px] text-muted-foreground truncate">{subtitle}</div>
            )}
          </div>
          {trailing && <div className="shrink-0">{trailing}</div>}
        </div>
      )}
      {children}
      {footer && <div className="mt-3">{footer}</div>}
    </motion.div>
  );
});

export default ToolCard;
