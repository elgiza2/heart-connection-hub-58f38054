/** @doc Client-side image compression: downscale + re-encode (WebP if supported)
 *  to shrink chat payloads before base64 upload. Reduces typical 5–20MB photos
 *  to <300KB while preserving legibility for vision models. Falls back to the
 *  original file if the browser can't decode it (SVG, HEIC, etc.). */

const MAX_DIMENSION = 1568; // Qwen-VL sweet spot; keeps small text legible.
const QUALITY = 0.82;
const TARGET_MIME_FALLBACK = "image/jpeg";

async function pickTargetMime(): Promise<string> {
  // Chrome/Edge/Firefox/Safari 14+ support WebP encode.
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/webp", 0.5));
    if (blob && blob.type === "image/webp") return "image/webp";
  } catch {
    // ignore
  }
  return TARGET_MIME_FALLBACK;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/**
 * Compresses an image file to a data URL suitable for base64 chat payloads.
 * Skips compression for tiny files (<200KB) and non-decodable formats.
 * Returns { dataUrl, originalSize, compressedSize }.
 */
export async function compressImageToDataUrl(file: File): Promise<{
  dataUrl: string;
  originalSize: number;
  compressedSize: number;
  skipped: boolean;
}> {
  const originalSize = file.size;

  // Skip: small already, or format the canvas can't decode.
  const undecodable = /svg|heic|heif|tiff/i.test(file.type);
  if (originalSize < 200 * 1024 || undecodable) {
    const dataUrl = await fileToDataUrl(file);
    return { dataUrl, originalSize, compressedSize: originalSize, skipped: true };
  }

  try {
    const bitmap = await createImageBitmap(file).catch(() => null);
    let width: number;
    let height: number;
    let source: CanvasImageSource;

    if (bitmap) {
      width = bitmap.width;
      height = bitmap.height;
      source = bitmap;
    } else {
      // Fallback for browsers without createImageBitmap support.
      const img = new Image();
      const url = URL.createObjectURL(file);
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("decode failed"));
        img.src = url;
      });
      URL.revokeObjectURL(url);
      width = img.naturalWidth;
      height = img.naturalHeight;
      source = img;
    }

    // Scale down so the longest edge ≤ MAX_DIMENSION.
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d ctx");
    ctx.drawImage(source, 0, 0, targetW, targetH);

    const mime = await pickTargetMime();
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, mime, QUALITY));
    if (!blob) throw new Error("encode failed");

    // If somehow larger than original, keep original.
    if (blob.size >= originalSize) {
      const dataUrl = await fileToDataUrl(file);
      return { dataUrl, originalSize, compressedSize: originalSize, skipped: true };
    }

    const dataUrl = await blobToDataUrl(blob);
    return { dataUrl, originalSize, compressedSize: blob.size, skipped: false };
  } catch {
    const dataUrl = await fileToDataUrl(file);
    return { dataUrl, originalSize, compressedSize: originalSize, skipped: true };
  }
}
