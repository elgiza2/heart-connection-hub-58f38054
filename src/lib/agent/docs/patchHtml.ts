// Universal HTML patcher for generated documents.
// Goals:
// 1) Inject a Google Fonts preconnect + a multi-script font stack so that
//    Arabic / CJK / Hebrew / Devanagari / Cyrillic / Latin all shape correctly
//    even if the generated HTML forgot to declare an appropriate font.
// 2) Provide a single "preview reset" so docs sit flush inside our iframes.
// 3) Provide a "print reset" that the browser respects when saving as PDF.
//
// The same patch is used in: live preview thumbnail, full-screen viewer,
// and the PDF/print pipeline. That guarantees text rendering parity.

const UNIVERSAL_FONTS_HREF =
  "https://fonts.googleapis.com/css2?" +
  [
    "family=Inter:wght@300;400;500;600;700;800;900",
    "family=Space+Grotesk:wght@400;500;600;700",
    "family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700",
    "family=Cairo:wght@400;600;700;800;900",
    "family=Tajawal:wght@400;500;700;800",
    "family=Noto+Naskh+Arabic:wght@400;500;600;700",
    "family=Noto+Sans+Arabic:wght@400;500;600;700;800",
    "family=Noto+Sans+Hebrew:wght@400;500;700",
    "family=Noto+Sans+Devanagari:wght@400;500;700",
    "family=Noto+Sans+Thai:wght@400;500;700",
    "family=Noto+Sans+SC:wght@400;500;700",
    "family=Noto+Sans+JP:wght@400;500;700",
    "family=Noto+Sans+KR:wght@400;500;700",
    "family=Noto+Color+Emoji",
    "display=swap",
  ].join("&");

const UNIVERSAL_HEAD = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${UNIVERSAL_FONTS_HREF}">
<style id="__lov_universal_fonts">
  /* Universal multi-script fallback chain — applied at the lowest specificity
     so the document's own font choices still win, but any unresolved glyph
     falls back to a script-appropriate font instead of a system default that
     breaks Arabic/CJK shaping. */
  :root{
    --lov-font-fallback:
      "Inter","Space Grotesk",
      "IBM Plex Sans Arabic","Cairo","Tajawal","Noto Naskh Arabic","Noto Sans Arabic",
      "Noto Sans Hebrew","Noto Sans Devanagari","Noto Sans Thai",
      "Noto Sans SC","Noto Sans JP","Noto Sans KR",
      "Noto Color Emoji",
      system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
  }
  html,body{font-family:var(--lov-font-fallback);text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;font-feature-settings:"liga","kern","calt";font-variant-ligatures:common-ligatures contextual;unicode-bidi:plaintext}
  /* Force every element to inherit the fallback chain when its own font isn't loaded */
  *{font-family:inherit}
  /* Improve image safety: avoid layout shift if a cross-origin image fails */
  img{max-width:100%;height:auto}
</style>
<style id="__lov_preview_reset">
  html,body{margin:0!important;padding:0!important;min-height:0!important;height:auto!important;background:#fff!important;display:block!important;overflow:visible!important}
  .page{margin:0 auto!important;box-shadow:none!important}
</style>
<style id="__lov_print_reset" media="print">
  @page{size:A4;margin:0}
  html,body{background:#fff!important;margin:0!important;padding:0!important}
  .page{margin:0!important;box-shadow:none!important;page-break-after:always;break-after:page}
  .page:last-child{page-break-after:auto;break-after:auto}
  /* avoid breaking headings and tables across pages */
  h1,h2,h3,h4,thead,tr{page-break-inside:avoid;break-inside:avoid}
</style>
`;

/** Detects if HTML contains a meaningful amount of Arabic (or other RTL) text. */
function hasRtlContent(html: string): boolean {
  // Strip tags for a rough content-only check, then look for RTL scripts:
  // Arabic (0600-06FF), Arabic Supplement (0750-077F), Extended-A (08A0-08FF),
  // Hebrew (0590-05FF).
  const text = html.replace(/<[^>]+>/g, "");
  const rtlChars = text.match(/[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g);
  return !!rtlChars && rtlChars.length >= 8;
}

/** Ensures the top-level <html> tag carries dir="rtl" lang="ar" when appropriate. */
function ensureHtmlDir(html: string): string {
  if (!hasRtlContent(html)) return html;
  if (/<html[^>]*\sdir=/i.test(html)) return html;
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1 dir="rtl" lang="ar">`);
  }
  return `<!doctype html><html dir="rtl" lang="ar">${html}`;
}

/** Inject universal fonts + preview/print resets. Idempotent. */
export function patchDocHtml(html: string): string {
  if (!html) return html;
  const withDir = ensureHtmlDir(html);
  if (withDir.includes("__lov_universal_fonts")) return withDir;
  if (/<\/head\s*>/i.test(withDir)) {
    return withDir.replace(/<\/head\s*>/i, `${UNIVERSAL_HEAD}</head>`);
  }
  if (/<body[^>]*>/i.test(withDir)) {
    return withDir.replace(/<body[^>]*>/i, (m) => `${m}${UNIVERSAL_HEAD}`);
  }
  return `<!doctype html><html dir="${hasRtlContent(html) ? "rtl" : "ltr"}"><head><meta charset="utf-8">${UNIVERSAL_HEAD}</head><body>${html}</body></html>`;
}

/** Wait until fonts and images inside the iframe are fully ready. */
export async function waitForIframeReady(
  iframe: HTMLIFrameElement,
  timeoutMs = 6000,
): Promise<void> {
  const start = Date.now();
  await new Promise<void>((res) => {
    if (iframe.contentDocument?.readyState === "complete") return res();
    const onLoad = () => res();
    iframe.addEventListener("load", onLoad, { once: true });
    setTimeout(res, timeoutMs);
  });
  const doc = iframe.contentDocument;
  if (!doc) return;
  try {
    await (doc as Document & { fonts?: FontFaceSet }).fonts?.ready;
  } catch {
    /* ignore */
  }
  try {
    await Promise.all(
      Array.from(doc.images).map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>((r) => {
          img.addEventListener("load", () => r(), { once: true });
          img.addEventListener("error", () => r(), { once: true });
          setTimeout(r, Math.max(500, timeoutMs - (Date.now() - start)));
        });
      }),
    );
  } catch {
    /* ignore */
  }
  // double rAF so layout settles after font swap
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}
