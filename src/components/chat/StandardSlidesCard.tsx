// Renders a generated PPTX presentation.
// Uses pptx-preview to render real slide thumbnails fully client-side.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, ArrowLeft, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import slidesCardCover from "@/assets/slides-card-cover.png";
import { stashSlidesFileForPreview } from "@/lib/slidesFilePreviewStore";

const MEGSY_INVITE = "This presentation was designed with Megsy — try it free: https://megsy.ai";

// Slides the generator appends that are not part of the user's content
// (graphics libraries, icon credits, provider branding). Hidden from preview.
const BOILERPLATE_SLIDE_PATTERNS: RegExp[] = [
  /reusable graphics/,
  /icons by/,
  /graphics for your presentations/,
  /made with plus/,
  /plus ai/,
  /plusai/,
  /template by/,
];

async function sharePptx(url: string, fileName: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    const file = new File([blob], fileName, {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    const navAny: any = navigator;
    if (navAny.canShare && navAny.canShare({ files: [file] })) {
      await navAny.share({ files: [file], title: fileName, text: MEGSY_INVITE });
      return;
    }
    if (navAny.share) {
      await navAny.share({ title: fileName, text: `${MEGSY_INVITE}\n${url}`, url });
      return;
    }
    await navigator.clipboard.writeText(`${MEGSY_INVITE}\n${url}`);
    toast.success("Presentation link and invite copied");
  } catch (e) {
    try {
      await navigator.clipboard.writeText(`${MEGSY_INVITE}\n${url}`);
      toast.success("Presentation link and invite copied");
    } catch {
      toast.error("Could not share the file");
    }
  }
}

interface Props {
  title: string;
  templateName: string;
  url: string;
  colors: [string, string];
  slides?: string[];
  chatName?: string;
}

const OilPreviewArtwork = ({ title }: Pick<Props, "title">) => {
  // Fixed olive-oil palette — gradient of pure & deep olives.
  const oliveDeep = "#3a3a18"; // زيتي غامق
  const oliveDark = "#55611f"; // زيتي صافي غامق
  const olive = "#7a8a2e"; // زيتي صافي
  const oliveSoft = "#a8b75a"; // زيتي فاتح
  const oliveCream = "#d9d79a"; // كريمي زيتي

  return (
    <div
      aria-label={title}
      className="absolute inset-0 overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${oliveDeep} 0%, ${oliveDark} 40%, ${olive} 100%)`,
      }}
    >
      <div
        className="absolute inset-[-12%] opacity-95"
        style={{
          background: `
            radial-gradient(circle at 18% 24%, ${oliveCream} 0%, transparent 28%),
            radial-gradient(circle at 78% 22%, ${oliveSoft} 0%, transparent 30%),
            radial-gradient(circle at 68% 72%, ${oliveDeep} 0%, transparent 34%),
            radial-gradient(circle at 24% 78%, ${olive} 0%, transparent 32%),
            linear-gradient(140deg, ${oliveDark} 0%, ${olive} 52%, ${oliveDeep} 100%)
          `,
          filter: "blur(9px) saturate(1.2)",
          transform: "scale(1.08)",
        }}
      />
      <div
        className="absolute inset-0 opacity-55 mix-blend-soft-light"
        style={{
          background: `repeating-linear-gradient(118deg,
            ${oliveCream}55 0px,
            ${oliveCream}55 10px,
            transparent 24px,
            ${oliveDeep}40 38px,
            ${oliveDeep}40 52px
          )`,
        }}
      />
      <div
        className="absolute inset-0 opacity-45"
        style={{
          background: `
            linear-gradient(90deg, ${oliveCream}22 0%, transparent 18%, transparent 82%, ${oliveDeep}30 100%),
            linear-gradient(180deg, ${oliveSoft}26 0%, transparent 24%, transparent 76%, ${oliveDeep}40 100%)
          `,
        }}
      />
    </div>
  );
};

const StandardSlidesCard = ({ title, url, colors, chatName }: Props) => {
  const navigate = useNavigate();

  const openPreview = () => {
    const id = stashSlidesFileForPreview({ kind: "pptx", title, url, chatName: chatName || title });
    navigate(`/slides/file-preview/${id}`);
  };

  return (
    <div className="slides-card-shell mt-3 group relative max-w-[420px] transition-all duration-300 hover:border-border/80">
      <button
        onClick={openPreview}
        className="slides-card-preview relative block w-full aspect-[16/9] overflow-hidden cursor-pointer group/preview"
      >
        <img loading="lazy" decoding="async"
          src={slidesCardCover}
          alt={title}
          className="w-full h-full object-cover"
          draggable={false}
        />
      </button>

      <div className="slides-card-actions px-4 pb-4 pt-4 flex gap-2">
        <button
          onClick={openPreview}
          data-slides-preview-button
          style={{ backgroundColor: "#ffffff", color: "#000000", WebkitTextFillColor: "#000000" }}
          className="slides-card-button slides-card-button--accent flex-1 flex items-center justify-center py-3 text-sm font-medium active:scale-[0.98]"
        >
          Preview
        </button>
        <a
          href={url}
          download
          className="slides-card-button slides-card-button--secondary flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium active:scale-[0.98]"
        >
          <Download className="w-4 h-4" />
          Download
        </a>
      </div>
    </div>
  );
};

