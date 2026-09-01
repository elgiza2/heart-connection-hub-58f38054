/** @doc Unified mobile shell for settings sub-pages — Noir & Gold, editorial. */
import { ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from "react";

type ShellProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  trailing?: ReactNode;
  children: ReactNode;
};

const ProfileGlassShell = ({ title, subtitle, onBack, trailing, children }: ShellProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const back =
    onBack ??
    (() => {
      const parts = location.pathname.split("/").filter(Boolean);
      if (parts.length > 1) {
        navigate("/" + parts.slice(0, -1).join("/"));
      } else {
        navigate("/settings");
      }
    });

  return (
    <div className="ng-root" dir="ltr">
      <style>{ngCss}</style>

      <div className="ng-screen">
        <div className="ng-topbar ng-a1">
          <button onClick={back} aria-label="Back" className="ng-back">
            <ArrowLeft className="w-[18px] h-[18px]" strokeWidth={2} />
          </button>
          <span className="ng-topbar-title">{title}</span>
          <div className="ng-topbar-trail">{trailing}</div>
        </div>

        {subtitle && (
          <header className="ng-hero ng-a2">
            <p className="ng-hero-sub">{subtitle}</p>
          </header>
        )}

        <div className="ng-content">{children}</div>
        <div className="ng-bottom-spacer" />
      </div>
    </div>
  );

};

/* ---------- Building blocks (API compatible) ---------- */

export const GlassSection = ({
  title,
  children,
}: {
  title?: string;
  index?: string;
  children: ReactNode;
}) => (
  <section className="ng-section">
    {title && <h2 className="ng-section-title">{title}</h2>}
    {children}
  </section>
);

export const GlassCard = ({
  children,
  selected = false,
  className = "",
}: {
  children: ReactNode;
  selected?: boolean;
  className?: string;
}) => (
  <div className={`ng-card ${selected ? "ng-card-selected" : ""} ${className}`}>
    {children}
  </div>
);

type RowProps = {
  index?: string;
  icon?: ReactNode;
  label: string;
  hint?: string;
  trailing?: ReactNode;
  danger?: boolean;
  onClick?: () => void;
};

export const GlassRow = ({ icon, label, hint, trailing, danger, onClick }: RowProps) => (
  <button onClick={onClick} className={`ng-row ${danger ? "ng-row-danger" : ""}`} type="button">
    {icon && <span className="ng-row-icon">{icon}</span>}
    <span className="ng-row-body">
      <span className="ng-row-label">{label}</span>
      {hint && <span className="ng-row-hint">{hint}</span>}
    </span>
    {trailing !== undefined ? (
      <span className="ng-row-trailing">{trailing}</span>
    ) : (
      <span className="ng-row-arrow" aria-hidden>›</span>
    )}
  </button>
);

