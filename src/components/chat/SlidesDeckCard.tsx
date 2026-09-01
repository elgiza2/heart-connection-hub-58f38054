import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { m as motion, AnimatePresence } from "framer-motion";
import { useNavigate, useInRouterContext } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Maximize2,
  Download,
  Loader2,
  FileCode2,
  FileType2,
  MoveHorizontal,
  MoveVertical,
} from "lucide-react";
import { toast } from "sonner";
import { exportDeckHtml, exportDeckPptx } from "@/lib/slidesExport";
import { findSlidesTemplate } from "@/lib/slidesTemplates";
import { useFullscreenBodyClass } from "@/hooks/useFullscreenBodyClass";
import { stashSlidesDeckForPreview } from "@/lib/slidesPreviewStore";

export interface SlideData {
  type?: string;
  layout?: string;
  variant?: string;
  accent?: string;
  title?: string;
  subtitle?: string;
  body?: string;
  bullets?: string[];
  quote?: string;
  attribution?: string;
  stats?: { label: string; value: string }[];
  image?: string;
  images?: string[];
  kicker?: string;
  cta?: string;
  steps?: { title: string; desc?: string }[];
  events?: { date: string; title: string; desc?: string }[];
  left_title?: string;
  right_title?: string;
  left_bullets?: string[];
  right_bullets?: string[];
  big_value?: string;
  big_label?: string;
  focus?: string;
  source_url?: string;
  /** Optional chart data — renderer draws inline SVG bars or line. */
  chart?: {
    kind?: "bar" | "line" | "donut";
    data?: { label: string; value: number }[];
    yLabel?: string;
  };
}

export interface SlideBrandKit {
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
}

export interface SlideDeck {
  title: string;
  subtitle?: string;
  language?: string;
  templateId: string;
  palette: { primary: string; accent: string; bg: string; fg: string };
  slides: SlideData[];
  /** Optional theme id from src/lib/slides/themes.ts */
  theme?: string;
  brandKit?: SlideBrandKit;
  densityHint?: "low" | "medium" | "high";
  audience?: string;
  durationMin?: number;
}

interface Props {
  deck: SlideDeck;
  /** When true, don't render the card thumbnail — render only the fullscreen viewer. */
  hideCard?: boolean;
  /** When true, open the fullscreen viewer immediately (used by /slides/preview/:id). */
  autoOpen?: boolean;
  /** Called when the viewer requests to close (e.g. Escape or X button). */
  onClose?: () => void;
}

/* ============================================================
 * Variant parser — turns `base--accent-align-density-ornament`
 * into actual style modifiers consumed by the renderer.
 * ============================================================ */
export const ACCENT_HEX: Record<string, string> = {
  indigo: "#6366f1",
  violet: "#8b5cf6",
  rose: "#f43f5e",
  amber: "#f59e0b",
  emerald: "#10b981",
  teal: "#14b8a6",
  cyan: "#06b6d4",
  sky: "#0ea5e9",
  fuchsia: "#d946ef",
  lime: "#84cc16",
  orange: "#f97316",
  slate: "#64748b",
  stone: "#78716c",
  gold: "#d4af37",
  ruby: "#9b1c31",
  mint: "#3eb489",
};
export const ORNAMENT_CLASS: Record<string, string> = {
  ribbon: "slide-ornament-ribbon",
  "side-bar": "slide-ornament-side-bar",
  "corner-mark": "slide-ornament-corner",
  corner: "slide-ornament-corner",
  dots: "slide-ornament-dots",
  noise: "slide-ornament-dots",
  grid: "slide-ornament-grid",
  frame: "slide-ornament-grid",
  gradient: "slide-ornament-arc",
  rule: "slide-ornament-ribbon",
  underline: "slide-ornament-ribbon",
};
export function parseVariant(layoutOrVariant: string | undefined) {
  const v = (layoutOrVariant || "").toLowerCase();
  const [base, suffix] = v.split("--");
  if (!suffix)
    return { base, accent: undefined, align: undefined, density: undefined, ornament: undefined };
  const parts = suffix.split("-");
  return {
    base,
    accent: parts[0],
    align: parts[1] as "left" | "center" | "right" | undefined,
    density: parts[2] as "airy" | "balanced" | "dense" | undefined,
    ornament: parts.slice(3).join("-") || undefined,
  };
}

