import type { SlideDeck, SlideData } from "@/components/chat/SlidesDeckCard";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const renderSlideHtml = (slide: SlideData, palette: SlideDeck["palette"], dir: "ltr" | "rtl") => {
  const isQuote = slide.type === "quote";
  const isStats = slide.type === "stats";
  const isCover = slide.type === "cover";
  const isClosing = slide.type === "closing";

  let body = "";
  if (slide.kicker) {
    body += `<span class="kicker" style="color:${palette.accent}">${escapeHtml(slide.kicker)}</span>`;
  }
  if (isQuote) {
    body += `<div class="quote-mark" style="color:${palette.accent}">&ldquo;</div>`;
    body += `<p class="quote">${escapeHtml(slide.quote || slide.body || "")}</p>`;
    if (slide.attribution) body += `<p class="attr">— ${escapeHtml(slide.attribution)}</p>`;
  } else if (isStats && slide.stats?.length) {
    if (slide.title) body += `<h2>${escapeHtml(slide.title)}</h2>`;
    body += `<div class="stats">`;
    slide.stats.slice(0, 6).forEach((s) => {
      body += `<div class="stat"><div class="stat-val" style="color:${palette.accent}">${escapeHtml(s.value)}</div><div class="stat-lbl">${escapeHtml(s.label)}</div></div>`;
    });
    body += `</div>`;
  } else {
    if (slide.title)
      body += `<h2 class="${isCover ? "cover" : ""}">${escapeHtml(slide.title)}</h2>`;
    if (slide.subtitle) body += `<p class="subtitle">${escapeHtml(slide.subtitle)}</p>`;
    if (slide.body && !isCover) body += `<p class="body">${escapeHtml(slide.body)}</p>`;
    if (slide.bullets?.length) {
      body += `<ul>`;
      slide.bullets.forEach((b) => {
        body += `<li><span class="dot" style="background:${palette.accent}"></span><span>${escapeHtml(b)}</span></li>`;
      });
      body += `</ul>`;
    }
    if (isClosing && slide.cta) {
      body += `<div class="cta" style="background:${palette.accent};color:${palette.bg}">${escapeHtml(slide.cta)}</div>`;
    }
  }

  const sideImg =
    !isCover && !isClosing && !isQuote && !isStats && slide.image
      ? `<div class="side-img"><img src="${escapeHtml(slide.image)}" alt=""/><div class="side-fade" style="background:linear-gradient(${dir === "rtl" ? "270deg" : "90deg"},${palette.bg},transparent 60%)"></div></div>`
      : "";

  const coverImg =
    isCover && slide.image
      ? `<img class="cover-img" src="${escapeHtml(slide.image)}" alt=""/><div class="cover-fade" style="background:linear-gradient(135deg,${palette.bg}ee,${palette.bg}aa 60%,transparent)"></div>`
      : "";

  return `<section class="slide" style="background:${palette.bg};color:${palette.fg};direction:${dir}">${coverImg}${sideImg}<div class="content">${body}</div></section>`;
};

