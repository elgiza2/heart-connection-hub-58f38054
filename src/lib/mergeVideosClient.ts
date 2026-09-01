/** @doc Client-side video merger using ffmpeg.wasm (runs in browser, supports Workers). */
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const ff = new FFmpeg();
    if (onLog) ff.on("log", ({ message }) => onLog(message));
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
    await ff.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegInstance = ff;
    return ff;
  })();

  return loadPromise;
}

export interface MergeProgress {
  stage: "loading" | "downloading" | "encoding" | "done";
  progress?: number;
  message?: string;
}

export async function mergeVideosInBrowser(
  urls: string[],
  onProgress?: (p: MergeProgress) => void,
): Promise<Blob> {
  if (urls.length < 2) throw new Error("Need at least 2 clips to merge");

  onProgress?.({ stage: "loading", message: "Loading ffmpeg…" });
  const ff = await getFFmpeg();

  ff.on("progress", ({ progress }) => {
    onProgress?.({ stage: "encoding", progress });
  });

  onProgress?.({ stage: "downloading", message: "Downloading clips…" });
  const inputNames: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const name = `in_${i}.mp4`;
    const data = await fetchFile(urls[i]);
    await ff.writeFile(name, data);
    inputNames.push(name);
  }

  // Build concat demuxer file
  const list = inputNames.map((n) => `file '${n}'`).join("\n");
  await ff.writeFile("list.txt", new TextEncoder().encode(list));

  onProgress?.({ stage: "encoding", message: "Merging…" });
  // Re-encode for safety (different codecs/resolutions across clips).
  await ff.exec([
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    "list.txt",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    "out.mp4",
  ]);

  const out = await ff.readFile("out.mp4");
  onProgress?.({ stage: "done" });

  // Cleanup
  for (const n of inputNames) {
    try {
      await ff.deleteFile(n);
    } catch {
      /* ignore */
    }
  }
  try {
    await ff.deleteFile("list.txt");
    await ff.deleteFile("out.mp4");
  } catch {
    /* ignore */
  }

  const src = typeof out === "string" ? new TextEncoder().encode(out) : (out as Uint8Array);
  const arr = new Uint8Array(src.byteLength);
  arr.set(src);
  return new Blob([arr.buffer], { type: "video/mp4" });
}
