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

const fastCorsHeaders = {
  ...corsHeaders,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-anon-fingerprint",
};

const FAST_SYSTEM = `You are MEGSY. Answer directly, accurately, and concisely in the user's language.`;

// Route obvious tool/task requests before contacting the model. This keeps the
// model stream safe to paint immediately instead of buffering its first tokens.
// Kept deliberately narrow: every false positive costs the user a full-path
// round trip (seconds) on a turn the fast model could have answered instantly.
const COMPLEX_INTENT =
  /(?:https?:\/\/|ابحث|بحث (?:في|على) (?:الويب|النت)|الطقس|طقس|الأخبار|اخبار|سعر (?:اليوم|الآن)|افتح (?:موقع|رابط)|شغ[ّ]?ل (?:كود|أمر)|نف[ّ]?ذ|أنشئ (?:صورة|فيديو|ملف|عرض|جدول)|اصنع (?:صورة|فيديو)|ارسل (?:بريد|إيميل)|التقويم|اربط|تكامل|مرفق|browse|search (?:the )?web|weather|latest news|run (?:code|command)|terminal|send (?:an )?email|(?:generate|create|make|draw|render)\s+(?:an?\s+)?(?:image|video|audio|clip|picture|poster|pdf|slide)|connector|integration)/i;

function needsFullChat(messages: Msg[]): boolean {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  return typeof lastUser?.content === "string" && COMPLEX_INTENT.test(lastUser.content);
}

/**
 * Identity in the fast lane must never rest on an *unverified* JWT payload:
 * `atob` decoding alone lets anyone forge a `sub` and impersonate a user.
 *
 * Contract:
 *  - the payload is decoded locally for claim sanity checks (exp/iss/role/sub),
 *  - the signature is confirmed against the auth server, but only via a cached
 *    result so the hot path stays free of network round trips,
 *  - an unverified token is downgraded to *guest*, never trusted as a user.
 */
type Claims = { sub?: string; exp?: number; iss?: string; role?: string };

function decodeClaims(token: string): Claims | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const claims = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as Claims;
    if (!claims.exp || claims.exp * 1000 < Date.now()) return null;
    if (typeof claims.sub !== "string" || !claims.sub) return null;
    if (claims.role && claims.role !== "authenticated") return null;
    const expectedIss = `${(Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "")}/auth/v1`;
    if (claims.iss && expectedIss && claims.iss !== expectedIss) return null;
    return claims;
  } catch {
    return null;
  }
}

/** token -> { userId, until } for signature-verified tokens only. */
const verified = new Map<string, { userId: string; until: number }>();
const inflight = new Set<string>();

async function confirmSignature(token: string, expectedSub: string): Promise<void> {
  if (inflight.has(token)) return;
  inflight.add(token);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anon) return;
    const r = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return;
    const body = (await r.json()) as { id?: string };
    if (body?.id && body.id === expectedSub) {
      if (verified.size > 2000) verified.clear();
      verified.set(token, { userId: body.id, until: Date.now() + 10 * 60 * 1000 });
    }
  } catch {
    // network blip: stay in guest mode, retry on the next turn
  } finally {
    inflight.delete(token);
  }
}

/** Returns the user id only when the token's signature was already verified. */
function verifiedUserId(token: string): string | null {
  const claims = decodeClaims(token);
  if (!claims?.sub) return null;
  const hit = verified.get(token);
  if (hit && hit.until > Date.now()) return hit.userId;
  verified.delete(token);
  void confirmSignature(token, claims.sub);
  return null;
}


/**
 * Guest budget: signed-out visitors chat freely, but within limits so the fast
 * lane can't be farmed. Sliding window per fingerprint/IP bucket.
 */
const GUEST_WINDOW_MS = 60 * 60 * 1000;
const GUEST_MAX_PER_WINDOW = 25;
const GUEST_MAX_PER_MINUTE = 6;
const guestHits = new Map<string, number[]>();

function guestAllowance(bucket: string): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  if (guestHits.size > 5000) guestHits.clear();
  const hits = (guestHits.get(bucket) || []).filter((t) => now - t < GUEST_WINDOW_MS);
  const lastMinute = hits.filter((t) => now - t < 60_000);
  if (lastMinute.length >= GUEST_MAX_PER_MINUTE) {
    guestHits.set(bucket, hits);
    return { ok: false, retryAfterSeconds: 30 };
  }
  if (hits.length >= GUEST_MAX_PER_WINDOW) {
    guestHits.set(bucket, hits);
    const oldest = hits[0] ?? now;
    return { ok: false, retryAfterSeconds: Math.max(30, Math.ceil((GUEST_WINDOW_MS - (now - oldest)) / 1000)) };
  }
  hits.push(now);
  guestHits.set(bucket, hits);
  return { ok: true, retryAfterSeconds: 0 };
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

  // Guests may chat without signing in. Identity is best-effort: a verified
  // user id, else a guest bucket keyed by fingerprint or client IP. Guests are
  // never blocked outright — only rate limited (see `guestAllowance`).
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const isAppToken = Boolean(token) && token !== anonKey;
  const userId = isAppToken ? verifiedUserId(token) : null;

  if (!userId) {
    const bucket =
      req.headers.get("x-anon-fingerprint") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "anon";
    const allowance = guestAllowance(bucket);
    if (!allowance.ok) {
      return new Response(
        JSON.stringify({
          error: "Guest limit reached. Sign in to keep chatting.",
          code: "guest_limit",
          retryAfterSeconds: allowance.retryAfterSeconds,
        }),
        {
          status: 429,
          headers: {
            ...fastCorsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(allowance.retryAfterSeconds),
          },
        },
      );
    }
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
    // Guests get shorter answers than signed-in users (still useful, but not a
    // free long-form generation endpoint).
    max_tokens: Math.min(Math.max(Number(body.maxTokens) || 2048, 256), userId ? 8192 : 1200),
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
