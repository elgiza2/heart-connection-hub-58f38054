import { m as motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Check } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

export type PickerCategory = "premium" | "standard";

export interface PickerTemplate {
  id: string;
  name: string;
  preview?: string;
  description?: string;
  fallbackLabel?: string;
  category?: PickerCategory;
  colors?: [string, string];
}

interface Props {
  open: boolean;
  templates: PickerTemplate[];
  selectedId?: string;
  onSelect: (t: PickerTemplate) => void;
  onClose: () => void;
  /** Deprecated: category tabs are no longer shown. */
  showCategoryTabs?: boolean;
}

// Neo-brutalist dark palette — matches /settings/referrals
const PAGE_BG = "hsl(var(--brand-ink))";
const SURFACE = "hsl(var(--surface-1))";
const SURFACE_2 = "hsl(var(--surface-3))";
const BORDER = "hsl(var(--surface-4))";
const TEXT = "hsl(var(--brand-parchment))";
const MUTED = "hsl(var(--brand-muted))";
const INK = "hsl(var(--brand-ink))";
const YELLOW = "hsl(var(--brand-action))";

/* Deterministic gradient generator from a string id. */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function gradientFor(id: string): string {
  const h = hashString(id);
  const h1 = h % 360;
  const h2 = (h1 + 40 + (h % 80)) % 360;
  const h3 = (h1 + 200 + ((h >> 3) % 60)) % 360;
  const angle = (h >> 5) % 360;
  return `linear-gradient(${angle}deg, hsl(${h1} 80% 18%) 0%, hsl(${h2} 75% 38%) 48%, hsl(${h3} 85% 60%) 100%)`;
}