export const buildDeckHtml = (deck: SlideDeck): string => {
  const dir: "ltr" | "rtl" = deck.language?.startsWith("ar") ? "rtl" : "ltr";
  const slidesHtml = deck.slides.map((s) => renderSlideHtml(s, deck.palette, dir)).join("\n");

  return `<!DOCTYPE html>
<html lang="${deck.language || "en"}" dir="${dir}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(deck.title)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;color:#f5f5f5}
.deck{display:flex;flex-direction:column;align-items:center;gap:24px;padding:32px 16px;min-height:100vh}
.toolbar{position:sticky;top:16px;z-index:10;display:flex;gap:8px;background:rgba(20,20,20,.85);backdrop-filter:blur(14px);padding:10px 16px;border-radius:999px;border:1px solid rgba(255,255,255,.08)}
.toolbar button{appearance:none;border:0;background:transparent;color:#fff;font:inherit;font-size:13px;font-weight:600;padding:6px 12px;border-radius:999px;cursor:pointer;transition:background .15s}
.toolbar button:hover{background:rgba(255,255,255,.1)}
.toolbar .num{font-size:12px;opacity:.6;align-self:center;margin:0 6px;font-variant-numeric:tabular-nums}
.viewport{width:100%;max-width:1200px;aspect-ratio:16/9;position:relative;border-radius:18px;overflow:hidden;box-shadow:0 30px 80px -20px rgba(0,0,0,.6)}
.slide{position:absolute;inset:0;display:flex;overflow:hidden;opacity:0;pointer-events:none;transition:opacity .3s}
.slide.active{opacity:1;pointer-events:auto}
.slide .cover-img,.side-img img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.slide .cover-img{opacity:.32}
.slide .cover-fade{position:absolute;inset:0}
.side-img{order:2;position:relative;width:42%;height:100%;flex-shrink:0}
.side-fade{position:absolute;inset:0}
.slide .content{position:relative;z-index:2;flex:1;padding:6vw 7vw;display:flex;flex-direction:column;justify-content:center;gap:14px;order:1}
.slide .kicker{font-size:.78rem;font-weight:800;letter-spacing:.3em;text-transform:uppercase;opacity:.85}
.slide h2{font-size:clamp(1.6rem,3.4vw,2.6rem);font-weight:800;line-height:1.1}
.slide h2.cover{font-size:clamp(2rem,5vw,4rem)}
.slide .subtitle{font-size:clamp(1rem,1.6vw,1.3rem);opacity:.85}
.slide .body{font-size:clamp(.95rem,1.2vw,1.05rem);line-height:1.6;opacity:.9;max-width:42em}
.slide ul{list-style:none;display:flex;flex-direction:column;gap:.6rem;max-width:42em}
.slide li{display:flex;gap:.8rem;align-items:flex-start;font-size:clamp(.95rem,1.2vw,1.05rem);line-height:1.5}
.slide .dot{width:8px;height:8px;border-radius:999px;margin-top:.55rem;flex-shrink:0}
.slide .quote-mark{font-size:5rem;line-height:1;font-weight:700}
.slide .quote{font-size:clamp(1.2rem,2.2vw,1.8rem);font-weight:600;line-height:1.35}
.slide .attr{margin-top:.4rem;opacity:.7;font-size:.95rem}
.slide .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin-top:1rem}
.slide .stat{padding:1rem 1.2rem;border-radius:14px;background:rgba(255,255,255,.06)}
.slide .stat-val{font-size:1.8rem;font-weight:800}
.slide .stat-lbl{font-size:.78rem;opacity:.8;margin-top:.2rem}
.slide .cta{align-self:flex-start;margin-top:1rem;padding:.7rem 1.4rem;border-radius:999px;font-weight:700;font-size:.95rem}
.title{color:#fff;font-size:14px;font-weight:600;opacity:.8;text-align:center}
@media(max-width:760px){.side-img{display:none}.slide .content{width:100%}}
@media print{.toolbar{display:none}.viewport{break-inside:avoid;page-break-after:always;box-shadow:none;border-radius:0}.slide{opacity:1!important;position:relative;height:auto;aspect-ratio:16/9}.deck{padding:0;gap:0}}
</style></head>
<body>
<div class="deck">
<div class="title">${escapeHtml(deck.title)}${deck.subtitle ? " — " + escapeHtml(deck.subtitle) : ""}</div>
<div class="toolbar">
<button onclick="prev()">← Prev</button>
<span class="num"><span id="cur">1</span> / ${deck.slides.length}</span>
<button onclick="next()">Next →</button>
<button onclick="window.print()">Print / PDF</button>
</div>
<div class="viewport" id="vp">
${slidesHtml}
</div>
</div>
<script>
const slides=document.querySelectorAll('.slide');let i=0;
function show(n){i=Math.max(0,Math.min(slides.length-1,n));slides.forEach((s,k)=>s.classList.toggle('active',k===i));document.getElementById('cur').textContent=i+1;}
function next(){show(i+1);}function prev(){show(i-1);}
document.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key===' ')next();else if(e.key==='ArrowLeft')prev();});
show(0);
</script>
</body></html>`;
};

