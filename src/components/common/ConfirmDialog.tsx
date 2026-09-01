/** @doc Clean confirmation dialog — used for destructive and sign-out flows. */
import { ReactNode, createContext, useCallback, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, LogOut, Loader2 } from "lucide-react";

export type ConfirmTone = "danger" | "neutral";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  icon?: ReactNode;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "neutral",
  icon,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onCancel]);

  if (!open || typeof document === "undefined") return null;

  const danger = tone === "danger";

  return createPortal(
    <div className="cfd-scrim" onClick={loading ? undefined : onCancel}>
      <style>{cfdCss}</style>
      <div
        className="cfd-card"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`cfd-icon ${danger ? "is-danger" : ""}`}>
          {icon ?? (danger ? <AlertTriangle size={20} strokeWidth={1.8} /> : <LogOut size={20} strokeWidth={1.8} />)}
        </div>
        <h2 className="cfd-title">{title}</h2>
        {description && <p className="cfd-desc">{description}</p>}
        <div className="cfd-actions">
          <button type="button" className="cfd-btn" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`cfd-btn cfd-btn-primary ${danger ? "is-danger" : ""}`}
            onClick={onConfirm}
            disabled={loading}>
            {loading && <Loader2 className="cfd-spin" size={14} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const cfdCss = `
.cfd-scrim {
  position: fixed; inset: 0; z-index: 120;
  display: grid; place-items: center;
  padding: 22px;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  animation: cfd-fade 180ms ease-out both;
}
.cfd-card {
  width: 100%; max-width: 340px;
  border-radius: 22px;
  padding: 22px 20px 18px;
  text-align: center;
  background: var(--mn-card, #16181c);
  color: var(--mn-fg, #f5f5f5);
  border: 1px solid var(--mn-sep, rgba(255,255,255,0.08));
  box-shadow: 0 30px 80px -24px rgba(0,0,0,0.8);
  animation: cfd-pop 220ms cubic-bezier(0.16,1,0.3,1) both;
}
.cfd-icon {
  width: 46px; height: 46px; margin: 0 auto 14px;
  display: grid; place-items: center; border-radius: 999px;
  background: rgba(255,255,255,0.06);
  color: var(--mn-fg, #f5f5f5);
}
.cfd-icon.is-danger { background: rgba(255,90,90,0.10); color: var(--mn-danger, #ff5a5a); }
.cfd-title { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -0.01em; }
.cfd-desc {
  margin: 8px 0 0; font-size: 13.5px; line-height: 1.5;
  color: var(--mn-muted, rgba(245,245,245,0.6));
}
.cfd-actions { margin-top: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.cfd-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 12px 10px; border-radius: 14px; border: 0;
  background: var(--mn-card-2, rgba(255,255,255,0.06));
  color: var(--mn-fg, #f5f5f5);
  font: inherit; font-size: 14px; font-weight: 500;
  cursor: pointer; transition: transform 150ms ease, opacity 150ms ease, background-color 150ms ease;
}
.cfd-btn:active { transform: scale(0.97); }
.cfd-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.cfd-btn-primary { background: var(--mn-fg, #f5f5f5); color: var(--mn-bg, #0b0c0e); }
.cfd-btn-primary.is-danger { background: var(--mn-danger, #ff5a5a); color: #fff; }
.cfd-spin { animation: cfd-rot 900ms linear infinite; }
@keyframes cfd-rot { to { transform: rotate(360deg); } }
@keyframes cfd-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes cfd-pop { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
`;

export default ConfirmDialog;

// ---------------------------------------------------------------------------
// Imperative API: <ConfirmProvider> + useConfirm()
// ---------------------------------------------------------------------------
type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  icon?: ReactNode;
};

const ConfirmContext = createContext<(opts: ConfirmOptions) => Promise<boolean>>(
  async () => false,
);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<
    (ConfirmOptions & { resolve: (v: boolean) => void }) | null
  >(null);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setState({ ...opts, resolve })),
    [],
  );

  const close = useCallback(
    (value: boolean) => {
      setState((s) => {
        s?.resolve(value);
        return null;
      });
    },
    [],
  );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={!!state}
        title={state?.title ?? ""}
        description={state?.description}
        confirmLabel={state?.confirmLabel}
        cancelLabel={state?.cancelLabel}
        tone={state?.tone}
        icon={state?.icon}
        onConfirm={() => close(true)}
        onCancel={() => close(false)}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