interface PreviewProps {
  url: string;
  chatName: string;
  onBack: () => void;
}

export const PptxPreviewScreen = ({ url, chatName, onBack }: PreviewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { init } = await import("pptx-preview");
        if (cancelled || !containerRef.current) return;

        // Clear any previous render
        containerRef.current.innerHTML = "";

        const width = Math.min(window.innerWidth - 24, 1600);
        const height = (width * 9) / 16;

        const previewer = init(containerRef.current, { width, height });
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        await previewer.preview(buf);
        // Strip provider boilerplate slides (graphics library / credits pages)
        // so the deck ends on real content.
        try {
          const host = containerRef.current;
          if (host) {
            const slideEls = Array.from(
              host.querySelectorAll<HTMLElement>('[class*="pptx-preview-slide-wrapper"]'),
            );
            slideEls.forEach((el) => {
              const text = (el.textContent || "").toLowerCase();
              if (BOILERPLATE_SLIDE_PATTERNS.some((re) => re.test(text))) el.remove();
            });
          }
        } catch {
          /* ignore cleanup issues */
        }
        if (!cancelled) setLoading(false);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "Could not load preview");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <header className="flex items-center gap-3 px-4 py-3 shrink-0">
        <button
          onClick={onBack}
          className="h-9 w-9 rounded-full text-foreground/80 hover:text-foreground flex items-center justify-center shrink-0 transition"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-foreground truncate">{chatName || "—"}</span>
      </header>

      <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 sm:py-4 sm:px-3">
        {loading && (
          <div className="flex flex-col items-center gap-3 text-foreground/70 mt-20">
            <Loader2 className="w-8 h-8 animate-spin" />
            <div className="text-sm">Loading presentation…</div>
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center gap-3 text-foreground/70 mt-20 max-w-md mx-auto text-center">
            <div className="text-sm text-red-400">⚠ {error}</div>
            <a
              href={url}
              download
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-foreground text-background font-semibold text-[13px] hover:bg-foreground/90 transition active:scale-[0.98]"
            >
              <Download className="w-4 h-4" /> Download file instead
            </a>
          </div>
        )}
        <div ref={containerRef} className={`pptx-host ${loading || error ? "hidden" : ""}`} />
      </div>
      <style>{`
        .pptx-host .pptx-preview-wrapper { height: auto !important; max-height: none !important; overflow: visible !important; display: flex !important; flex-direction: column; align-items: center; gap: 20px; background: transparent !important; }
        .pptx-host [class*="pptx-preview-slide-wrapper"] { display: block !important; position: relative !important; left: auto !important; top: auto !important; transform: none !important; opacity: 1 !important; visibility: visible !important; margin: 0 auto !important; background: #fff; box-shadow: 0 10px 40px rgba(0,0,0,0.4); border-radius: 8px; overflow: hidden; flex-shrink: 0; }
        .pptx-host .pptx-preview-wrapper-pagination, .pptx-host .pptx-preview-wrapper-next { display: none !important; }
      `}</style>

      <footer
        className="shrink-0 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] flex items-center justify-center gap-3 border-t border-foreground/10"
        // dir removed — footer inherits document direction so RTL layouts don't get a mirrored bar
        style={{
          background: "hsl(var(--foreground) / 0.09)",
          backdropFilter: "blur(22px) saturate(180%) brightness(1.06)",
          WebkitBackdropFilter: "blur(22px) saturate(180%) brightness(1.06)",
          boxShadow:
            "inset 0 1px 1px 0 hsl(var(--foreground) / 0.25), inset 0 -1px 1px 0 hsl(var(--foreground) / 0.08), 0 -14px 36px hsl(0 0% 0% / 0.3)",
        }}
      >
        <a
          href={url}
          download
          className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full text-sm font-semibold tracking-wide transition active:scale-[0.98] bg-foreground text-background hover:bg-foreground/90"
        >
          <Download className="w-4 h-4" />
          Download
        </a>
        <button
          type="button"
          onClick={() =>
            sharePptx(url, `${chatName.replace(/\s+/g, "-").slice(0, 40) || "presentation"}.pptx`)
          }
          className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full text-sm font-semibold tracking-wide transition active:scale-[0.98] bg-foreground/10 hover:bg-foreground/18 text-foreground border border-foreground/10"
        >
          <Share2 className="w-4 h-4" />
          Share
        </button>
      </footer>
    </div>
  );
};

export default StandardSlidesCard;