const downloadBlob = (data: BlobPart, mime: string, filename: string) => {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const exportDeckHtml = (deck: SlideDeck) => {
  const html = buildDeckHtml(deck);
  const safe = (deck.title || "deck").replace(/[^\w\u0600-\u06FF -]/g, "").trim() || "deck";
  downloadBlob(html, "text/html;charset=utf-8", `${safe}.html`);
};

export const exportDeckPptx = async (deck: SlideDeck) => {
  const mod = await import("pptxgenjs");
  const PptxGen: any = (mod as any).default || mod;
  const pptx = new PptxGen();
  // Detect Arabic (or any RTL script) in the deck and enable rtlMode so that
  // PowerPoint/Keynote render punctuation and alignment correctly.
  const deckText = [
    deck.title || "",
    deck.subtitle || "",
    ...(deck.slides || []).flatMap((s) => [s.title, s.body, s.kicker, s.quote, s.attribution].filter(Boolean) as string[]),
  ].join(" ");
  const isRtlDeck = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(deckText);
  if (isRtlDeck) {
    pptx.rtlMode = true;
  }
  pptx.defineLayout({ name: "MEGSY_169", width: 13.333, height: 7.5 });
  pptx.layout = "MEGSY_169";
  pptx.title = deck.title;

  const bg = deck.palette.bg;
  const fg = deck.palette.fg;
  const accent = deck.palette.accent;
  const hex = (c: string) => (c || "").replace("#", "").slice(0, 6).padEnd(6, "0");

  for (const s of deck.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: hex(bg) };
    const isCover = s.type === "cover";
    const isQuote = s.type === "quote";
    const isStats = s.type === "stats";
    const isClosing = s.type === "closing";

    let y = 0.6;
    if (s.kicker) {
      slide.addText(s.kicker, {
        x: 0.6,
        y,
        w: 12,
        h: 0.4,
        fontSize: 12,
        bold: true,
        color: hex(accent),
        charSpacing: 6,
      });
      y += 0.45;
    }

    if (isQuote) {
      slide.addText("\u201C", {
        x: 0.6,
        y,
        w: 1.5,
        h: 1.5,
        fontSize: 88,
        bold: true,
        color: hex(accent),
      });
      slide.addText(s.quote || s.body || "", {
        x: 0.6,
        y: y + 1.2,
        w: 12,
        h: 3.5,
        fontSize: 30,
        bold: true,
        color: hex(fg),
      });
      if (s.attribution) {
        slide.addText(`— ${s.attribution}`, {
          x: 0.6,
          y: y + 4.8,
          w: 12,
          h: 0.4,
          fontSize: 14,
          italic: true,
          color: hex(fg),
        });
      }
    } else if (isStats && s.stats?.length) {
      if (s.title) {
        slide.addText(s.title, {
          x: 0.6,
          y,
          w: 12,
          h: 0.7,
          fontSize: 28,
          bold: true,
          color: hex(fg),
        });
        y += 0.9;
      }
      const stats = s.stats.slice(0, 6);
      const cols = stats.length <= 3 ? stats.length : 3;
      const cellW = 12 / cols;
      stats.forEach((st, idx) => {
        const cx = 0.6 + (idx % cols) * cellW;
        const cy = y + Math.floor(idx / cols) * 1.8;
        slide.addText(st.value, {
          x: cx,
          y: cy,
          w: cellW - 0.2,
          h: 1,
          fontSize: 36,
          bold: true,
          color: hex(accent),
        });
        slide.addText(st.label, {
          x: cx,
          y: cy + 1,
          w: cellW - 0.2,
          h: 0.5,
          fontSize: 12,
          color: hex(fg),
        });
      });
    } else {
      if (s.title) {
        slide.addText(s.title, {
          x: 0.6,
          y,
          w: 12,
          h: isCover ? 1.6 : 1.1,
          fontSize: isCover ? 44 : 32,
          bold: true,
          color: hex(fg),
        });
        y += isCover ? 1.7 : 1.2;
      }
      if (s.subtitle) {
        slide.addText(s.subtitle, {
          x: 0.6,
          y,
          w: 12,
          h: 0.7,
          fontSize: 18,
          color: hex(fg),
          italic: true,
        });
        y += 0.8;
      }
      if (s.body && !isCover) {
        slide.addText(s.body, { x: 0.6, y, w: 12, h: 1.4, fontSize: 14, color: hex(fg) });
        y += 1.5;
      }
      if (s.bullets?.length) {
        slide.addText(
          s.bullets.map((b) => ({
            text: b,
            options: { bullet: { type: "bullet" }, color: hex(fg), fontSize: 14 },
          })),
          { x: 0.6, y, w: 12, h: 4, color: hex(fg) },
        );
      }
      if (isClosing && s.cta) {
        slide.addText(s.cta, {
          x: 0.6,
          y: 6.4,
          w: 4,
          h: 0.6,
          fontSize: 16,
          bold: true,
          color: hex(bg),
          fill: { color: hex(accent) },
          align: "center",
        });
      }
    }
  }

  const b64 = await pptx.write({ outputType: "base64" });
  const bin = atob(b64 as string);
  const bytes = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
  const safe = (deck.title || "deck").replace(/[^\w\u0600-\u06FF -]/g, "").trim() || "deck";
  downloadBlob(
    bytes,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    `${safe}.pptx`,
  );
};
