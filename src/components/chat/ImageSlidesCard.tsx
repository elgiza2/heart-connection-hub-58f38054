// Renders an image-based slide deck (PDF) generated via 2slides.com API.
// Uses pdfjs-dist to render the first page as preview and all pages in modal.

import { useEffect, useRef, useState } from "react";
import { m as motion, AnimatePresence } from "framer-motion";
import { Download, Eye, ArrowLeft, Loader2, Share2 } from "lucide-react";
import MegsyStar from "@/components/files/MegsyStar";
import { supabase } from "@/integrations/supabase/client";
import { useFullscreenBodyClass } from "@/hooks/useFullscreenBodyClass";

interface Props {
  title: string;
  url: string;
  slideCount?: number;
  chatName?: string;
}

// Lazy-load pdfjs and configure worker
async function loadPdfjs() {
  const pdfjs: any = await import("pdfjs-dist");
  // @ts-ignore - vite worker import
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

// Fetch the PDF bytes. Try direct first (some CDNs allow CORS), then fall
// back to our edge-function proxy that streams the bytes with CORS headers.
async function fetchPdfBytes(url: string): Promise<Uint8Array> {
  // 1) Direct attempt — fastest when the CDN serves CORS.
  try {
    const r = await fetch(url, { mode: "cors" });
    if (r.ok) return new Uint8Array(await r.arrayBuffer());
  } catch {
    /* fall through to proxy */
  }

  // 2) Proxy via slides-api (returns application/pdf with CORS headers).
  const { data, error } = await supabase.functions.invoke("slides-api", {
    body: { action: "images_pdf", url },
  });
  if (error) throw new Error(error.message || "proxy failed");
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data && typeof (data as any).arrayBuffer === "function") {
    return new Uint8Array(await (data as any).arrayBuffer());
  }
  throw new Error("Unexpected proxy response");
}

async function renderPdfPageToDataUrl(
  url: string,
  pageNumber: number,
  scale = 1.2,
): Promise<string> {
  const pdfjs = await loadPdfjs();
  const data = await fetchPdfBytes(url);
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.85);
}

const ImageSlidesCard = ({ title, url, slideCount, chatName }: Props) => {
  const [open, setOpen] = useState(false);
  useFullscreenBodyClass(open);

  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    renderPdfPageToDataUrl(url, 1, 1.0)
      .then((dataUrl) => {
        if (!cancelled) setPreview(dataUrl);
      })
      .catch((e) => {
        console.warn("[ImageSlidesCard] preview failed:", e);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <>
      <div className="slides-card-shell mt-3 group relative max-w-[420px] transition-all duration-300 hover:border-border/80">
        <button
          onClick={() => setOpen(true)}
          className="slides-card-preview relative block w-full aspect-[16/9] overflow-hidden cursor-pointer"
          style={
            preview
              ? { backgroundColor: "#fff" }
              : { background: "linear-gradient(135deg, #1e1b4b, #581c87)" }
          }
        >
          {preview && (
            <img decoding="async"
              src={preview}
              alt={title}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
          )}
          {!preview && (
            <div className="absolute inset-0 flex items-center justify-center text-foreground/70">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}
        </button>

        <div className="slides-card-actions px-4 pb-4 pt-4 flex gap-2">
          <button
            onClick={() => setOpen(true)}
            className="slides-card-button slides-card-button--accent flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium active:scale-[0.98]"
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

      <AnimatePresence>
        {open && (
          <PdfPreviewModal url={url} chatName={chatName || title} onClose={() => setOpen(false)} />
        )}
      </AnimatePresence>
    </>
  );
};

interface ModalProps {
  url: string;
  chatName: string;
  onClose: () => void;
}

const PdfPreviewModal = ({ url, chatName, onClose }: ModalProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const data = await fetchPdfBytes(url);
        const pdf = await pdfjs.getDocument({ data }).promise;
        const total = pdf.numPages;
        const targetWidth = Math.min(window.innerWidth - 24, 1400);
        const out: string[] = [];
        for (let i = 1; i <= total; i++) {
          if (cancelled) return;
          const page = await pdf.getPage(i);
          const baseVp = page.getViewport({ scale: 1 });
          const scale = targetWidth / baseVp.width;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport }).promise;
          out.push(canvas.toDataURL("image/jpeg", 0.85));
          if (!cancelled) setPages([...out]);
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

  const fileName = `${(chatName || "presentation").replace(/\s+/g, "-").slice(0, 40)}.pdf`;

  const handleShare = async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const file = new File([blob], fileName, { type: "application/pdf" });
      const text = "This presentation was designed with Megsy — try it free: https://megsy.ai";
      const navAny: any = navigator;
      if (navAny.canShare && navAny.canShare({ files: [file] })) {
        await navAny.share({ files: [file], title: chatName, text });
        return;
      }
      if (navAny.share) {
        await navAny.share({ title: chatName, text: `${text}\n${url}`, url });
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${url}`);
    } catch {
      /* noop */
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-toast bg-background flex flex-col"
    >
      <header className="flex items-center gap-3 px-4 py-3 shrink-0">
        <button
          onClick={onClose}
          className="h-9 w-9 rounded-full text-foreground/80 hover:text-foreground flex items-center justify-center shrink-0 transition"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-foreground truncate">{chatName || "—"}</span>
      </header>

      <div className="flex-1 px-3 sm:px-6 min-h-0 overflow-y-auto overflow-x-hidden">
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

        <div ref={containerRef} className="flex flex-col items-center gap-5 py-4">
          {pages.map((src, i) => (
            <img loading="lazy" decoding="async"
              key={i}
              src={src}
              alt={`slide ${i + 1}`}
              className="max-w-full rounded-lg shadow-[0_10px_40px_rgba(0,0,0,0.4)] bg-white"
            />
          ))}
          {loading && (
            <div className="flex flex-col items-center gap-3 text-foreground/70 mt-10">
              <MegsyStar size={32} />
              <div className="text-sm">Loading presentation…</div>
            </div>
          )}
        </div>
      </div>

      <footer
        className="shrink-0 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] flex items-center justify-center gap-3 border-t border-foreground/10"
        dir="ltr"
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
          download={fileName}
          className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full text-sm font-semibold tracking-wide transition active:scale-[0.98] bg-foreground text-background hover:bg-foreground/90"
        >
          <Download className="w-4 h-4" />
          Download
        </a>
        <button
          type="button"
          onClick={handleShare}
          className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full text-sm font-semibold tracking-wide transition active:scale-[0.98] bg-foreground/10 hover:bg-foreground/18 text-foreground border border-foreground/10"
        >
          <Share2 className="w-4 h-4" />
          Share
        </button>
      </footer>
    </motion.div>
  );
};

export default ImageSlidesCard;
