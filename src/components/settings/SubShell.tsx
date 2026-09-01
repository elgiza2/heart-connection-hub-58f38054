/** @doc Unified Settings sub-page shell — coffee/warm design on mobile, editorial dark on desktop. */
import { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { DesktopSettingsLayout } from "@/components/settings/DesktopSettingsLayout";
import ProfileGlassShell from "@/components/profile/ProfileGlassShell";
import { useNavigate } from "react-router-dom";

// ============================================================================
// SubShell — top-level wrapper for every settings sub-page.
// Desktop: reuses DesktopSettingsLayout (keeps left nav rail), renders an
// editorial header (title + subtitle + optional action) followed by children.
// Mobile: full-screen scroll, iOS-style top bar (back + centered title).
// ============================================================================
interface SubShellProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  onBack?: () => void;
  action?: ReactNode;
  children: ReactNode;
}

export function SubShell({ title, subtitle, backTo = "/settings", onBack, action, children }: SubShellProps) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  // Settings pages always step up to their parent screen — browser history can
  // point anywhere (deep links, redirects) and used to land users on the wrong page.
  const goBack = onBack ?? (() => navigate(backTo));


  if (!isMobile) {
    return (
      <DesktopSettingsLayout>
        <div className="relative z-10 mx-auto max-w-3xl settings-page-enter">
          <button
            onClick={goBack}
            className="mb-6 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground transition-colors group"
          >
            <ChevronLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" strokeWidth={2} />
            Settings
          </button>
          <div className="rounded-2xl overflow-hidden border border-border bg-card/80 shadow-[0_30px_80px_-40px_hsl(var(--foreground)/0.35)] backdrop-blur-xl">
            <header className="flex items-start justify-between gap-6 px-6 pt-6 pb-5 border-b border-border">
              <div className="min-w-0">
                <h1 className="text-[24px] leading-[1.1] font-semibold tracking-tight text-foreground [letter-spacing:-0.025em]">
                  {title}
                </h1>
                {subtitle && (
                  <p className="mt-2 text-[12.5px] max-w-xl leading-relaxed text-muted-foreground">
                    {subtitle}
                  </p>
                )}
              </div>
              {action && <div className="shrink-0">{action}</div>}
            </header>
            <div className="px-8 py-6 space-y-2 text-foreground">{children}</div>

          </div>
        </div>
      </DesktopSettingsLayout>
    );
  }

  return (
    <ProfileGlassShell
      title={title}
      subtitle={subtitle}
      onBack={goBack}
      trailing={action}
    >
      <div className="space-y-6">{children}</div>
    </ProfileGlassShell>
  );
}

// ============================================================================
// SubSection — a titled section.
// Desktop: two columns (title/description on the left, content on the right).
// Mobile: single column stacked, with a subtle group heading.
// ============================================================================
interface SubSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function SubSection({ title, description, children }: SubSectionProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <section>
        <div className="px-1 mb-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--mn-muted)]">
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-[11.5px] text-[color:var(--mn-muted)] leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {children}
      </section>
    );
  }
  return (
    <section className="py-5 border-t border-foreground/8 first:border-t-0 first:pt-2">
      <div className="mb-2.5">
        <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-foreground/55">
          {title}
        </h2>
        {description && (
          <p className="mt-1.5 text-[11.5px] text-foreground/60 leading-relaxed">
            {description}
          </p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

// ============================================================================
// SubCard — unified card surface. Optional padding.
// ============================================================================
export function SubCard({
  children,
  className,
  flush,
}: { children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[14px] overflow-hidden bg-[var(--mn-card)] text-[color:var(--mn-fg)]",
        !flush && "p-4",
        className
      )}
    >
      {children}
    </div>
  );
}

// ============================================================================
// SubRowList — vertically-stacked grouped rows inside a single card surface.
// ============================================================================
export function SubRowList({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[14px] overflow-hidden bg-[var(--mn-card)] text-[color:var(--mn-fg)] divide-y divide-[color:var(--mn-sep)]">
      {children}
    </div>
  );
}

// ============================================================================
// SubRow — a tappable row (label + optional hint + optional trailing content).
// ============================================================================
interface SubRowProps {
  label: string;
  hint?: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  trailing?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export function SubRow({ label, hint, icon: Icon, trailing, onClick, danger, disabled }: SubRowProps) {
  const isClickable = !!onClick && !disabled;
  const Comp: any = isClickable ? "button" : "div";
  return (
    <Comp
      onClick={isClickable ? onClick : undefined}
      disabled={disabled}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
        isClickable && "hover:bg-[color:var(--mn-press)] active:bg-[color:var(--mn-press)]",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {Icon && (
        <Icon
          className={cn(
            "w-[16px] h-[16px] shrink-0",
            danger ? "text-[color:var(--mn-danger)]" : "text-[color:var(--mn-fg)]"
          )}
          strokeWidth={1.8}
        />
      )}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-[13.5px] font-medium truncate",
            danger ? "text-[color:var(--mn-danger)]" : "text-[color:var(--mn-fg)]"
          )}
        >
          {label}
        </p>
        {hint && (
          <p className="text-[11.5px] text-[color:var(--mn-muted)] truncate mt-0.5">{hint}</p>
        )}
      </div>
      {trailing !== undefined ? (
        <div className="shrink-0 flex items-center gap-2 text-[color:var(--mn-muted)]">
          {trailing}
        </div>
      ) : isClickable ? (
        <ChevronRight className="w-3.5 h-3.5 text-[color:var(--mn-faint)] shrink-0" />
      ) : null}
    </Comp>
  );
}

// ============================================================================
// SubStat — small stat card used in identity/overview strips.
// ============================================================================
export function SubStatStrip({ items }: { items: { label: string; value: string; sub?: string }[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-[12px] bg-[var(--mn-card)] px-3.5 py-3"
        >
          <p className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--mn-muted)] font-medium">
            {it.label}
          </p>
          <p className="mt-1.5 text-[16px] font-semibold tabular-nums text-[color:var(--mn-fg-strong)] leading-none">
            {it.value}
          </p>
          {it.sub && (
            <p className="mt-1 text-[10.5px] text-[color:var(--mn-muted)]">{it.sub}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// DangerCallout — highlighted danger area (delete etc).
// ============================================================================
export function DangerCallout({
  title,
  description,
  action,
}: { title: string; description?: string; action: ReactNode }) {
  return (
    <div className="rounded-[14px] bg-[var(--mn-card)] p-4 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold text-[color:var(--mn-danger)]">{title}</p>
        {description && (
          <p className="mt-1 text-[11.5px] text-muted-foreground leading-relaxed">
            {description}
          </p>
        )}
      </div>
      <div className="shrink-0 self-center">{action}</div>
    </div>
  );
}

export default SubShell;