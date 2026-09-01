// ============================================================================
// DEPLOY INSTRUCTIONS (خطوات النشر)
// هذا هو الكود الجديد الكامل لدالة media-image. المنصة تمنع إنشاء ملفات
// supabase/functions جديدة في هذا المشروع، لذا انشره يدويًا:
//   1. افتح لوحة Supabase → Edge Functions → media-image
//      https://supabase.com/dashboard/project/ltgampdtawuefwwayncx/functions
//   2. الصق هذا الكود كاملًا مكان الكود الحالي واضغط Deploy.
//   3. أضف مفتاح renderful إما كـ secret باسم RENDERFUL_API_KEY أو كصف في
//      جدول api_keys بخدمة 'renderful' (الدالة تقرأ الاثنين).
// ============================================================================
//
// media-image — image generation / editing router.
// Routes the requested model_slug to the right provider:
//   - deapi     (api.deapi.ai v2, txt2img / img2img)
//   - renderful (api.renderful.ai, text-to-image / image-to-image tasks)
// Billing: reads the model row from public.image_models; models with a real
// USD cost deduct credits via public.deduct_credits and refund on failure.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function resolveApiKey(service: string): Promise<string | null> {
  const envKey = Deno.env.get(`${service.toUpperCase()}_API_KEY`);
  if (envKey) return envKey;
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data } = await admin
      .from("api_keys")
      .select("key")
      .eq("service", service)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as any)?.key ?? null;
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
}): Promise<string> {
  const editing = opts.images.length > 0;
  const endpoint = editing
    ? "https://api.deapi.ai/api/v2/images/edits"
    : "https://api.deapi.ai/api/v2/images/generations";
  const body: Record<string, unknown> = { model: opts.model, prompt: opts.prompt };
  if (editing) {
    if (opts.images.length === 1) body.image = opts.images[0];
    else body.images = opts.images;
  }
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json().catch(() => ({}));
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
      (provider === "deapi" ? "Flux1schnell" : slug.replace(/^renderful-/, ""));
    const supportsEditing = provider === "renderful" ? !!RENDERFUL_I2I[apiModel] : true;

    if (images.length > 0 && !supportsEditing) {
      return json({
        error: true,
        message: `النموذج ${model?.display_name ?? slug} لا يدعم التعديل على صورة — اختر نموذجًا آخر.`,
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
        const key = await resolveApiKey("renderful");
        if (!key) throw new Error("Renderful API key is not configured");
        imageUrl = await renderfulGenerate({
          key,
          model: apiModel,
          prompt,
          images,
          aspectRatio,
        });
      } else {
        const key = await resolveApiKey("deapi");
        if (!key) throw new Error("deapi API key is not configured");
        imageUrl = await deapiGenerate({ key, model: apiModel, prompt, images });
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
