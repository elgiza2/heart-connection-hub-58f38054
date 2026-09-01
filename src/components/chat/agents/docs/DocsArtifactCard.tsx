// Free-form Docs artifact card. Visual language matches SlidesDeckCard:
// a compact cover thumbnail (small slice of the real A4 preview) that opens
// the full-screen viewer on click — same vibe as the slides preview.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { toast } from "sonner";
import { loadDocHtml } from "@/lib/agent/docs/htmlCache";
import { patchDocHtml, waitForIframeReady } from "@/lib/agent/docs/patchHtml";
import oilPreviewCover from "@/assets/docs/oil-preview-cover.jpg";

interface Props {
  /** Local cache id — html lives in localStorage under this key. */
  artifactId: string;
  title: string;
  docType: string;
  /** Optional inline html (when message just arrived and cache may not be hydrated yet). */
  html?: string;
}

export default function DocsArtifactCard({ artifactId, title, docType, html: inlineHtml }: Props) {
  const navigate = useNavigate();
  const [html, setHtml] = useState<string | null>(inlineHtml ?? null);
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    if (inlineHtml) setHtml(inlineHtml);
  }, [inlineHtml]);

  useEffect(() => {
    if (html) return;
    const cached = loadDocHtml(artifactId);
    if (cached) setHtml(cached);
  }, [artifactId, html]);

  const isStreaming = !!html && html.length < 2000 && !/<\/html\s*>/i.test(html);

  const filenameBase = useMemo(() => {
    const safe = (title || "document").replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 60);
    return safe || "document";
  }, [title]);

  const downloadHtml = () => {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filenameBase}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadPdf = async () => {
    if (!html) {
      toast.error("No content to download");
      return;
    }
    setExportingPdf(true);
    toast.loading("Rendering PDF…", { id: "pdf-export" });
    try {
      const { renderDocPdf } = await import("@/lib/agent/docs/renderPdf");
      const patched = patchDocHtml(html);
      const data = await renderDocPdf({ html: patched, title: filenameBase });
      if (!data?.url) throw new Error("render failed");

      const resp = await fetch(data.url);
      if (!resp.ok) throw new Error(`download failed (${resp.status})`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filenameBase}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success("PDF downloaded", { id: "pdf-export" });
    } catch (e) {
      console.error("[docs] downloadPdf via Transactional failed, falling back", e);
      toast.loading("Opening Save as PDF dialog…", { id: "pdf-export" });
      try {
        const patched = patchDocHtml(html);
        const iframe = document.createElement("iframe");
        iframe.style.cssText =
          "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none";
        iframe.setAttribute("aria-hidden", "true");
        iframe.title = filenameBase;
        document.body.appendChild(iframe);
        iframe.srcdoc = patched;
        await waitForIframeReady(iframe, 8000);
        try {
          const idoc = iframe.contentDocument;
          if (idoc) idoc.title = filenameBase;
        } catch {
          /* ignore */
        }
        const win = iframe.contentWindow;
        if (!win) throw new Error("iframe contentWindow missing");
        const cleanup = () => {
          setTimeout(() => {
            try {
              document.body.removeChild(iframe);
            } catch {
              /* ignore */
            }
          }, 1000);
        };
        win.addEventListener("afterprint", cleanup, { once: true });
        win.focus();
        win.print();
        toast.success('Choose "Save as PDF" from the print dialog', { id: "pdf-export" });
        setTimeout(cleanup, 60_000);
      } catch (fallbackErr) {
        console.error("[docs] print fallback failed", fallbackErr);
        toast.error("Could not create PDF — try downloading as HTML", { id: "pdf-export" });
      }
    } finally {
      setExportingPdf(false);
    }
  };

  const print = () => {
    if (!html) {
      toast.error("No content to print");
      return;
    }
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Pop-ups are blocked — enable them to print");
      return;
    }
    const patched = patchDocHtml(html);
    w.document.open();
    w.document.write(patched);
    w.document.close();
    try {
      w.document.title = filenameBase;
    } catch {
      /* ignore */
    }
    const tryPrint = () => {
      try {
        w.focus();
        w.print();
      } catch (e) {
        console.error(e);
      }
    };
    w.addEventListener("load", () => {
      const fontsReady = (w.document as Document & { fonts?: FontFaceSet }).fonts?.ready;
      if (fontsReady) fontsReady.then(tryPrint).catch(tryPrint);
      else setTimeout(tryPrint, 600);
    });
  };

  const openFull = () => {
    if (!isStreaming && html) {
      navigate(`/document/${artifactId}`, { state: { html, title, docType } });
    }
  };

  return (
      <div className="mt-3 max-w-xl overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_18px_45px_hsl(var(--background)/0.16)]">
        <button
          onClick={openFull}
          disabled={!html || isStreaming}
          aria-label="Open preview"
          className="relative block w-full aspect-[16/9] overflow-hidden bg-muted disabled:cursor-default"
        >
          <img decoding="async"
            src={oilPreviewCover}
            alt="Smooth oil-painted document preview cover"
            width={1200}
            height={760}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover object-center opacity-95"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/35 via-transparent to-background/5" />
          {html ? (
            <>
              {isStreaming && (
                <div className="absolute inset-0 flex items-end justify-center p-4">
                  <div className="inline-flex h-8 items-center gap-2 rounded-full border border-border/70 bg-card/90 px-4 text-[11.5px] font-medium text-foreground shadow-sm backdrop-blur-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    <span>Generating live…</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[12px] font-medium text-foreground">
              Preview is not available now
            </div>
          )}
        </button>

        <div className="space-y-3 px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold text-foreground">{title}</div>
            <div className="mt-0.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">
              {docType}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={downloadHtml}
              disabled={!html}
              className="h-9 rounded-lg border border-border bg-background px-3 text-[12px] font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45"
            >
              HTML
            </button>
            <button
              onClick={downloadPdf}
              disabled={!html || exportingPdf}
              className="h-9 rounded-lg border border-border bg-background px-3 text-[12px] font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45"
            >
              {exportingPdf ? "Preparing…" : "PDF"}
            </button>
            <button
              onClick={openFull}
              disabled={!html || isStreaming}
              className="h-9 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Preview
            </button>
          </div>
        </div>
      </div>
  );
}
