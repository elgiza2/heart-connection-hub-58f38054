/**
 * @doc Megsy Coder media pipeline — turns image/video placeholders inside a
 * generated project into REAL generated assets (hosted URLs), reports the
 * credit cost, and lets the user regenerate or attach their own media.
 *
 * Why tokens: the model used to "generate an image" as a separate chat artifact
 * that never landed inside the site. Now the model is instructed to emit
 * `{{MEGSY_IMAGE:description}}` / `{{MEGSY_VIDEO:description}}` wherever media
 * belongs, and this module resolves every token into a hosted URL and rewrites
 * the files in place.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ProjectFile } from "@/lib/extractProjectFiles";

export const IMAGE_CREDITS = 2;
export const VIDEO_CREDITS = 12;

export type CoderAssetKind = "image" | "video";

export interface CoderAssetRequest {
  /** Stable key = kind + normalised prompt, so duplicates generate once. */
  id: string;
  kind: CoderAssetKind;
  prompt: string;
  /** Exact tokens/urls in the source that must be replaced. */
  tokens: string[];
}

export interface CoderAsset extends CoderAssetRequest {
  status: "pending" | "running" | "done" | "error";
  url?: string;
  error?: string;
  credits: number;
}

const IMAGE_TOKEN_RE = /\{\{\s*MEGSY_IMAGE\s*:\s*([^}]+?)\s*\}\}/gi;
const VIDEO_TOKEN_RE = /\{\{\s*MEGSY_VIDEO\s*:\s*([^}]+?)\s*\}\}/gi;

/** Placeholder image services / obviously fake local paths the model invents. */
const PLACEHOLDER_SRC_RE =
  /(?:src|href|url\()\s*=?\s*["'(]?((?:https?:\/\/(?:via\.placeholder\.com|placehold\.co|placekitten\.com|dummyimage\.com)\/[^"')\s]+)|(?:\.?\/?(?:images?|img|assets|media|photos)\/[\w\-./]+\.(?:png|jpe?g|webp|gif|svg)))["')]?/gi;

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120);
}

function promptFromPath(path: string): string {
  const base = path.split("/").pop() || path;
  return base.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim() || "website illustration";
}

/**
 * Scan every project file for media that must exist. Returns de-duplicated
 * requests, each carrying the literal strings to replace.
 */
export function findAssetRequests(files: ProjectFile[], siteTopic = ""): CoderAssetRequest[] {
  const byId = new Map<string, CoderAssetRequest>();
  const add = (kind: CoderAssetKind, rawPrompt: string, token: string) => {
    const prompt = rawPrompt.trim();
    if (!prompt) return;
    const id = `${kind}:${slug(prompt)}`;
    const existing = byId.get(id);
    if (existing) {
      if (!existing.tokens.includes(token)) existing.tokens.push(token);
      return;
    }
    byId.set(id, { id, kind, prompt, tokens: [token] });
  };

  for (const f of files) {
    const content = f.content || "";
    for (const m of content.matchAll(IMAGE_TOKEN_RE)) add("image", m[1], m[0]);
    for (const m of content.matchAll(VIDEO_TOKEN_RE)) add("video", m[1], m[0]);
    if (/\.(html?|jsx?|tsx?|vue|svelte|css|md)$/i.test(f.path)) {
      for (const m of content.matchAll(PLACEHOLDER_SRC_RE)) {
        const url = m[1];
        if (!url) continue;
        const topic = siteTopic ? ` for a ${siteTopic} website` : "";
        add("image", `${promptFromPath(url)}${topic}`, url);
      }
    }
  }
  return Array.from(byId.values());
}

/** Total credit cost for a set of requests. */
export function estimateAssetCredits(reqs: Array<{ kind: CoderAssetKind }>): number {
  return reqs.reduce((n, r) => n + (r.kind === "video" ? VIDEO_CREDITS : IMAGE_CREDITS), 0);
}

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  return {
    "Content-Type": "application/json",
    apikey: anon,
    Authorization: `Bearer ${session?.access_token || anon}`,
  };
}

