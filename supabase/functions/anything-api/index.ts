/** @doc anything-api — media/image router deployed under the legacy function name. */
// media-image router (deployed under the existing `anything-api` function name
// because new edge functions can't be created from this project; the old
// deployed `media-image` function ignores model_slug and always uses deapi).
//
// Routes the requested model_slug to the right provider:
//   - deapi     (api.deapi.ai v2, txt2img / img2img)
//   - renderful (api.renderful.ai, text-to-image / image-to-image tasks)
// Billing: reads the model row from public.image_models; paid models deduct
// credits via public.deduct_credits and refund on failure.
// Provider keys: env (RENDERFUL_API_KEY / DEAPI_API_KEY), then vault-backed
// public.image_provider_keys (providers 'r' / 'd') via
// public.get_image_provider_key, then legacy public.api_keys.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// renderful t2i slug -> i2i slug (editing variant), when available.
const RENDERFUL_I2I: Record<string, string> = {
  "gpt-image-2": "gpt-image-2-i2i",
  "nano-banana-2": "nano-banana-2-i2i",
  "seedream-4.5": "seedream-4.5-i2i",
  "seedream-5.0-lite": "seedream-5.0-lite-i2i",
  "seedream-5.0-pro": "seedream-5.0-pro-i2i",
  "grok-imagine-image": "grok-imagine-image-i2i",
  "nano-banana-pro": "nano-banana-pro-i2i",
  "gpt-image-1.5": "gpt-image-1.5-i2i",
  "flux-2": "flux-2-i2i",
};

// Aliases: slugs older clients may send -> real catalogue slug.
const SLUG_ALIASES: Record<string, string> = {
  "deapi-image": "deapi-flux-schnell",
  "gpt-image-2": "renderful-gpt-image-2",
  "nano-banana-2": "renderful-nano-banana-2",
  "seedream-5": "renderful-seedream-4-5",
  "grok-image": "renderful-grok-imagine-image",
  "ws-gpt-image-2": "renderful-gpt-image-2",
};

// provider name -> image_provider_keys.provider letter
const PROVIDER_LETTER: Record<string, string> = { renderful: "r", deapi: "d" };

// provider name -> provider_api_keys.provider letter (rotating pool)
const POOL_LETTER: Record<string, string> = { alibaba: "a", deapi: "d", renderful: "r" };

// Alibaba Model Studio (DashScope International, Singapore)
const DASHSCOPE_BASE = "https://dashscope-intl.aliyuncs.com/api/v1";

// deapi catalogue slug -> live deapi model slug + capabilities
// (from GET /api/v2/models). Only Flux_2_Klein_4B_BF16 supports img2img.
const DEAPI_MODELS: Record<string, { api: string; edit: boolean; t2i: boolean; steps: number }> = {
  "deapi-flux-schnell": { api: "Flux1schnell", edit: false, t2i: true, steps: 4 },
  "deapi-flux-2-klein": { api: "Flux_2_Klein_4B_BF16", edit: true, t2i: true, steps: 4 },
  "deapi-qwen-image-edit": { api: "QwenImageEdit_Plus_NF4", edit: true, t2i: false, steps: 10 },
};

// ---- video ----
// deapi catalogue slug -> live deapi video model (verified via GET /api/v2/models)
const DEAPI_VIDEO: Record<string, { api: string; steps: number; fps: number }> = {
  "deapi-ltx-video": { api: "Ltxv_13B_0_9_8_Distilled_FP8", steps: 1, fps: 30 },
  "deapi-ltx-2-3": { api: "Ltx2_3_22B_Dist_INT8", steps: 1, fps: 30 },
  "deapi-minimax-h3": { api: "MiniMaxH3_33B_Turbo_INT8", steps: 1, fps: 30 },
};

// renderful text-to-video slug -> image-to-video variant
const RENDERFUL_I2V: Record<string, string> = {
  "seedance-1.5-pro": "seedance-1.5-pro-i2v",
  "kling-v2-6": "kling-v2-6-i2v",
  "kling-3.0-turbo": "kling-3.0-turbo-i2v",
  "hailuo-2.3": "hailuo-2.3-i2v",
  "wan-2.7-t2v": "wan-2.7-i2v",
  "sora-2": "sora-2-i2v",
  "google-veo-3.1-fast": "google-veo-3.1-fast-i2v",
};

const VIDEO_SLUG_ALIASES: Record<string, string> = {
  "deapi-ltx-2": "deapi-ltx-video",
  "deapi-video": "deapi-ltx-video",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function resolveApiKey(
  admin: ReturnType<typeof createClient>,
  service: string,
): Promise<string | null> {
  const envKey = Deno.env.get(`${service.toUpperCase()}_API_KEY`);
  if (envKey) return envKey;

  // rotating provider_api_keys pool (d / r / y / a)
  const poolLetter = POOL_LETTER[service];
  if (poolLetter) {
    try {
      const { data } = await admin.rpc("next_provider_key", { p_provider: poolLetter });
      const row = Array.isArray(data) ? data[0] : data;
      const k = (row as any)?.api_key;
      if (k) return String(k);
    } catch { /* fall through */ }
  }

  // vault-backed image_provider_keys (providers 'r' / 'd')
  const letter = PROVIDER_LETTER[service];
  if (letter) {
    try {
      const { data } = await admin.rpc("get_image_provider_key", { p_provider: letter });
      if (data) return data as string;
    } catch { /* fall through */ }
  }


  // legacy plain-text api_keys table
  try {
    const { data } = await admin
      .from("api_keys")
      .select("api_key")
      .eq("service", service)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as any)?.api_key ?? null;
  } catch {
    return null;
  }
}

