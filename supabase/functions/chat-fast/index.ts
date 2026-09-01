/**
 * @doc chat-fast
 * Low-latency chat endpoint for simple, tool-free turns.
 *
 * Streams a reply straight from Alibaba Cloud (DashScope, OpenAI-compatible)
 * using a fast Qwen model. The model itself decides routing: when the turn
 * needs tools, files, browsing, integrations or a long task, its first token is
 * the literal marker `ESCALATE`, which this function forwards to the client as
 * `{"event":"escalate"}` so the client re-sends the turn to `chat-alibaba`.
 *
 * Request body: { messages, customSystem?, model? }
 * Response: OpenAI-style SSE chunks, terminated by `data: [DONE]`.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const fastCorsHeaders = {
  ...corsHeaders,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-anon-fingerprint",
};

const FAST_SYSTEM = `You are MEGSY. Answer directly, accurately, and concisely in the user's language.`;

// Route obvious tool/task requests before contacting the model. This keeps the
// model stream safe to paint immediately instead of buffering its first tokens.
const COMPLEX_INTENT =
  /(?:https?:\/\/|ابحث|بحث (?:في|على) (?:الويب|النت)|الطقس|طقس|الأخبار|اخبار|سعر (?:اليوم|الآن)|حالي[ةاً]|افتح (?:موقع|رابط)|شغ[ّ]?ل (?:كود|أمر)|نف[ّ]?ذ|أنشئ (?:صورة|فيديو|ملف|عرض|جدول)|اصنع (?:صورة|فيديو)|ارسل (?:بريد|إيميل)|البريد|الإيميل|التقويم|حجز|اربط|تكامل|مرفق|ملف|pdf|excel|powerpoint|image|video|audio|browse|search (?:the )?web|weather|news|current price|latest|run (?:code|command)|terminal|send (?:an )?email|calendar|connector|integration)/i;

function needsFullChat(messages: Msg[]): boolean {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  return typeof lastUser?.content === "string" && COMPLEX_INTENT.test(lastUser.content);
}

const ENDPOINTS = [
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
  "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
];

function apiKey(): string | null {
  const names = [
    "DASHSCOPE_API_KEY",
    "ALIBABA_API_KEY",
    "QWEN_API_KEY",
    "ALIBABA_DASHSCOPE_API_KEY",
    "DASHSCOPE_KEY",
  ];
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v) return v;
  }
  return null;
}

type Msg = { role: string; content: unknown };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: fastCorsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...fastCorsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...fastCorsHeaders, "Content-Type": "application/json" },
    });
  }
  const authClient = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_ANON_KEY") || "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...fastCorsHeaders, "Content-Type": "application/json" },
    });
  }

  const key = apiKey();
  if (!key) {
    // No fast-lane credentials: tell the client to use the full chat path.
    return new Response(JSON.stringify({ escalate: true, reason: "fast_lane_unconfigured" }), {
      status: 503,
      headers: { ...fastCorsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: {
    messages?: Msg[];
    customSystem?: string;
    model?: string;
    force?: boolean;
    maxTokens?: number;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...fastCorsHeaders, "Content-Type": "application/json" },
    });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0 || messages.length > 40) {
    return new Response(JSON.stringify({ escalate: true, reason: "unsupported_message_count" }), {
      status: 200,
      headers: { ...fastCorsHeaders, "Content-Type": "application/json" },
    });
  }
  // Text-only fast lane: anything richer goes to the full chat function.
  for (const m of messages) {
    if (typeof m?.content !== "string") {
      return new Response(JSON.stringify({ escalate: true, reason: "non_text_content" }), {
        status: 200,
        headers: { ...fastCorsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  if (!body.force && needsFullChat(messages)) {
    return new Response(JSON.stringify({ escalate: true, reason: "complex_intent" }), {
      status: 200,
      headers: { ...fastCorsHeaders, "Content-Type": "application/json" },
    });
  }

  const system = [FAST_SYSTEM, typeof body.customSystem === "string" ? body.customSystem : ""]
    .filter(Boolean)
    .join("\n\n");

  const payload = {
    model: typeof body.model === "string" && body.model ? body.model : "qwen-flash",
    stream: true,
    stream_options: { include_usage: true },
    enable_thinking: false,
    temperature: 0.6,
    // Chat replies stay short; forced callers (dev agent) may ask for more so
    // long code files are not cut off mid-file.
    max_tokens: Math.min(Math.max(Number(body.maxTokens) || 2048, 256), 8192),
    messages: [{ role: "system", content: system }, ...messages.slice(-16)],
  };

  let upstream: Response | null = null;
  let lastErr = "";
  for (const url of ENDPOINTS) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(payload),
      });
      if (r.ok && r.body) {
        upstream = r;
        break;
      }
      lastErr = `${r.status} ${(await r.text().catch(() => "")).slice(0, 300)}`;
    } catch (e) {
      lastErr = String(e);
    }
  }

  if (!upstream || !upstream.body) {
    console.error("chat-fast upstream failed:", lastErr);
    return new Response(JSON.stringify({ escalate: true, reason: "upstream_unavailable" }), {
      status: 200,
      headers: { ...fastCorsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...fastCorsHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "x-model-used": payload.model,
    },
  });
});