function fnUrl(name: string) {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`;
}

/** Generate a single image and return a hosted, publicly reachable URL. */
export async function generateCoderImage(
  prompt: string,
  opts: { referenceImageUrl?: string; signal?: AbortSignal } = {},
): Promise<string> {
  const resp = await fetch(fnUrl("anything-api"), {
    method: "POST",
    headers: await authHeaders(),
    signal: opts.signal,
    body: JSON.stringify({
      prompt: `${prompt}. High quality, web-ready, clean composition, no text watermarks.`,
      size: "1024x1024",
      ...(opts.referenceImageUrl
        ? { reference_image_url: opts.referenceImageUrl, image_url: opts.referenceImageUrl }
        : {}),
    }),
  });
  const text = await resp.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  if (!resp.ok) throw new Error(json?.error || json?.message || `image failed (${resp.status})`);
  const url = json?.image_url || json?.image_urls?.[0] || json?.url;
  if (!url) throw new Error("image generation returned no url");
  return url as string;
}

/** Generate a short video clip and return a hosted URL (polls until ready). */
export async function generateCoderVideo(
  prompt: string,
  opts: { signal?: AbortSignal } = {},
): Promise<string> {
  const headers = await authHeaders();
  const resp = await fetch(fnUrl("media-video"), {
    method: "POST",
    headers,
    signal: opts.signal,
    body: JSON.stringify({ prompt, duration: 5 }),
  });
  const text = await resp.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  if (!resp.ok) throw new Error(json?.error || json?.message || `video failed (${resp.status})`);
  const direct = json?.video_url || json?.url;
  if (direct) return direct as string;
  const jobId = json?.job_id || json?.task_id || json?.id;
  if (!jobId) throw new Error("video generation returned no job");
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    if (opts.signal?.aborted) throw new Error("aborted");
    await new Promise((r) => setTimeout(r, 8_000));
    const p = await fetch(fnUrl("media-video-poll"), {
      method: "POST",
      headers,
      body: JSON.stringify({ job_id: jobId, task_id: jobId }),
    });
    const pj = await p.json().catch(() => null);
    const url = pj?.video_url || pj?.url || pj?.output?.video_url;
    if (url) return url as string;
    if (pj?.status === "failed" || pj?.error) throw new Error(pj?.error || "video job failed");
  }
  throw new Error("video generation timed out");
}

/** Replace every resolved token/placeholder across all files. */
export function applyAssetsToFiles(files: ProjectFile[], assets: CoderAsset[]): ProjectFile[] {
  const pairs: Array<[string, string]> = [];
  for (const a of assets) {
    if (a.status !== "done" || !a.url) continue;
    for (const t of a.tokens) pairs.push([t, a.url]);
  }
  if (pairs.length === 0) return files;
  // Longest token first so partial overlaps can't corrupt a longer match.
  pairs.sort((x, y) => y[0].length - x[0].length);
  return files.map((f) => {
    let content = f.content || "";
    for (const [token, url] of pairs) content = content.split(token).join(url);
    return content === f.content ? f : { ...f, content };
  });
}

/** Remove any leftover unresolved tokens so the preview never shows raw text. */
export function stripUnresolvedTokens(files: ProjectFile[]): ProjectFile[] {
  const videoToken = VIDEO_TOKEN_RE.source;
  // Drop the whole <video> element when its source never resolved — leaving
  // `<video src="">` behind renders a broken black box on the published site.
  const videoTagRe = new RegExp(`<video\\b[^>]*${videoToken}[\\s\\S]*?<\\/video>`, "gi");
  const videoSelfClosingRe = new RegExp(`<(video|source)\\b[^>]*${videoToken}[^>]*\\/?>`, "gi");
  return files.map((f) => {
    const content = (f.content || "")
      .replace(IMAGE_TOKEN_RE, "https://placehold.co/1024x1024/111/eee?text=Image")
      .replace(videoTagRe, "")
      .replace(videoSelfClosingRe, "")
      .replace(VIDEO_TOKEN_RE, "");
    return content === f.content ? f : { ...f, content };
  });
}


/**
 * Resolve a batch of asset requests, reporting progress per asset.
 *
 * Generation runs with a small concurrency window: firing 20 image jobs at
 * once reliably trips provider rate limits and makes the whole batch fail,
 * which used to leave the site full of placeholder boxes.
 */
const ASSET_CONCURRENCY = 3;
/** Hard ceiling so one prompt can never burn an unbounded amount of credits. */
export const MAX_ASSETS_PER_RUN = 12;

export async function generateAssets(
  requests: CoderAssetRequest[],
  onUpdate: (asset: CoderAsset) => void,
  signal?: AbortSignal,
): Promise<CoderAsset[]> {
  const results: CoderAsset[] = new Array(requests.length);
  let cursor = 0;

  const worker = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= requests.length) return;
      const req = requests[i];
      const credits = req.kind === "video" ? VIDEO_CREDITS : IMAGE_CREDITS;
      const base: CoderAsset = { ...req, status: "running", credits };
      onUpdate(base);
      if (signal?.aborted) {
        const aborted: CoderAsset = { ...base, status: "error", error: "cancelled" };
        onUpdate(aborted);
        results[i] = aborted;
        continue;
      }
      try {
        const url =
          req.kind === "video"
            ? await generateCoderVideo(req.prompt, { signal })
            : await generateCoderImage(req.prompt, { signal });
        const done: CoderAsset = { ...base, status: "done", url };
        onUpdate(done);
        results[i] = done;
      } catch (e) {
        const failed: CoderAsset = {
          ...base,
          status: "error",
          error: e instanceof Error ? e.message : "generation failed",
        };
        onUpdate(failed);
        results[i] = failed;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(ASSET_CONCURRENCY, requests.length) }, worker),
  );
  return results;
}


/** Upload a user-attached data URL to storage so Coder can reference it. */
export async function uploadAttachmentDataUrl(dataUrl: string, name = "upload"): Promise<string | null> {
  try {
    if (!/^data:/.test(dataUrl)) return dataUrl;
    const [head, b64] = dataUrl.split(",");
    const mime = /data:([^;]+)/.exec(head)?.[1] || "image/png";
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const { data: { user } } = await supabase.auth.getUser();
    const ext = (mime.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "");
    const uid = user?.id;
    if (!uid) return null;
    const path = `${uid}/coder-attachments/${Date.now()}-${slug(name).replace(/\s+/g, "-") || "file"}.${ext}`;
    const { data, error } = await supabase.storage.from("user-images").upload(path, bin, {
      contentType: mime,
      upsert: false,
    });
    if (error || !data?.path) return null;
    return supabase.storage.from("user-images").getPublicUrl(data.path).data.publicUrl || null;
  } catch {
    return null;
  }
}
