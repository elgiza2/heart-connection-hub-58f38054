import { m as motion } from "framer-motion";
import { X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  label: string;
  Icon: LucideIcon;
  onClose: () => void;
  children?: ReactNode;
  /** Optional compact tabs/controls rendered inline in the header. */
  headerSlot?: ReactNode;
}

const SPRING = { type: "spring" as const, stiffness: 420, damping: 32, mass: 0.6 };

export default function MobileServicePanel({ label, Icon, onClose, children, headerSlot }: Props) {
  // Unified with desktop `ActiveServicePill`: a thin strip with the service
  // name (blue uppercase) + a small X. Body / headerSlot render quietly below
  // when the active chip has options (Slides, Media, Deep Research…).
  void Icon;
  return (
    <motion.div
      data-testid="mobile-service-panel"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 2 }}
      transition={SPRING}
      className="md:hidden mx-3 mb-2 relative z-30 rounded-2xl border border-foreground/10 shadow-xl p-2"
      style={{ background: "hsl(var(--background))" }}
    >
      <div
        className="flex h-7 w-full items-center justify-between gap-2 px-2 text-[12px] font-semibold uppercase tracking-[0.08em]"
        style={{
          color: "var(--megsy-blue)",
          borderBottom: "1px solid hsl(var(--foreground) / 0.08)",
        }}
      >
        <span className="truncate">{label}</span>
        <button
          type="button"
          aria-label={`Close ${label}`}
          onClick={onClose}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-foreground/10"
          style={{ color: "var(--megsy-blue)" }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {headerSlot ? (
        <div className="mt-2 flex justify-center overflow-x-auto no-scrollbar px-1">
          {headerSlot}
        </div>
      ) : null}
      {children ? (
        <div className="mt-2 flex flex-col gap-2.5 px-1">{children}</div>
      ) : null}
    </motion.div>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel?: string;
}

export function ServiceSegmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="relative inline-flex items-center gap-0.5 p-0.5 rounded-full"
      style={{ background: "hsl(var(--foreground) / 0.08)" }}
    >
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            className="relative h-6 px-3 inline-flex items-center justify-center rounded-full text-[11.5px] font-semibold tracking-tight transition-colors whitespace-nowrap"
          >
            {active && (
              <motion.span
                layoutId={`svc-seg-${ariaLabel ?? "panel"}`}
                transition={{ type: "spring", stiffness: 460, damping: 34 }}
                className="absolute inset-0 rounded-full"
                style={{ background: "hsl(var(--foreground) / 0.18)" }}
              />
            )}
            <span
              className={`relative z-10 transition-colors ${active ? "text-foreground font-semibold" : "text-foreground/55 hover:text-foreground/85"}`}
            >
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface RowProps {
  label: string;
  value?: string;
  onClick: () => void;
  trailing?: ReactNode;
}

export function ServiceRow({ label, value, onClick, trailing }: RowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full h-11 flex items-center justify-between px-4 rounded-full border border-foreground/12 text-foreground active:scale-[0.98] transition-transform"
      style={{
        background: "hsl(var(--foreground) / 0.07)",
        backdropFilter: "blur(16px) saturate(170%)",
        WebkitBackdropFilter: "blur(16px) saturate(170%)",
        boxShadow: "inset 1px 1px 1px 0 hsl(var(--foreground) / 0.18)",
      }}
    >
      <span className="text-[13px] font-semibold">{label}</span>
      <span className="flex items-center gap-1.5 text-foreground/55 text-[12px] font-medium">
        {value && <span className="truncate max-w-[160px]">{value}</span>}
        {trailing}
      </span>
    </button>
  );
}