/* ============================================================
 * ScaledSlide — fixed 1920x1080 canvas, scales to fit parent.
 * ============================================================ */
function ScaledSlide({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const compute = () => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const s = Math.min(r.width / 1920, r.height / 1080);
      setScale(s);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="slide-stage">
      <div className="slide-canvas" style={{ ["--slide-scale" as never]: scale }}>
        {children}
      </div>
    </div>
  );
}

/* Render a single slide using the deck palette — readable, brand-light.
   Renders into a fixed 1920x1080 canvas (.slide-content) so typography
   stays consistent across viewports. Honors slide.layout / variant
   modifiers (accent, density, ornament) coming from the layout registry. */
function SlideRender({
  slide,
  palette,
  dir,
}: {
  slide: SlideData;
  palette: SlideDeck["palette"];
  dir: "ltr" | "rtl";
}) {
  const rawLayout = (slide.layout || slide.variant || "").toLowerCase();
  const {
    base: parsedBase,
    accent: vAccent,
    align: vAlign,
    density: vDensity,
    ornament: vOrnament,
  } = parseVariant(rawLayout);
  const layout = parsedBase || rawLayout;

  const isQuote = slide.type === "quote" || layout === "pull-quote";
  const isStats =
    slide.type === "stats" ||
    ["big-number", "stat-cluster", "stat-circles", "kpi-strip"].includes(layout) ||
    !!slide.big_value;
  const isCover = slide.type === "cover" || layout === "magazine-cover";
  const isClosing = slide.type === "closing";
  const isComparison =
    !!(slide.left_bullets?.length || slide.right_bullets?.length) ||
    ["comparison", "vs-split", "before-after", "table-compare"].includes(layout);
  const isProcess =
    (Array.isArray(slide.steps) && slide.steps.length > 0) ||
    ["process", "step-vertical", "numbered-list"].includes(layout);
  const isTimeline =
    (Array.isArray(slide.events) && slide.events.length > 0) ||
    ["timeline", "timeline-horizontal", "story-rows"].includes(layout);
  const isGallery =
    (Array.isArray(slide.images) && slide.images.length > 1) ||
    ["gallery", "image-grid-2", "image-grid-4", "carousel-strip", "masonry-cards"].includes(layout);
  const sideImageRight = [
    "split-right",
    "image-side-card",
    "focus-image",
    "diagonal-split",
    "polaroid",
  ].includes(layout);
  const sideImageLeft = layout === "split-left";

  // Accent: variant overrides palette accent (so 16 accent variants × layouts feel distinct).
  const accentColor = (vAccent && ACCENT_HEX[vAccent]) || palette.accent;
  // Alignment: text-align honored when explicit.
  const alignClass =
    vAlign === "center"
      ? "items-center text-center"
      : vAlign === "right"
        ? "items-end text-right"
        : "items-start text-left";
  // Ornament: maps to one of the css classes we defined in index.css.
  const ornamentClass = (vOrnament && ORNAMENT_CLASS[vOrnament]) || "";

  const accentDot = (
    <span className="mt-3 w-3 h-3 rounded-full shrink-0" style={{ background: accentColor }} />
  );

  return (
    <div
      className={`slide-content flex ${ornamentClass}`}
      data-density={vDensity || "balanced"}
      style={{
        background: palette.bg,
        color: palette.fg,
        direction: dir,
        ["--slide-accent-color" as never]: accentColor,
      }}
    >
      {/* Cover background image */}
      {isCover && slide.image && (
        <>
          <img loading="lazy" decoding="async"
            src={slide.image}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-30"
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${palette.bg}ee, ${palette.bg}aa 60%, transparent)`,
            }}
          />
        </>
      )}

      {/* Side image (split layouts) */}
      {!isCover &&
        !isClosing &&
        !isQuote &&
        !isStats &&
        !isComparison &&
        !isProcess &&
        !isTimeline &&
        !isGallery &&
        slide.image && (
          <div
            className={`w-[42%] h-full relative shrink-0 ${sideImageLeft ? "order-1" : "order-2"}`}
          >
            <img loading="lazy" decoding="async" src={slide.image} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(${sideImageLeft ? (dir === "rtl" ? "90deg" : "270deg") : dir === "rtl" ? "270deg" : "90deg"}, ${palette.bg}, transparent 60%)`,
              }}
            />
          </div>
        )}

      <div
        className={`relative z-10 flex-1 px-28 py-24 flex flex-col justify-center ${alignClass} ${sideImageLeft ? "order-2" : "order-1"}`}
      >
        {slide.kicker && (
          <span className="slide-kicker mb-6 opacity-80" style={{ color: accentColor }}>
            {slide.kicker}
          </span>
        )}

        {isQuote ? (
          <>
            <span
              className="leading-none mb-2"
              style={{ color: accentColor, fontSize: 160, fontWeight: 800 }}
            >
              "
            </span>
            <p className="slide-subtitle font-semibold mb-6 max-w-[1400px]">
              {slide.quote || slide.body}
            </p>
            {slide.attribution && <p className="slide-body opacity-70">— {slide.attribution}</p>}
          </>
        ) : isStats ? (
          <>
            {slide.title && <h2 className="slide-title mb-12">{slide.title}</h2>}
            {slide.big_value ? (
              <div className="mb-10">
                <div
                  className="leading-none"
                  style={{
                    color: accentColor,
                    fontSize: 240,
                    fontWeight: 900,
                    letterSpacing: "-0.04em",
                  }}
                >
                  {slide.big_value}
                </div>
                {slide.big_label && (
                  <div className="mt-4 slide-body-lg opacity-85">{slide.big_label}</div>
                )}
              </div>
            ) : null}
            {slide.stats?.length ? (
              <div
                className={`grid gap-8 w-full max-w-[1500px] ${slide.stats.length >= 4 ? "grid-cols-4" : `grid-cols-${Math.min(3, slide.stats.length)}`}`}
              >
                {slide.stats.slice(0, 6).map((s, i) => (
                  <div
                    key={i}
                    className="rounded-3xl p-10"
                    style={{ background: `${palette.fg}0d` }}
                  >
                    <div
                      className="font-extrabold"
                      style={{ color: accentColor, fontSize: 84, lineHeight: 1 }}
                    >
                      {s.value}
                    </div>
                    <div className="slide-caption opacity-85 mt-4">{s.label}</div>
                  </div>
                ))}
              </div>
            ) : null}
            {slide.subtitle && (
              <p className="slide-body opacity-85 mt-8 max-w-[1400px]">{slide.subtitle}</p>
            )}
          </>
        ) : isComparison ? (
          <>
            {slide.title && <h2 className="slide-title mb-12">{slide.title}</h2>}
            <div className="grid grid-cols-2 gap-10 w-full max-w-[1600px]">
              {[
                { title: slide.left_title, bullets: slide.left_bullets },
                { title: slide.right_title, bullets: slide.right_bullets },
              ].map((col, i) => (
                <div key={i} className="rounded-3xl p-10" style={{ background: `${palette.fg}0d` }}>
                  {col.title && (
                    <div className="slide-subtitle font-bold mb-6" style={{ color: accentColor }}>
                      {col.title}
                    </div>
                  )}
                  <ul className="space-y-5">
                    {(col.bullets || []).slice(0, 5).map((b, j) => (
                      <li key={j} className="flex gap-4 slide-body">
                        <span
                          className="mt-4 w-3 h-3 rounded-full shrink-0"
                          style={{ background: accentColor }}
                        />
                        <span className="opacity-95">{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        ) : isProcess ? (
          <>
            {slide.title && <h2 className="slide-title mb-12">{slide.title}</h2>}
            <ol className="grid gap-6 grid-cols-2 w-full max-w-[1600px]">
              {(slide.steps || []).slice(0, 6).map((st, i) => (
                <li
                  key={i}
                  className="flex gap-6 rounded-3xl p-8"
                  style={{ background: `${palette.fg}0d` }}
                >
                  <span
                    className="shrink-0 w-16 h-16 rounded-full flex items-center justify-center font-extrabold"
                    style={{ background: accentColor, color: palette.bg, fontSize: 32 }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 text-left">
                    <div className="slide-body-lg font-semibold">{st.title}</div>
                    {st.desc && <div className="slide-body opacity-80 mt-2">{st.desc}</div>}
                  </div>
                </li>
              ))}
            </ol>
          </>
        ) : isTimeline ? (
          <>
            {slide.title && <h2 className="slide-title mb-12">{slide.title}</h2>}
            <div
              className="relative space-y-8 w-full max-w-[1500px]"
              style={dir === "rtl" ? { paddingRight: 40 } : { paddingLeft: 40 }}
            >
              <div
                className="absolute top-2 bottom-2 w-[3px]"
                style={{
                  background: `${accentColor}66`,
                  ...(dir === "rtl" ? { right: 12 } : { left: 12 }),
                }}
              />
              {(slide.events || []).slice(0, 6).map((ev, i) => (
                <div key={i} className="relative">
                  <span
                    className="absolute top-3 w-5 h-5 rounded-full ring-4 ring-[var(--slide-stage-bg,transparent)]"
                    style={{
                      background: accentColor,
                      ...(dir === "rtl" ? { right: -34 } : { left: -34 }),
                    }}
                  />
                  <div
                    className="slide-caption font-mono opacity-75"
                    style={{ color: accentColor }}
                  >
                    {ev.date}
                  </div>
                  <div className="slide-body-lg font-semibold">{ev.title}</div>
                  {ev.desc && <div className="slide-body opacity-80 mt-1">{ev.desc}</div>}
                </div>
              ))}
            </div>
          </>
        ) : isGallery ? (
          <>
            {slide.title && <h2 className="slide-title mb-10">{slide.title}</h2>}
            <div
              className={`grid gap-5 w-full max-w-[1600px] ${slide.images && slide.images.length >= 4 ? "grid-cols-4" : "grid-cols-2"}`}
            >
              {(slide.images || []).slice(0, 6).map((u, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-2xl overflow-hidden"
                  style={{ background: `${palette.fg}0d` }}
                >
                  <img loading="lazy" decoding="async" src={u} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
            {slide.subtitle && <p className="slide-caption opacity-80 mt-6">{slide.subtitle}</p>}
          </>
        ) : (
          <>
            {slide.title && (
              <h2 className={`mb-6 ${isCover ? "slide-title-lg" : "slide-title"}`}>
                {slide.title}
              </h2>
            )}
            {slide.subtitle && (
              <p className="slide-subtitle opacity-85 mb-8 max-w-[1400px]">{slide.subtitle}</p>
            )}
            {slide.body && !isCover && (
              <p className="slide-body opacity-90 mb-6 max-w-[1100px]">{slide.body}</p>
            )}
            {slide.bullets && slide.bullets.length > 0 && (
              <ul
                className={`gap-5 max-w-[1500px] ${["two-col", "three-col", "four-col", "bento", "pillars", "icon-grid", "ribbon-cards"].includes(layout) ? `grid ${layout === "four-col" ? "grid-cols-4" : layout === "three-col" ? "grid-cols-3" : "grid-cols-2"}` : "space-y-5"}`}
              >
                {slide.bullets.map((b, i) => (
                  <li key={i} className="flex gap-5 slide-body">
                    {accentDot}
                    <span className="opacity-95">{b}</span>
                  </li>
                ))}
              </ul>
            )}
            {isClosing && slide.cta && (
              <div
                className="mt-10 inline-flex px-10 py-5 rounded-full slide-body-lg font-semibold"
                style={{ background: accentColor, color: palette.bg }}
              >
                {slide.cta}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function useSafeNavigate() {
  const inRouter = useInRouterContext();
  // Hook order is stable per mount because router presence doesn't change.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return inRouter ? useNavigate() : null;
}

const SlidesDeckCard = ({ deck, hideCard = false, autoOpen = false, onClose }: Props) => {
  const navigate = useSafeNavigate();
  const [open, setOpen] = useState(autoOpen);
  useFullscreenBodyClass(open);

  const openPreview = () => {
    if (hideCard) {
      setOpen(true);
      return;
    }
    const id = stashSlidesDeckForPreview(deck);
    if (navigate) {
      navigate(`/slides/preview/${id}`);
    } else {
      window.location.assign(`/slides/preview/${id}`);
    }
  };

  const closePreview = () => {
    setOpen(false);
    onClose?.();
  };

  const [idx, setIdx] = useState(0);
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">("horizontal");
  const verticalScrollRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Sync idx -> scroll in vertical mode
  useEffect(() => {
    if (!open || orientation !== "vertical") return;
    const el = slideRefs.current[idx];
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [idx, orientation, open]);

  // Sync scroll -> idx in vertical mode
  useEffect(() => {
    if (!open || orientation !== "vertical") return;
    const container = verticalScrollRef.current;
    if (!container) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const center = container.scrollTop + container.clientHeight / 2;
        let best = 0,
          bestDist = Infinity;
        slideRefs.current.forEach((el, i) => {
          if (!el) return;
          const elCenter = el.offsetTop + el.offsetHeight / 2;
          const d = Math.abs(elCenter - center);
          if (d < bestDist) {
            bestDist = d;
            best = i;
          }
        });
        setIdx(best);
      });
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [open, orientation]);
  const dir: "ltr" | "rtl" = deck.language?.startsWith("ar") ? "rtl" : "ltr";
  const total = deck.slides.length;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePreview();
      else if (e.key === "ArrowRight") setIdx((i) => Math.min(total - 1, i + 1));
      else if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, total]);

  const [exportingHtml, setExportingHtml] = useState(false);
  const [exportingPptx, setExportingPptx] = useState(false);

  const handleHtml = async () => {
    setExportingHtml(true);
    try {
      exportDeckHtml(deck);
      toast.success("HTML downloaded");
    } catch {
      toast.error("HTML export failed");
    } finally {
      setExportingHtml(false);
    }
  };

  const handlePptx = async () => {
    setExportingPptx(true);
    try {
      await exportDeckPptx(deck);
      toast.success("PPTX downloaded");
    } catch (e) {
      console.error(e);
      toast.error("PPTX export failed");
    } finally {
      setExportingPptx(false);
    }
  };

  // Card preview
  const cover = deck.slides[0];
  return (
    <>
      {!hideCard && (
      <div className="mt-3 group relative max-w-[420px] rounded-ios-xl overflow-hidden bg-zinc-950 border border-foreground/5 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] transition-all duration-700 hover:border-foreground/10">
        <button
          onClick={() => {
            setIdx(0);
            openPreview();
          }}
          className="relative block w-full aspect-[16/9] overflow-hidden bg-zinc-900"
          style={{ background: deck.palette.bg }}
        >
          {cover?.image && (
            <img loading="lazy" decoding="async"
              src={cover.image}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-60 scale-110 group-hover:scale-100 transition-transform duration-1000"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent pointer-events-none" />
          <div className="absolute top-4 right-4 inline-flex items-center gap-1 rounded-full bg-background/50 backdrop-blur px-2.5 py-1 text-[11px] font-medium text-foreground opacity-0 group-hover:opacity-100 transition">
            <Maximize2 className="w-3 h-3" /> Open
          </div>
        </button>

        <div className="px-6 pb-6 pt-4 flex flex-col gap-3">
          <button
            onClick={() => {
              setIdx(0);
              openPreview();
            }}
              data-slides-preview-button
            style={{ backgroundColor: "#ffffff", color: "#000000" }}
            className="w-full flex items-center justify-center gap-2 py-3.5 font-semibold rounded-2xl transition-all active:scale-[0.97] hover:brightness-95 shadow-lg text-[14px] tracking-tight"
          >
            <Maximize2 className="w-4 h-4" />
            Open in preview
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePptx}
              disabled={exportingPptx}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-zinc-900 text-zinc-400 hover:text-foreground font-medium rounded-2xl border border-foreground/5 transition-all hover:bg-zinc-800 active:scale-[0.97] disabled:opacity-50 text-[13px]"
            >
              {exportingPptx ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              PPTX
            </button>
            <button
              onClick={handleHtml}
              disabled={exportingHtml}
              aria-label="HTML"
              className="w-11 h-11 flex items-center justify-center bg-zinc-900 text-zinc-400 hover:text-foreground rounded-2xl border border-foreground/5 transition-all hover:bg-zinc-800 active:scale-[0.97] disabled:opacity-50"
            >
              {exportingHtml ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileCode2 className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-modal bg-background/95 backdrop-blur flex flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <header className="flex items-center justify-between px-4 py-3 gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs font-mono text-foreground/60">
                  {idx + 1} / {total}
                </span>
                <span className="text-sm font-semibold text-foreground truncate">{deck.title}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="flex items-center rounded-full bg-foreground/10 p-0.5">
                  <button
                    onClick={() => setOrientation("horizontal")}
                    aria-label="Horizontal scroll"
                    title="Horizontal"
                    className={`h-8 px-2.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition ${orientation === "horizontal" ? "bg-foreground/10 text-foreground" : "text-foreground/70 hover:text-foreground"}`}
                  >
                    <MoveHorizontal className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setOrientation("vertical")}
                    aria-label="Vertical scroll"
                    title="Vertical"
                    className={`h-8 px-2.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition ${orientation === "vertical" ? "bg-foreground/10 text-foreground" : "text-foreground/70 hover:text-foreground"}`}
                  >
                    <MoveVertical className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button
                  onClick={closePreview}
                  className="h-9 w-9 rounded-full bg-foreground/10 hover:bg-foreground/20 text-foreground flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </header>

            {orientation === "horizontal" ? (
              <div className="flex-1 flex items-center justify-center px-3 sm:px-10 pb-4 relative">
                <button
                  onClick={() => setIdx((i) => Math.max(0, i - 1))}
                  disabled={idx === 0}
                  className="absolute left-2 sm:left-4 h-11 w-11 rounded-full bg-foreground/10 hover:bg-foreground/20 disabled:opacity-30 text-foreground flex items-center justify-center z-10"
                >
                  <ChevronLeft />
                </button>
                <div className="relative w-full max-w-5xl aspect-[16/9] rounded-2xl overflow-hidden">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: 30 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -30 }}
                      transition={{ duration: 0.25 }}
                      className="absolute inset-0"
                    >
                      <ScaledSlide>
                        <SlideRender slide={deck.slides[idx]} palette={deck.palette} dir={dir} />
                      </ScaledSlide>
                    </motion.div>
                  </AnimatePresence>
                </div>
                <button
                  onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
                  disabled={idx === total - 1}
                  className="absolute right-2 sm:right-4 h-11 w-11 rounded-full bg-foreground/10 hover:bg-foreground/20 disabled:opacity-30 text-foreground flex items-center justify-center z-10"
                >
                  <ChevronRight />
                </button>
              </div>
            ) : (
              <div
                ref={verticalScrollRef}
                className="flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-10 pb-4 snap-y snap-mandatory"
                style={{ scrollBehavior: "smooth" }}
              >
                <div className="flex flex-col items-center gap-4 py-4">
                  {deck.slides.map((s, i) => (
                    <div
                      key={i}
                      ref={(el) => {
                        slideRefs.current[i] = el;
                      }}
                      className="w-full max-w-5xl aspect-[16/9] rounded-2xl overflow-hidden snap-center shrink-0"
                    >
                      <ScaledSlide>
                        <SlideRender slide={s} palette={deck.palette} dir={dir} />
                      </ScaledSlide>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Filmstrip — quick navigation across slides */}
            <div className="shrink-0 border-t border-foreground/10 bg-background/40 backdrop-blur px-3 py-2.5 overflow-x-auto">
              <div className="flex items-center gap-2 min-w-min mx-auto w-fit">
                {deck.slides.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setIdx(i)}
                    aria-label={`Slide ${i + 1}`}
                    className={`relative shrink-0 w-32 aspect-[16/9] rounded-md overflow-hidden transition ring-2 ${
                      i === idx ? "ring-white" : "ring-transparent opacity-60 hover:opacity-100"
                    }`}
                  >
                    <div className="absolute inset-0 pointer-events-none">
                      <ScaledSlide>
                        <SlideRender slide={s} palette={deck.palette} dir={dir} />
                      </ScaledSlide>
                    </div>
                    <span className="absolute bottom-0.5 right-1 text-[9px] font-mono text-foreground/80 bg-background/40 rounded px-1">
                      {i + 1}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default SlidesDeckCard;