const TemplatePickerSheet = ({ open, templates, selectedId, onSelect, onClose }: Props) => {
  const [pendingId, setPendingId] = useState<string | undefined>(selectedId);

  useEffect(() => {
    if (!open) return;
    setPendingId(selectedId);
  }, [open, selectedId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && pendingId) confirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingId]);

  const visible = useMemo(() => templates, [templates]);

  const fallbackStyle = (t: PickerTemplate): CSSProperties => {
    if (t.colors && t.colors.length >= 2) {
      return { background: `linear-gradient(135deg, ${t.colors[0]} 0%, ${t.colors[1]} 100%)` };
    }
    return { background: gradientFor(t.id) };
  };

  const confirm = () => {
    const tpl = templates.find((x) => x.id === pendingId);
    if (tpl) onSelect(tpl);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* ===================== MOBILE (full-screen sheet) ===================== */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="md:hidden fixed inset-0 z-overlay flex flex-col"
            style={{ backgroundColor: PAGE_BG }}
          >
            {/* Header */}
            <header
              className="sticky top-0 z-10 flex items-center justify-between px-4 py-3.5"
              style={{ backgroundColor: SURFACE, borderBottom: `2px solid ${INK}` }}
            >
              <button
                onClick={onClose}
                className="h-10 w-10 rounded-full flex items-center justify-center transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                style={{
                  backgroundColor: YELLOW,
                  border: `2px solid ${INK}`,
                  boxShadow: `2px 2px 0 ${INK}`,
                }}
                aria-label="Back"
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={3} style={{ color: INK }} />
              </button>
              <h2 className="text-[15px] font-black tracking-tight" style={{ color: TEXT }}>
                Select Style
              </h2>
              <div className="w-10" />
            </header>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="grid grid-cols-2 gap-3 max-w-3xl mx-auto">
                {visible.map((t) => {
                  const active = pendingId === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setPendingId(t.id)}
                      className="group relative w-full rounded-[18px] overflow-hidden text-left transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                      style={
                        active
                          ? {
                              backgroundColor: YELLOW,
                              border: `2.5px solid ${INK}`,
                              boxShadow: `4px 4px 0 ${INK}`,
                            }
                          : {
                              backgroundColor: SURFACE,
                              border: `2.5px solid ${BORDER}`,
                            }
                      }
                    >
                      <div
                        className="relative w-full aspect-video overflow-hidden"
                        style={{ borderBottom: `2px solid ${INK}`, ...fallbackStyle(t) }}
                      >
                        {t.preview && (
                          <img decoding="async"
                            src={t.preview}
                            alt=""
                            loading="lazy"
                            className="absolute inset-0 w-full h-full object-contain"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                        )}
                        {active && (
                          <span
                            className="absolute top-2 right-2 h-6 w-6 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: INK, border: `2px solid ${INK}` }}
                          >
                            <Check
                              className="h-3.5 w-3.5"
                              strokeWidth={3}
                              style={{ color: YELLOW }}
                            />
                          </span>
                        )}
                      </div>
                      {t.name && (
                        <div className="px-2.5 py-2">
                          <p
                            className="text-[12px] font-black truncate tracking-tight"
                            style={{ color: active ? INK : TEXT }}
                          >
                            {t.name}
                          </p>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div
              className="sticky bottom-0 z-10 px-4 py-3 flex gap-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
              style={{ backgroundColor: SURFACE, borderTop: `2px solid ${INK}` }}
            >
              <button
                onClick={onClose}
                className="flex-1 h-12 rounded-2xl text-[14px] font-black transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                style={{
                  backgroundColor: SURFACE_2,
                  color: TEXT,
                  border: `2px solid ${INK}`,
                  boxShadow: `2px 2px 0 ${INK}`,
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirm}
                disabled={!pendingId}
                className="flex-1 h-12 rounded-2xl text-[14px] font-black transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: YELLOW,
                  color: INK,
                  border: `2px solid ${INK}`,
                  boxShadow: `3px 3px 0 ${INK}`,
                }}
              >
                Confirm
              </button>
            </div>
          </motion.div>

          {/* ===================== DESKTOP (centered dialog) ===================== */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="hidden md:flex fixed inset-0 z-overlay items-center justify-center p-6"
            style={{ backgroundColor: `${PAGE_BG}E6` }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-5xl max-h-[88vh] flex flex-col overflow-hidden"
              style={{
                backgroundColor: SURFACE,
                border: `2.5px solid ${INK}`,
                borderRadius: "24px",
                boxShadow: `8px 8px 0 ${INK}`,
              }}
            >
              {/* Header */}
              <header
                className="px-6 pt-5 pb-4 flex items-center justify-between"
                style={{ borderBottom: `2px solid ${INK}`, backgroundColor: SURFACE_2 }}
              >
                <div>
                  <h2 className="text-lg font-black tracking-tight" style={{ color: TEXT }}>
                    Select Style
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                    Choose a template for your presentation
                  </p>
                </div>
              </header>

              {/* Grid */}
              <div
                className="flex-1 overflow-y-auto px-6 py-5"
                style={{ backgroundColor: PAGE_BG }}
              >
                <div className="grid grid-cols-3 lg:grid-cols-4 gap-4">
                  {visible.map((t) => {
                    const active = pendingId === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setPendingId(t.id)}
                        onDoubleClick={() => {
                          setPendingId(t.id);
                          setTimeout(confirm, 0);
                        }}
                        className="group relative rounded-[18px] overflow-hidden text-left transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                        style={
                          active
                            ? {
                                backgroundColor: YELLOW,
                                border: `2.5px solid ${INK}`,
                                boxShadow: `4px 4px 0 ${INK}`,
                              }
                            : {
                                backgroundColor: SURFACE,
                                border: `2.5px solid ${BORDER}`,
                              }
                        }
                      >
                        <div
                          className="relative w-full aspect-video overflow-hidden"
                          style={{ borderBottom: `2px solid ${INK}`, ...fallbackStyle(t) }}
                        >
                          {t.preview && (
                            <img decoding="async"
                              src={t.preview}
                              alt={t.name}
                              loading="lazy"
                              className="absolute inset-0 w-full h-full object-contain transition-transform duration-500 group-hover:scale-[1.03]"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = "none";
                              }}
                            />
                          )}
                          {active && (
                            <span
                              className="absolute top-2.5 right-2.5 h-6 w-6 rounded-full flex items-center justify-center"
                              style={{ backgroundColor: INK, border: `2px solid ${INK}` }}
                            >
                              <Check
                                className="h-3.5 w-3.5"
                                strokeWidth={3}
                                style={{ color: YELLOW }}
                              />
                            </span>
                          )}
                        </div>
                        {t.name && (
                          <div className="px-3 py-2.5">
                            <p
                              className="text-sm font-black truncate tracking-tight"
                              style={{ color: active ? INK : TEXT }}
                            >
                              {t.name}
                            </p>
                            {t.description && (
                              <p
                                className="text-[11px] truncate mt-0.5"
                                style={{ color: active ? INK : MUTED, opacity: active ? 0.7 : 1 }}
                              >
                                {t.description}
                              </p>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div
                className="px-6 py-4 flex items-center justify-between gap-3"
                style={{ backgroundColor: SURFACE_2, borderTop: `2px solid ${INK}` }}
              >
                <p className="text-xs" style={{ color: MUTED }}>
                  {pendingId ? "Press Enter to confirm" : "Select a template to continue"}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={onClose}
                    className="h-11 px-6 rounded-full text-sm font-black transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                    style={{
                      backgroundColor: SURFACE,
                      color: TEXT,
                      border: `2px solid ${INK}`,
                      boxShadow: `2px 2px 0 ${INK}`,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirm}
                    disabled={!pendingId}
                    className="h-11 px-7 rounded-full text-sm font-black transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: YELLOW,
                      color: INK,
                      border: `2px solid ${INK}`,
                      boxShadow: `3px 3px 0 ${INK}`,
                    }}
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default TemplatePickerSheet;
