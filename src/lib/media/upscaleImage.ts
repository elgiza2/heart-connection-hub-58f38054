// تكبير دقة Images (Upscale) داخل المتصفح بدون أي خدمة خارجية.
// تكبير تدريجي بخطوات ×2 مع إعادة تشكيل ناعمة ثم تحسين حدة خفيف.

const MAX_SIDE = 4096;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { c, ctx };
}

function sharpen(ctx: CanvasRenderingContext2D, w: number, h: number, amount = 0.35) {
  const src = ctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  const s = src.data;
  const d = out.data;
  const k = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        let acc = 0;
        let ki = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++, ki++) {
            const px = Math.min(w - 1, Math.max(0, x + dx));
            const py = Math.min(h - 1, Math.max(0, y + dy));
            acc += s[(py * w + px) * 4 + ch] * k[ki];
          }
        }
        const base = s[i + ch];
        d[i + ch] = Math.max(0, Math.min(255, base + (acc - base) * amount));
      }
      d[i + 3] = s[i + 3];
    }
  }
  ctx.putImageData(out, 0, 0);
}

export interface UpscaleResult {
  dataUrl: string;
  width: number;
  height: number;
  scale: number;
}

/** يكبّر Imagesة بالمقدار المطلوب (2 أو 4) مع حد أقصى 4096px للضلع. */
export async function upscaleImage(
  input: File | Blob | string,
  scale: 2 | 4 = 2,
): Promise<UpscaleResult> {
  const src = typeof input === "string" ? input : URL.createObjectURL(input);
  try {
    const img = await loadImage(src);
    const sw = img.naturalWidth || img.width;
    const sh = img.naturalHeight || img.height;
    if (!sw || !sh) throw new Error("bad image");

    const maxScale = Math.max(1, Math.min(scale, MAX_SIDE / Math.max(sw, sh)));
    const target = { w: Math.round(sw * maxScale), h: Math.round(sh * maxScale) };

    let { c, ctx } = makeCanvas(sw, sh);
    ctx.drawImage(img, 0, 0, sw, sh);

    // تكبير تدريجي ×2 لجودة أفضل من قفزة واحدة
    let cw = sw;
    let ch = sh;
    while (cw < target.w) {
      const nw = Math.min(target.w, cw * 2);
      const nh = Math.min(target.h, Math.round((nw / target.w) * target.h));
      const next = makeCanvas(nw, nh);
      next.ctx.drawImage(c, 0, 0, nw, nh);
      c = next.c;
      ctx = next.ctx;
      cw = nw;
      ch = nh;
    }

    if (cw !== target.w || ch !== target.h) {
      const fin = makeCanvas(target.w, target.h);
      fin.ctx.drawImage(c, 0, 0, target.w, target.h);
      c = fin.c;
      ctx = fin.ctx;
    }

    if (target.w * target.h <= 12_000_000) {
      try {
        sharpen(ctx, c.width, c.height);
      } catch {
        /* تجاهل التحسين لو فشل */
      }
    }

    return {
      dataUrl: c.toDataURL("image/png"),
      width: c.width,
      height: c.height,
      scale: maxScale,
    };
  } finally {
    if (typeof input !== "string") URL.revokeObjectURL(src);
  }
}