function firstUrl(value: unknown, depth = 0): string | null {
  if (depth > 6 || value == null) return null;
  if (typeof value === "string") {
    if (/^https?:\/\/\S+/.test(value) && /\.(png|jpe?g|webp|gif)(\?\S*)?$/i.test(value)) return value;
    if (/^https?:\/\/\S*(results|cdn|image|img|output)\S*/i.test(value)) return value;
    return null;
  }
  if (Array.isArray(value)) {
    for (const v of value) {
      const hit = firstUrl(v, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      const hit = firstUrl(v, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

// ---------- deapi (v2) ----------
async function deapiGenerate(opts: {
  key: string;
  model: string;
  prompt: string;
  images: string[];
  aspectRatio?: string;
  steps: number;
}): Promise<string> {
  const editing = opts.images.length > 0;
  const endpoint = editing
    ? "https://api.deapi.ai/api/v2/images/edits"
    : "https://api.deapi.ai/api/v2/images/generations";
  const seed = Math.floor(Math.random() * 2_147_483_647);
  let res: Response;
  if (editing) {
    // The edits endpoint is multipart/form-data with binary image parts —
    // image URLs are not accepted, so download the bytes first.
    const form = new FormData();
    form.append("model", opts.model);
    form.append("prompt", opts.prompt);
    form.append("seed", String(seed));
    form.append("steps", String(opts.steps));
    const blobs = await Promise.all(
      opts.images.map(async (u, i) => {
        const r = await fetch(u);
        if (!r.ok) throw new Error(`failed to download reference image (${r.status})`);
        const ct = r.headers.get("content-type") ?? "image/png";
        const ext = ct.includes("jpeg") ? "jpg" : ct.includes("webp") ? "webp" : "png";
        return { blob: await r.blob(), name: `reference-${i}.${ext}` };
      }),
    );
    if (blobs.length === 1) form.append("image", blobs[0].blob, blobs[0].name);
    else for (const b of blobs) form.append("images[]", b.blob, b.name);
    res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.key}`, Accept: "application/json" },
      body: form,
    });
  } else {
    const [width, height] = opts.aspectRatio === "9:16" ? [768, 1344]
      : opts.aspectRatio === "16:9" ? [1344, 768]
      : [1024, 1024];
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.key}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model,
        prompt: opts.prompt,
        width,
        height,
        seed,
        steps: opts.steps,
        guidance: 3.5,
      }),
    });
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`deapi ${res.status}: ${text.slice(0, 300)}`);
  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("deapi returned non-JSON");
  }
  const requestId =
    payload?.data?.request_id || payload?.request_id || payload?.data?.id || payload?.id;
  if (!requestId) {
    const direct = firstUrl(payload);
    if (direct) return direct;
    throw new Error(`deapi: no request id (${text.slice(0, 200)})`);
  }
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await sleep(2500);
    const st = await fetch(`https://api.deapi.ai/api/v2/jobs/${requestId}`, {
      headers: { Authorization: `Bearer ${opts.key}`, Accept: "application/json" },
    });
    if (!st.ok) continue;
    const job: any = await st.json().catch(() => null);
    const status = String(job?.data?.status ?? job?.status ?? "").toLowerCase();
    if (["completed", "complete", "succeeded", "success", "done"].includes(status)) {
      const url = firstUrl(job);
      if (url) return url;
      throw new Error("deapi: completed without an image URL");
    }
    if (["failed", "error", "cancelled"].includes(status)) {
      throw new Error(`deapi job failed: ${JSON.stringify(job).slice(0, 300)}`);
    }
  }
  throw new Error("deapi: timed out waiting for image");
}

// ---------- renderful ----------
async function renderfulGenerate(opts: {
  key: string;
  model: string;
  prompt: string;
  images: string[];
  aspectRatio?: string;
}): Promise<string> {
  const editing = opts.images.length > 0;
  if (editing && !RENDERFUL_I2I[opts.model]) {
    throw new Error(`model ${opts.model} does not support image editing`);
  }
  const model = editing ? RENDERFUL_I2I[opts.model] : opts.model;
  const body: Record<string, unknown> = {
    type: editing ? "image-to-image" : "text-to-image",
    model,
    prompt: opts.prompt,
  };
  if (opts.aspectRatio) body.aspect_ratio = opts.aspectRatio;
  if (editing) {
    if (opts.images.length === 1) body.image_url = opts.images[0];
    else body.images = opts.images;
  }
  const res = await fetch("https://api.renderful.ai/api/v1/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`renderful ${res.status}: ${text.slice(0, 300)}`);
  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("renderful returned non-JSON");
  }
  const taskId = payload?.id || payload?.task_id;
  if (!taskId) {
    const direct = firstUrl(payload?.output ?? payload);
    if (direct) return direct;
    throw new Error(`renderful: no task id (${text.slice(0, 200)})`);
  }
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await sleep(3000);
    const st = await fetch(`https://api.renderful.ai/api/v1/generations/${taskId}`, {
      headers: { Authorization: `Bearer ${opts.key}` },
    });
    if (!st.ok) continue;
    const job: any = await st.json().catch(() => null);
    const status = String(job?.status ?? "").toLowerCase();
    if (["succeeded", "completed", "complete", "success"].includes(status)) {
      const url = firstUrl(job?.output ?? job?.outputs ?? job);
      if (url) return url;
      throw new Error("renderful: completed without an image URL");
    }
    if (["failed", "error", "cancelled"].includes(status)) {
      throw new Error(`renderful task failed: ${JSON.stringify(job).slice(0, 300)}`);
    }
  }
  throw new Error("renderful: timed out waiting for image");
}

// ---------- video helpers ----------
function firstVideoUrl(value: unknown, depth = 0): string | null {
  if (depth > 6 || value == null) return null;
  if (typeof value === "string") {
    if (/^https?:\/\/\S+\.(mp4|webm|mov|m4v)(\?\S*)?$/i.test(value)) return value;
    if (/^https?:\/\/\S*(results|cdn|output|video)\S*/i.test(value) && /mp4|webm|mov/i.test(value)) {
      return value;
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (const v of value) {
      const hit = firstVideoUrl(v, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      const hit = firstVideoUrl(v, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

function videoDims(aspect?: string): [number, number] {
  if (aspect === "9:16") return [480, 832];
  if (aspect === "1:1") return [640, 640];
  return [832, 480];
}

// Submit a deapi video job -> request id (jobs resolve in seconds/minutes).
async function deapiVideoSubmit(opts: {
  key: string;
  model: string;
  prompt: string;
  steps: number;
  fps: number;
  duration: number;
  aspectRatio?: string;
  image?: string;
}): Promise<string> {
  const [width, height] = videoDims(opts.aspectRatio);
  const frames = Math.max(24, Math.min(241, Math.round(opts.duration * opts.fps)));
  const form = new FormData();
  form.append("model", opts.model);
  form.append("prompt", opts.prompt);
  form.append("width", String(width));
  form.append("height", String(height));
  form.append("seed", String(Math.floor(Math.random() * 2_147_483_647)));
  form.append("frames", String(frames));
  form.append("fps", String(opts.fps));
  form.append("steps", String(opts.steps));

  let res: Response;
  if (opts.image) {
    const r = await fetch(opts.image);
    if (!r.ok) throw new Error(`failed to download the reference image (${r.status})`);
    const ct = r.headers.get("content-type") ?? "image/png";
    const ext = ct.includes("jpeg") ? "jpg" : ct.includes("webp") ? "webp" : "png";
    form.append("image", await r.blob(), `frame.${ext}`);
    res = await fetch("https://api.deapi.ai/api/v2/videos/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.key}`, Accept: "application/json" },
      body: form,
    });
  } else {
    const payload: Record<string, unknown> = {
      model: opts.model,
      prompt: opts.prompt,
      width,
      height,
      seed: Math.floor(Math.random() * 2_147_483_647),
      frames,
      fps: opts.fps,
      steps: opts.steps,
    };
    res = await fetch("https://api.deapi.ai/api/v2/videos/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.key}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`deapi ${res.status}: ${text.slice(0, 300)}`);
  const payload = JSON.parse(text);
  const id = payload?.data?.request_id ?? payload?.request_id ?? payload?.data?.id ?? payload?.id;
  if (!id) throw new Error(`deapi: no video request id (${text.slice(0, 200)})`);
  return String(id);
}

async function renderfulVideoSubmit(opts: {
  key: string;
  model: string;
  prompt: string;
  duration: number;
  aspectRatio?: string;
  image?: string;
  lastFrame?: string;
}): Promise<string> {
  const i2v = !!opts.image;
  const model = i2v ? (RENDERFUL_I2V[opts.model] ?? opts.model) : opts.model;
  const body: Record<string, unknown> = {
    type: i2v ? "image-to-video" : "text-to-video",
    model,
    prompt: opts.prompt,
    duration: opts.duration,
  };
  if (opts.aspectRatio) body.aspect_ratio = opts.aspectRatio;
  if (opts.image) body.image_url = opts.image;
  if (opts.lastFrame) body.last_frame_url = opts.lastFrame;

  const res = await fetch("https://api.renderful.ai/api/v1/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`renderful ${res.status}: ${text.slice(0, 300)}`);
  const payload = JSON.parse(text);
  const id = payload?.id ?? payload?.task_id ?? payload?.data?.id;
  if (!id) throw new Error(`renderful: no video task id (${text.slice(0, 200)})`);
  return String(id);
}

// Alibaba Model Studio (Wan) — async task API, returns immediately with a task id.
async function alibabaVideoSubmit(opts: {
  key: string;
  model: string;
  prompt: string;
  resolution: string;
  duration: number;
  promptExtend: boolean;
  aspectRatio?: string;
  image?: string;
}): Promise<string> {
  const size = opts.aspectRatio === "9:16"
    ? "720*1280"
    : opts.aspectRatio === "1:1"
    ? "960*960"
    : "1280*720";
  const input: Record<string, unknown> = { prompt: opts.prompt };
  if (opts.image) input.img_url = opts.image;
  const body = {
    model: opts.model,
    input,
    parameters: {
      resolution: opts.resolution,
      duration: opts.duration,
      prompt_extend: opts.promptExtend,
      ...(opts.image ? {} : { size }),
    },
  };
  const res = await fetch(`${DASHSCOPE_BASE}/services/aigc/video-generation/video-synthesis`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.key}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`alibaba ${res.status}: ${text.slice(0, 300)}`);
  const payload = JSON.parse(text);
  const id = payload?.output?.task_id ?? payload?.task_id;
  if (!id) throw new Error(`alibaba: no task id (${text.slice(0, 200)})`);
  return String(id);
}

// job_id format: "<provider>:<id>" so the client can poll a single endpoint.
async function pollVideoJob(
  admin: ReturnType<typeof createClient>,
  jobId: string,
): Promise<Response> {
  const [prefix, ...rest] = jobId.split(":");
  const id = rest.join(":");
  const provider = prefix === "renderful"
    ? "renderful"
    : prefix === "alibaba"
    ? "alibaba"
    : "deapi";
  const key = await resolveApiKey(admin, provider);
  if (!key) return json({ status: "failed", error: `${provider} API key is not configured` });

  if (provider === "alibaba") {
    const st = await fetch(`${DASHSCOPE_BASE}/tasks/${id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!st.ok) return json({ status: "processing" });
    const job: any = await st.json().catch(() => null);
    const status = String(job?.output?.task_status ?? "").toUpperCase();
    if (status === "SUCCEEDED") {
      const url = job?.output?.video_url ?? firstVideoUrl(job);
      if (url) return json({ status: "completed", video_url: url });
      return json({ status: "failed", error: "alibaba finished without a video URL" });
    }
    if (["FAILED", "CANCELED", "CANCELLED", "UNKNOWN"].includes(status)) {
      return json({
        status: "failed",
        error: job?.output?.message ?? "alibaba video task failed",
      });
    }
    return json({ status: "processing" });
  }



  if (provider === "deapi") {
    const st = await fetch(`https://api.deapi.ai/api/v2/jobs/${id}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    if (!st.ok) return json({ status: "processing" });
    const job: any = await st.json().catch(() => null);
    const status = String(job?.data?.status ?? job?.status ?? "").toLowerCase();
    if (["done", "completed", "complete", "succeeded", "success"].includes(status)) {
      const url = firstVideoUrl(job) ?? job?.data?.result_url ?? null;
      if (url) return json({ status: "completed", video_url: url });
      return json({ status: "failed", error: "deapi finished without a video URL" });
    }
    if (["failed", "error", "cancelled"].includes(status)) {
      return json({ status: "failed", error: job?.data?.error ?? "deapi video job failed" });
    }
    return json({ status: "processing", progress: Number(job?.data?.progress ?? 0) });
  }

  const st = await fetch(`https://api.renderful.ai/api/v1/generations/${id}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!st.ok) return json({ status: "processing" });
  const job: any = await st.json().catch(() => null);
  const status = String(job?.status ?? "").toLowerCase();
  if (["succeeded", "completed", "complete", "success"].includes(status)) {
    const url = firstVideoUrl(job?.output ?? job?.outputs ?? job);
    if (url) return json({ status: "completed", video_url: url });
    return json({ status: "failed", error: "renderful finished without a video URL" });
  }
  if (["failed", "error", "cancelled"].includes(status)) {
    return json({ status: "failed", error: job?.error ?? "renderful video task failed" });
  }
  return json({ status: "processing", progress: Number(job?.progress ?? 0) });
}

async function handleVideo(
  req: Request,
  admin: ReturnType<typeof createClient>,
  body: any,
): Promise<Response> {
  const prompt = String(body?.prompt ?? "").trim();
  if (!prompt) return json({ error: true, message: "prompt is required" }, 400);

  let slug = String(body?.model_slug ?? "").trim();
  slug = VIDEO_SLUG_ALIASES[slug] ?? slug;
  if (!slug) slug = "deapi-ltx-video";

  const duration = Math.max(2, Math.min(10, Number(body?.duration ?? 5) || 5));
  const aspectRatio = typeof body?.aspect_ratio === "string" ? body.aspect_ratio : undefined;
  const startFrame = typeof body?.start_frame === "string" ? body.start_frame : undefined;
  const endFrame = typeof body?.end_frame === "string" ? body.end_frame : undefined;

  const { data: modelRow } = await admin
    .from("video_models")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  // Alibaba (Wan) catalogue lives in its own table.
  const { data: aliRow } = await admin
    .from("alibaba_video_models")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  const model: any = modelRow ?? null;
  const ali: any = aliRow ?? null;
  const provider = ali
    ? "alibaba"
    : String(model?.provider ?? (DEAPI_VIDEO[slug] ? "deapi" : "renderful")).toLowerCase();
  const apiModel = ali?.model_id_api ?? model?.model_id_api ??
    (provider === "deapi"
      ? (DEAPI_VIDEO[slug]?.api ?? "Ltxv_13B_0_9_8_Distilled_FP8")
      : slug.replace(/^renderful-/, ""));


  // ----- billing -----
  const credits = Math.max(0, Number(model?.credits_per_video ?? 0));
  let userId: string | null = null;
  if (credits > 0) {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (token) {
      const userClient = createClient(
        SUPABASE_URL,
        Deno.env.get("SUPABASE_ANON_KEY") ?? SERVICE_KEY,
      );
      const { data: userData } = await userClient.auth.getUser(token);
      userId = userData?.user?.id ?? null;
    }
    if (!userId) {
      return json({
        error: true,
        paywall: true,
        message: "سجّل الدخول واشحن رصيدك لاستخدام نماذج الفيديو الاحترافية.",
      });
    }
    const { error: debitErr } = await admin.rpc("deduct_credits", {
      p_user_id: userId,
      p_amount: credits,
      p_action_type: "video_generation",
      p_description: `video:${slug}`,
    });
    if (debitErr) {
      return json({
        error: true,
        paywall: true,
        message: "رصيدك غير كافٍ لهذا النموذج — اشحن رصيدك أو استخدم نموذجًا مجانيًا.",
      });
    }
  }

  try {
    let jobId: string;
    if (provider === "deapi") {
      const key = await resolveApiKey(admin, "deapi");
      if (!key) throw new Error("deapi API key is not configured");
      const cfg = DEAPI_VIDEO[slug];
      const id = await deapiVideoSubmit({
        key,
        model: apiModel,
        prompt,
        steps: cfg?.steps ?? 1,
        fps: cfg?.fps ?? 30,
        duration,
        aspectRatio,
        image: startFrame,
      });
      jobId = `deapi:${id}`;
    } else if (provider === "alibaba") {
      const key = await resolveApiKey(admin, "alibaba");
      if (!key) throw new Error("Alibaba API key is not configured");
      const id = await alibabaVideoSubmit({
        key,
        model: apiModel,
        prompt,
        resolution: String(ali?.default_resolution ?? "480P"),
        duration: Number(ali?.default_duration ?? 5),
        promptExtend: Boolean(ali?.prompt_extend ?? false),
        aspectRatio,
        image: startFrame,
      });
      jobId = `alibaba:${id}`;
    } else {
      const key = await resolveApiKey(admin, "renderful");
      if (!key) throw new Error("Renderful API key is not configured");
      const id = await renderfulVideoSubmit({
        key,
        model: apiModel,
        prompt,
        duration,
        aspectRatio,
        image: startFrame,
        lastFrame: endFrame,
      });
      jobId = `renderful:${id}`;
    }
    return json({
      job_id: jobId,
      provider,
      model_slug: slug,
      model_name: ali?.display_name ?? model?.display_name ?? apiModel,
    });

  } catch (e) {
    if (credits > 0 && userId) {
      await admin
        .rpc("add_credits", {
          p_user_id: userId,
          p_amount: credits,
          p_description: `refund:video:${slug}`,
        })
        .catch(() => {});
    }
    const msg = e instanceof Error ? e.message : "video generation failed";
    return json({ error: true, message: msg }, 502);
  }
}



// ===================== connected-app agent tools =====================
// Uses the connected-apps credentials already stored as function secrets, so
// the browser only ever sends its own session token.

const TOOLS_API = "https://api.pipedream.com/v1";

function toolsConfig() {
  const pick = (...names: string[]) => {
    for (const n of names) {
      const v = Deno.env.get(n);
      if (v) return v;
    }
    return undefined;
  };
  const clientId = pick("PIPEDREAM_CLIENT_ID", "PIPEDREAM_OAUTH_CLIENT_ID");
  const clientSecret = pick("PIPEDREAM_CLIENT_SECRET", "PIPEDREAM_OAUTH_CLIENT_SECRET");
  const projectId = pick("PIPEDREAM_PROJECT_ID", "PIPEDREAM_PROJECT");
  if (!clientId || !clientSecret || !projectId) return null;
  return {
    clientId,
    clientSecret,
    projectId,
    environment: pick("PIPEDREAM_ENVIRONMENT", "PIPEDREAM_ENV") ?? "production",
  };
}

type ToolsCfg = NonNullable<ReturnType<typeof toolsConfig>>;

let toolsToken: { value: string; expiresAt: number } | null = null;

async function toolsAccessToken(cfg: ToolsCfg): Promise<string> {
  if (toolsToken && toolsToken.expiresAt > Date.now() + 30_000) return toolsToken.value;
  const res = await fetch(`${TOOLS_API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.access_token) throw new Error(`app tools auth failed [${res.status}]`);
  toolsToken = {
    value: String(data.access_token),
    expiresAt: Date.now() + Math.max(60_000, Number(data.expires_in ?? 3600) * 1000),
  };
  return toolsToken.value;
}

async function toolsFetchEnv(
  cfg: ToolsCfg,
  environment: string,
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {},
) {
  const token = await toolsAccessToken(cfg);
  const url = new URL(`${TOOLS_API}/connect/${cfg.projectId}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) if (v) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-PD-Environment": environment,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const detail = typeof data?.error === "string" ? data.error : text.slice(0, 300);
    throw new Error(`app request failed [${res.status}]: ${detail}`);
  }
  return data;
}

/** Tries the configured environment, then the alternate one (accounts may be linked in either). */
async function toolsFetch(
  cfg: ToolsCfg,
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {},
) {
  const alt = cfg.environment === "production" ? "development" : "production";
  try {
    return await toolsFetchEnv(cfg, cfg.environment, path, init);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/404|not found/i.test(msg)) return await toolsFetchEnv(cfg, alt, path, init);
    throw e;
  }
}


const toolsAppSlug = (a: any) =>
  a?.app?.name_slug ?? a?.app?.slug ?? a?.app_slug ?? a?.appSlug ?? null;

/** Pipedream actions need the connected account passed as their `app` prop. */
async function toolsWithAuth(
  cfg: ToolsCfg,
  admin: ReturnType<typeof createClient>,
  userId: string,
  toolId: string,
  appHint: string,
  configured: Record<string, any>,
): Promise<Record<string, any>> {
  const props = { ...(configured ?? {}) };
  let authProps: { name: string; app: string }[] = [];
  try {
    const meta = await toolsFetch(cfg, `/components/${encodeURIComponent(toolId)}`);
    const list: any[] = meta?.data?.configurable_props ?? meta?.configurable_props ?? [];
    authProps = list
      .filter((p) => p?.type === "app" && p?.name)
      .map((p) => ({ name: String(p.name), app: String(p.app ?? appHint) }));
  } catch (_e) {
    // fall back to slug-derived guess below
  }
  if (!authProps.length && appHint) {
    const camel = appHint.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());
    authProps = [{ name: camel, app: appHint }];
  }
  for (const p of authProps) {
    if (props[p.name]) continue;
    const { data: acc } = await admin
      .from("pipedream_accounts")
      .select("account_id")
      .eq("user_id", userId)
      .eq("app_slug", p.app || appHint)
      .maybeSingle();
    const accountId = (acc as any)?.account_id;
    if (accountId) props[p.name] = { authProvisionId: String(accountId) };
  }
  return props;
}

/** The external-user namespace the app's account was linked under. */
async function toolsExternalUser(
  admin: ReturnType<typeof createClient>,
  userId: string,
  fallback: string,
  app: string,
): Promise<string> {
  if (!app) return fallback;
  const { data } = await admin
    .from("pipedream_accounts")
    .select("external_user_id")
    .eq("user_id", userId)
    .eq("app_slug", app)
    .maybeSingle();
  const ext = (data as any)?.external_user_id;
  return ext ? String(ext) : fallback;
}

async function handleTools(

  req: Request,
  admin: ReturnType<typeof createClient>,
  body: any,
): Promise<Response> {
  const action = String(body?.action ?? "").trim();
  if (!action) return json({ ok: false, error: "Missing action" }, 400);

  const token = String(
    body?.token ?? (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, ""),
  );
  const { data: userData } = await admin.auth.getUser(token);
  const userId = userData?.user?.id;
  if (!userId) return json({ ok: false, error: "Sign in first" }, 401);

  const cfg = toolsConfig();
  if (!cfg) {
    if (action === "list") return json({ ok: true, configured: false, apps: [] });
    return json({ ok: false, error: "App tools are not configured yet" }, 400);
  }

  // Same external-user convention as the account-linking function.
  const externalUserId = `megsy_${userId}`;

  try {
    if (action === "list") {
      let rows: any[] = [];
      const accounts: any[] = [];
      for (const ext of [externalUserId, userId]) {
        try {
          const data = await toolsFetch(cfg, "/accounts", {
            query: { external_user_id: ext, limit: "100" },
          });
          if (Array.isArray(data?.data)) {
            for (const a of data.data) accounts.push({ ...a, _ext: ext });
          }
        } catch (_e) {
          // ignore: this external-user namespace may not exist
        }
      }
      const seen = new Set<string>();
      rows = accounts
        .map((a) => {
          const slug = toolsAppSlug(a);
          if (!slug || !a?.id || seen.has(String(slug))) return null;
          seen.add(String(slug));
          return {
            user_id: userId,
            external_user_id: String(a._ext ?? externalUserId),
            app_slug: String(slug),
            account_id: String(a.id),
            account_name: String(a.name ?? a.external_id ?? slug),
            healthy: a.healthy !== false,
            metadata: { app_name: a?.app?.name ?? null },
            updated_at: new Date().toISOString(),
          };
        })
        .filter(Boolean) as any[];
      if (rows.length) {
        await admin.from("pipedream_accounts").upsert(rows, { onConflict: "user_id,app_slug" });
      }
      // Merge in accounts linked through the connect flow (stored locally).
      {
        const { data } = await admin
          .from("pipedream_accounts")
          .select("app_slug, account_id, account_name, healthy")
          .eq("user_id", userId);
        for (const r of ((data as any[]) ?? [])) {
          const slug = String(r.app_slug ?? "");
          if (!slug || seen.has(slug)) continue;
          seen.add(slug);
          rows.push(r);
        }
      }






      const { data: prefs } = await admin
        .from("pipedream_tool_settings")
        .select("app_slug, enabled")
        .eq("user_id", userId);
      const off = new Set(
        ((prefs as any[]) ?? []).filter((r) => r.enabled === false).map((r) => String(r.app_slug)),
      );

      return json({
        ok: true,
        configured: true,
        apps: rows.map((a) => ({
          app: String(a.app_slug),
          account_id: String(a.account_id ?? ""),
          account_name: a.account_name ?? null,
          healthy: a.healthy !== false,
          enabled: !off.has(String(a.app_slug)),
        })),
      });
    }

    if (action === "actions") {
      const app = String(body?.app ?? "").trim();
      if (!app) return json({ ok: false, error: "Missing app" }, 400);
      const data = await toolsFetch(cfg, "/actions", { query: { app, limit: "100" } });
      const list: any[] = Array.isArray(data?.data) ? data.data : [];
      return json({
        ok: true,
        app,
        tools: list.map((a) => ({
          key: String(a?.key ?? a?.id ?? ""),
          app,
          name: String(a?.name ?? a?.key ?? "Action"),
          description: String(a?.description ?? "").slice(0, 400),
          version: a?.version ? String(a.version) : undefined,
        })),
      });
    }

    if (action === "props") {
      const tool = String(body?.tool ?? "");
      if (!tool) return json({ ok: false, error: "Missing tool" }, 400);
      const appHint = String(body?.app ?? tool.split("-")[0] ?? "").trim();
      const configured = await toolsWithAuth(
        cfg,
        admin,
        userId,
        tool,
        appHint,
        body?.configured_props ?? {},
      );
      const extUser = await toolsExternalUser(admin, userId, externalUserId, appHint);
      const data = await toolsFetch(cfg, "/actions/configure", {
        method: "POST",
        body: {
          external_user_id: extUser,

          id: tool,
          prop_name: body?.prop_name,
          configured_props: configured,
          query: body?.query,
        },
      });
      return json({ ok: true, result: data });
    }

    if (action === "run") {
      const tool = String(body?.tool ?? "");
      if (!tool) return json({ ok: false, error: "Missing tool" }, 400);
      const app = String(body?.app ?? tool.split("-")[0] ?? "").trim();
      if (app) {
        const { data: setting } = await admin
          .from("pipedream_tool_settings")
          .select("enabled")
          .eq("user_id", userId)
          .eq("app_slug", app)
          .maybeSingle();
        if (setting && (setting as any).enabled === false) {
          return json({ ok: false, error: "This app is turned off for the assistant" }, 403);
        }
      }
      const configured = await toolsWithAuth(
        cfg,
        admin,
        userId,
        tool,
        app,
        body?.configured_props ?? {},
      );
      const extUser = await toolsExternalUser(admin, userId, externalUserId, app);
      const data = await toolsFetch(cfg, "/actions/run", {
        method: "POST",
        body: {
          external_user_id: extUser,

          id: tool,
          configured_props: configured,
        },
      });
      return json({ ok: true, result: data?.ret ?? data, exports: data?.exports ?? null });

    }

    // Creates a link session in the same environment the tool runtime uses,
    // so newly connected apps can actually run actions.
    if (action === "connect") {
      const data = await toolsFetch(cfg, "/tokens", {
        method: "POST",
        body: {
          external_user_id: externalUserId,
          allowed_origins: Array.isArray(body?.allowed_origins)
            ? body.allowed_origins
            : body?.redirect_origin
              ? [String(body.redirect_origin)]
              : undefined,
        },
      });
      const link = data?.connect_link_url ?? data?.connectLinkUrl ?? null;
      if (!link) return json({ ok: false, error: "Could not start the connection" }, 500);
      return json({ ok: true, connect_link_url: String(link), token: data?.token ?? null });
    }

    if (action === "set_enabled") {

      const app = String(body?.app ?? "").trim();
      if (!app) return json({ ok: false, error: "Missing app" }, 400);
      const enabled = body?.enabled !== false;
      const { error } = await admin.from("pipedream_tool_settings").upsert(
        { user_id: userId, app_slug: app, enabled, updated_at: new Date().toISOString() },
        { onConflict: "user_id,app_slug" },
      );
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, app, enabled });
    }

    return json({ ok: false, error: "Unknown action" }, 400);
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "tools_failed" }, 500);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json().catch(() => ({}));

    // connected-app tools (list / actions / props / run / set_enabled)
    if (body?.kind === "tools" || body?.tools === true) {
      return await handleTools(req, createClient(SUPABASE_URL, SERVICE_KEY), body);
    }

    // ready-made API apps (bring your own key)
    if (body?.kind === "api_app") {
      const { handleApiApp } = await import("./apiAppRunner.ts");
      return await handleApiApp(req, createClient(SUPABASE_URL, SERVICE_KEY), body);
    }


    // video generation
    if (body?.kind === "video" || body?.media === "video") {
      return await handleVideo(req, createClient(SUPABASE_URL, SERVICE_KEY), body);
    }

    const prompt = String(body?.prompt ?? "").trim();
    if (!prompt) return json({ error: true, message: "prompt is required" }, 400);

    let slug = String(body?.model_slug ?? "").trim();
    slug = SLUG_ALIASES[slug] ?? slug;
    if (!slug) slug = "deapi-flux-schnell";

    const rawImages: unknown =
      body?.reference_image_urls ?? body?.reference_image_url ?? body?.image_url ?? body?.images;
    const images: string[] = (Array.isArray(rawImages) ? rawImages : rawImages ? [rawImages] : [])
      .map((u) => String(u))
      .filter((u) => /^https?:\/\//.test(u));
    const aspectRatio = typeof body?.aspect_ratio === "string" ? body.aspect_ratio : undefined;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Model catalogue row (fallback to the free deapi model when unknown).
    const { data: modelRow } = await admin
      .from("image_models")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    const model: any = modelRow ?? null;
    const provider = String(
      model?.provider ?? (slug.startsWith("renderful-") ? "renderful" : "deapi"),
    );
    const apiModel =
      model?.model_id_api ??
      (provider === "deapi"
        ? (DEAPI_MODELS[slug]?.api ?? "Flux1schnell")
        : slug.replace(/^renderful-/, ""));
    const supportsEditing = provider === "renderful"
      ? !!RENDERFUL_I2I[apiModel]
      : (DEAPI_MODELS[slug]?.edit ?? !!model?.supports_image_editing);

    if (images.length > 0 && !supportsEditing) {
      return json({
        error: true,
        message: `النموذج ${model?.display_name ?? slug} لا يدعم التعديل على صورة — اختر نموذجًا آخر.`,
      });
    }
    if (provider === "deapi" && images.length === 0 && DEAPI_MODELS[slug] && !DEAPI_MODELS[slug].t2i) {
      return json({
        error: true,
        message: `النموذج ${model?.display_name ?? slug} مخصص لتعديل صورة مرفقة فقط — أرفق صورة أولًا أو اختر نموذج توليد.`,
      });
    }

    // ----- billing -----
    const unitCost = Number(model?.unit_cost_usd ?? 0);
    const credits = unitCost > 0 ? Math.max(1, Number(model?.credits ?? 1)) : 0;
    let userId: string | null = null;
    if (credits > 0) {
      const authHeader = req.headers.get("authorization") ?? "";
      const token = authHeader.replace(/^Bearer\s+/i, "");
      if (token) {
        const userClient = createClient(
          SUPABASE_URL,
          Deno.env.get("SUPABASE_ANON_KEY") ?? SERVICE_KEY,
        );
        const { data: userData } = await userClient.auth.getUser(token);
        userId = userData?.user?.id ?? null;
      }
      if (!userId) {
        return json({
          error: true,
          paywall: true,
          message: "سجّل الدخول واشحن رصيدك لاستخدام هذا النموذج المدفوع.",
        });
      }
      const { error: debitErr } = await admin.rpc("deduct_credits", {
        p_user_id: userId,
        p_amount: credits,
        p_action_type: "image_generation",
        p_description: `image:${slug}`,
      });
      if (debitErr) {
        return json({
          error: true,
          paywall: true,
          message: "رصيدك غير كافٍ لهذا النموذج — اشحن رصيدك أو استخدم النموذج المجاني.",
        });
      }
    }

    // ----- provider call (refund on failure) -----
    try {
      let imageUrl: string;
      if (provider === "renderful") {
        const key = await resolveApiKey(admin, "renderful");
        if (!key) throw new Error("Renderful API key is not configured");
        imageUrl = await renderfulGenerate({ key, model: apiModel, prompt, images, aspectRatio });
      } else {
        const key = await resolveApiKey(admin, "deapi");
        if (!key) throw new Error("deapi API key is not configured");
        imageUrl = await deapiGenerate({
          key,
          model: apiModel,
          prompt,
          images,
          aspectRatio,
          steps: DEAPI_MODELS[slug]?.steps ?? 4,
        });
      }
      return json({
        image_url: imageUrl,
        image_urls: [imageUrl],
        provider,
        model_slug: slug,
        model_name: model?.display_name ?? apiModel,
      });
    } catch (e) {
      if (credits > 0 && userId) {
        await admin
          .rpc("add_credits", {
            p_user_id: userId,
            p_amount: credits,
            p_description: `refund:image:${slug}`,
          })
          .catch(() => {});
      }
      const msg = e instanceof Error ? e.message : "image generation failed";
      return json({ error: true, message: msg }, 502);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unexpected error";
    return json({ error: true, message: msg }, 500);
  }
});