export const GlassField = ({
  label,
  hint,
  ...rest
}: { label?: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) => (
  <label className="ng-field">
    {label && <span className="ng-field-label">{label}</span>}
    <input {...rest} className="ng-input" />
    {hint && <span className="ng-field-hint">{hint}</span>}
  </label>
);

export const GlassPrimaryButton = ({ children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button {...rest} className={`ng-btn ng-btn-primary ${rest.className ?? ""}`}>
    {children}
  </button>
);

export const GlassSecondaryButton = ({ children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button {...rest} className={`ng-btn ng-btn-secondary ${rest.className ?? ""}`}>
    {children}
  </button>
);

/* ---------- CSS (Noir & Gold, editorial) ---------- */

const ngCss = `
.ng-root {
  position: relative;
  min-height: 100dvh;
  color: var(--mn-fg);
  background: var(--mn-bg);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  display: flex; justify-content: center;
  isolation: isolate;
  overflow-x: hidden;
}
.ng-bg, .ng-bg-glow { display: none; }

.ng-screen {
  position: relative;
  width: 100%; max-width: 480px;
  min-height: 100dvh;
  padding: max(env(safe-area-inset-top, 0px), 10px) 14px 0;
}

/* --- Top bar --- */
.ng-topbar {
  position: sticky;
  top: 0;
  z-index: 30;
  display: grid;
  grid-template-columns: 38px 1fr auto;
  align-items: center;
  padding: 8px 0 10px;
  background: var(--mn-bg);
}
.ng-topbar-title {
  text-align: center;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--mn-fg-strong);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ng-back {
  width: 38px; height: 38px; padding: 0;
  border-radius: 999px;
  border: 0;
  background: transparent;
  color: var(--mn-fg);
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 160ms ease;
}
.ng-back:active { background: var(--mn-sep); }
.ng-topbar-trail { min-width: 38px; display: flex; align-items: center; justify-content: flex-end; gap: 8px; }

/* --- Hero --- */
.ng-hero {
  padding: 2px 4px 14px;
  display: flex; flex-direction: column; align-items: flex-start;
  gap: 6px;
}
.ng-hero-sub {
  margin: 0;
  font-size: 13.5px; line-height: 1.5;
  color: var(--mn-muted);
  max-width: 56ch;
}


.ng-content { display: flex; flex-direction: column; gap: 22px; }

/* --- Sections --- */
.ng-section { display: flex; flex-direction: column; gap: 8px; }
.ng-section-title {
  margin: 0 6px 4px;
  font-size: 12px; font-weight: 500;
  color: var(--mn-muted);
  letter-spacing: 0.02em;
}

/* --- Card --- */
.ng-card {
  position: relative;
  background: var(--mn-card);
  border: 0;
  border-radius: 18px;
  overflow: hidden;
}
.ng-card-selected { box-shadow: inset 0 0 0 2px rgba(255,255,255,0.85); }
.ng-card-pad { padding: 16px 16px; display: flex; flex-direction: column; gap: 14px; }
.ng-actions { display: flex; gap: 10px; padding-top: 4px; }
.ng-actions > * { flex: 1; }

/* --- Rows --- */
.ng-row {
  width: 100%;
  display: flex; align-items: center; gap: 14px;
  padding: 15px 16px;
  background: transparent;
  border: 0;
  color: var(--mn-fg);
  text-align: start;
  cursor: pointer;
  font: inherit;
  transition: background-color 160ms ease;
  position: relative;
}
.ng-row + .ng-row::before {
  content: "";
  position: absolute; top: 0; inset-inline-start: 16px; inset-inline-end: 16px;
  height: 1px; background: var(--mn-sep);
}
.ng-row:active { background: var(--mn-sep); }

.ng-row-icon {
  width: 24px; height: 24px;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  color: var(--mn-fg);
  background: transparent;
  border: 0;
}
.ng-row-icon > svg { width: 21px; height: 21px; stroke-width: 1.7; }
.ng-row-icon img { width: 20px; height: 20px; object-fit: contain; display: block; }

.ng-row-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ng-row-label { font-size: 16px; font-weight: 500; color: var(--mn-fg); }
.ng-row-hint { font-size: 12.5px; color: var(--mn-muted); line-height: 1.4; }
.ng-row-trailing {
  font-size: 15px;
  color: var(--mn-muted);
  flex-shrink: 0; max-width: 55%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  display: flex; align-items: center; gap: 6px;
}
.ng-row-arrow {
  font-size: 20px; color: var(--mn-muted);
  flex-shrink: 0; line-height: 1; font-weight: 300;
}
.ng-row-danger .ng-row-label,
.ng-row-danger .ng-row-icon { color: var(--mn-danger); }

/* --- Fields --- */
.ng-field { display: flex; flex-direction: column; gap: 7px; }
.ng-field-label { padding-inline-start: 2px; font-size: 12.5px; font-weight: 500; color: rgba(232,232,232,0.6); }
.ng-input {
  width: 100%;
  background: var(--mn-sheet);
  border: 1px solid var(--mn-sep);
  border-radius: 12px;
  padding: 12px 14px;
  color: var(--mn-fg);
  font: inherit;
  font-size: 15px;
  outline: none;
  transition: border-color 160ms ease;
}
.ng-input:focus { border-color: rgba(255,255,255,0.35); }
.ng-input::placeholder { color: rgba(232,232,232,0.3); }
.ng-field-hint { padding-inline-start: 2px; font-size: 12px; color: var(--mn-muted); line-height: 1.5; }

/* --- Buttons --- */
.ng-btn {
  height: 48px;
  border: 0; padding: 0 22px;
  border-radius: 12px;
  font: inherit;
  font-size: 15px; font-weight: 600;
  cursor: pointer;
  transition: transform 0.12s ease, opacity 0.2s ease, background 0.2s ease;
  display: inline-flex; align-items: center; justify-content: center;
  -webkit-tap-highlight-color: transparent;
}
.ng-btn:active { transform: scale(0.98); }
.ng-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.ng-btn-primary { background: var(--mn-cta-bg); color: var(--mn-cta-fg); }
.ng-btn-secondary { background: var(--mn-card-2); color: var(--mn-fg); }

.ng-bottom-spacer { height: calc(env(safe-area-inset-bottom, 0px) + 48px); }

/* --- Animations (calm fade-up) --- */
@keyframes ng-rise {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.ng-a2 { animation: ng-rise 0.32s cubic-bezier(0.22,1,0.36,1) 0.02s both; }
.ng-content > *:nth-child(1) { animation: ng-rise 0.32s cubic-bezier(0.22,1,0.36,1) 0.06s both; }
.ng-content > *:nth-child(2) { animation: ng-rise 0.32s cubic-bezier(0.22,1,0.36,1) 0.10s both; }
.ng-content > *:nth-child(3) { animation: ng-rise 0.32s cubic-bezier(0.22,1,0.36,1) 0.14s both; }
.ng-content > *:nth-child(4) { animation: ng-rise 0.32s cubic-bezier(0.22,1,0.36,1) 0.18s both; }
.ng-content > *:nth-child(5) { animation: ng-rise 0.32s cubic-bezier(0.22,1,0.36,1) 0.22s both; }
.ng-content > *:nth-child(6) { animation: ng-rise 0.32s cubic-bezier(0.22,1,0.36,1) 0.26s both; }

@media (prefers-reduced-motion: reduce) {
  .ng-a1,.ng-a2,.ng-content > * { animation: none !important; }
}

.pgs-anim-drop1,.pgs-anim-drop2,.pgs-anim-rise1,.pgs-anim-rise2,.pgs-anim-rise3,.pgs-anim-rise4,.pgs-anim-rise5 {
  animation: ng-rise 0.32s cubic-bezier(0.22,1,0.36,1) both;
}
.pgs-anim-drop1 { animation-delay: 0.04s; }
.pgs-anim-drop2 { animation-delay: 0.08s; }
.pgs-anim-rise1 { animation-delay: 0.12s; }
.pgs-anim-rise2 { animation-delay: 0.16s; }
.pgs-anim-rise3 { animation-delay: 0.20s; }
.pgs-anim-rise4 { animation-delay: 0.24s; }
.pgs-anim-rise5 { animation-delay: 0.28s; }

.liquid-glass, .liquid-glass-selected { border-radius: 18px; background: var(--mn-card); border: 0; }

`;

export default ProfileGlassShell;
