/** @doc Clean SaaS primitives for the desktop settings shell. */
import { ReactNode, InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Check, Loader2 } from "lucide-react";

/* ---------- Layout ---------- */

export function CleanStack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-6", className)}>{children}</div>;
}

export function CleanCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-foreground/10 bg-foreground/[0.05] backdrop-blur-xl text-foreground shadow-[0_20px_60px_-30px_rgba(0,0,0,0.7)]",
        className,
      )}
    >
      {(title || description || action) && (
        <header className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-foreground/10">
          <div className="min-w-0">
            {title && (
              <h3 className="font-display text-[15px] font-bold tracking-tight text-foreground">
                {title}
              </h3>
            )}
            {description && (
              <p className="mt-1 text-[12.5px] text-foreground/60 leading-relaxed">
                {description}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className="px-6 py-5 space-y-5">{children}</div>
    </section>
  );
}

export function CleanField({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-[12px] font-semibold text-foreground/90 tracking-tight"
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-[11.5px] text-foreground/55">{hint}</p>}
    </div>
  );
}

/* ---------- Inputs ---------- */

const inputCls =
  "w-full h-10 px-3.5 rounded-lg border border-foreground/12 bg-foreground/[0.06] text-[13.5px] text-foreground placeholder:text-foreground/65 outline-none transition-colors focus:border-foreground/40 focus:bg-foreground/[0.09]";

export function CleanInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputCls, props.className)} />;
}

export function CleanTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        inputCls,
        "h-auto py-2.5 leading-relaxed resize-y min-h-[80px]",
        props.className,
      )}
    />
  );
}

/* ---------- Choice / Segmented ---------- */

export function CleanChoice<T extends string>({
  options,
  value,
  onChange,
  columns = 3,
}: {
  options: { id: T; label: string; description?: string; disabled?: boolean; badge?: string }[];
  value: T;
  onChange: (v: T) => void;
  columns?: 2 | 3 | 4;
}) {
  const cols = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" }[columns];
  return (
    <div className={cn("grid gap-2", cols)}>
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            disabled={opt.disabled}
            onClick={() => onChange(opt.id)}
            className={cn(
              "relative text-left rounded-lg border px-3.5 py-3 transition-colors",
              active
                ? "border-primary bg-primary/5"
                : "border-border bg-background hover:border-foreground/20 hover:bg-accent/40",
              opt.disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  "text-[13px] font-semibold",
                  active ? "text-primary" : "text-foreground",
                )}
              >
                {opt.label}
              </span>
              {active && <Check className="w-3.5 h-3.5 text-primary" strokeWidth={3} />}
              {!active && opt.badge && (
                <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                  {opt.badge}
                </span>
              )}
            </div>
            {opt.description && (
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">{opt.description}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Slider ---------- */

export function CleanSlider({
  label,
  leftLabel,
  rightLabel,
  value,
  onChange,
}: {
  label: string;
  leftLabel: string;
  rightLabel: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-foreground">{label}</span>
        <span className="text-[11.5px] text-muted-foreground tabular-nums">{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full bg-muted appearance-none cursor-pointer accent-primary
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary
          [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background
          [&::-webkit-slider-thumb]:shadow-md"
      />
      <div className="flex items-center justify-between text-[10.5px] text-muted-foreground">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}

/* ---------- Row (list item with trailing control) ---------- */

export function CleanRow({
  label,
  description,
  trailing,
  onClick,
  icon,
}: {
  label: string;
  description?: string;
  trailing?: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 py-3 text-left",
        onClick && "hover:bg-accent/30 -mx-2 px-2 rounded-lg transition-colors",
      )}
    >
      {icon && (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          {icon}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold text-foreground truncate">{label}</p>
        {description && (
          <p className="text-[12px] text-muted-foreground mt-0.5 truncate">{description}</p>
        )}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </Tag>
  );
}

/* ---------- Button ---------- */

export function CleanButton({
  variant = "primary",
  size = "md",
  loading,
  children,
  className,
  ...rest
}: {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    secondary: "bg-card text-foreground border border-border hover:bg-accent",
    ghost: "bg-transparent text-foreground hover:bg-accent",
    danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  };
  const sizes = {
    sm: "h-8 px-3 text-[12.5px]",
    md: "h-10 px-4 text-[13.5px]",
  };
  return (
    <button
      {...rest}
      disabled={loading || rest.disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}>
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {children}
    </button>
  );
}
