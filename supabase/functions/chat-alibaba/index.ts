/**
 * Full MEGSY chat endpoint.
 *
 * This local implementation replaces the previously external-only function
 * while preserving the frontend's OpenAI-compatible SSE contract.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { lastUserText, research, researchContext } from "./research.ts";

const headers = {
  ...corsHeaders,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-anon-fingerprint",
};

const ENDPOINTS = [
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
  "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
];

const SYSTEM = `You are MEGSY, an autonomous general-purpose AI agent.
Today is ${new Date().toISOString().slice(0, 10)} and the current year is 2026. Never describe older information as current.
Complete open-ended tasks by decomposing them. Produce polished final answers in the user's language, hide raw tool traces, cite sources for research, and never claim an action succeeded without evidence.
You can work with software repositories, web research, documents, data, media, websites, integrations, and specialist agents. When a requested capability is unavailable in this immediate chat turn, explain the exact next executable step instead of pretending it ran.`;

type Message = { role: "system" | "user" | "assistant"; content: unknown };
type RequestBody = {
  action?: string;
  agent?: string;
  messages?: Message[];
  model?: string;
  tier?: string;
  customSystem?: string | null;
  searchEnabled?: boolean;
  resume_id?: string;
  maxTokens?: number;
};

type ChatUpstream = {
  response: Response;
  keyId?: string;
  format: "chat" | "responses";
};

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function envKey(): string | null {
  for (const name of [
    "DASHSCOPE_API_KEY",
    "ALIBABA_API_KEY",
    "QWEN_API_KEY",
    "ALIBABA_DASHSCOPE_API_KEY",
    "DASHSCOPE_KEY",
  ]) {
    const value = Deno.env.get(name)?.trim();
    if (value) return value;
  }
  return null;
}

async function modelKeys(admin: ReturnType<typeof createClient>) {
  const result: Array<{ id?: string; key: string }> = [];
  const { data } = await admin
    .from("alibaba_keys")
    .select("id,api_key")
    .eq("status", "active")
    .in("category", ["qwen", "memory", "text"])
    .order("last_used_at", { ascending: true, nullsFirst: true })
    .limit(6);
  for (const row of data ?? []) {
    const key = typeof row.api_key === "string" ? row.api_key.trim() : "";
    if (key) result.push({ id: row.id, key });
  }
  const fallback = envKey();
  if (fallback && !result.some((entry) => entry.key === fallback)) result.push({ key: fallback });
  return result;
}

function normalizeMessages(input: Message[]): Message[] | null {
  if (!input.length || input.length > 80) return null;
  const output: Message[] = [];
  for (const message of input.slice(-40)) {
    if (!message || !["system", "user", "assistant"].includes(message.role)) return null;
    if (typeof message.content !== "string" && !Array.isArray(message.content)) return null;
    output.push({ role: message.role, content: message.content });
  }
  return output;
}

/** True when the upstream rejected the request because the model is unavailable. */
function isModelError(status: number, detail: string): boolean {
  return (
    status === 404 ||
    /model|not_?found|not exist|unsupported|no access|InvalidParameter/i.test(detail)
  );
}

/**
 * Calls Alibaba Model Studio, trying each candidate model in turn (Qwen and the
 * third-party models Alibaba hosts) and each active key, across both regions.
 */
async function callAlibaba(
  admin: ReturnType<typeof createClient>,
  models: string[],
  payload: Record<string, unknown>,
): Promise<(ChatUpstream & { model: string }) | null> {
  const keys = await modelKeys(admin);
  models: for (const model of models) {
    for (const entry of keys) {
      for (const endpoint of ENDPOINTS) {
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${entry.key}` },
            body: JSON.stringify({ ...payload, model }),
          });
          if (response.ok) return { response, keyId: entry.id, format: "chat", model };
          const detail = (await response.text().catch(() => "")).slice(0, 500);
          console.error(`chat-alibaba upstream ${model} [${response.status}]: ${detail}`);
          if (isModelError(response.status, detail)) continue models;
          if (![401, 403, 429].includes(response.status) && response.status < 500) return null;
        } catch (error) {
          console.error("chat-alibaba upstream request failed", error);
        }
      }
    }
  }
  return null;
}


async function callGateway(messages: Message[]): Promise<ChatUpstream | null> {
  const key = Deno.env.get("LOVABLE_API_KEY")?.trim();
  if (!key) return null;
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.6-sol",
        input: messages,
        stream: true,
        store: false,
        reasoning: { effort: "medium", summary: "auto" },
        include: ["reasoning.encrypted_content"],
      }),
    });
    return { response, format: "responses" };
  } catch (error) {
    console.error("chat-alibaba gateway request failed", error);
    return null;
  }
}

function gatewayAsChatStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  return new ReadableStream({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) emitGatewayLine(buffer, controller, encoder);
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        let emitted = false;
        for (const line of lines) emitted = emitGatewayLine(line, controller, encoder) || emitted;
        if (emitted) return;
      }
    },
    cancel() {
      return reader.cancel();
    },
  });
}

function emitGatewayLine(
  line: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
): boolean {
  if (!line.startsWith("data:")) return false;
  const raw = line.slice(5).trim();
  if (!raw || raw === "[DONE]") return false;
  try {
    const event = JSON.parse(raw) as Record<string, any>;
    const text = event.type === "response.output_text.delta" ? event.delta : null;
    const reasoning = event.type === "response.reasoning_summary_text.delta" ? event.delta : null;
    if (!text && !reasoning) return false;
    const delta = text ? { content: text } : { reasoning_content: reasoning };
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`));
    return true;
  } catch {
    return false;
  }
}

async function personalization(admin: ReturnType<typeof createClient>, userId: string) {
  const { data: memories } = await admin
    .from("agent_memory")
    .select("key,value")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(30);
  const prompt = `Infer a conservative personalization profile from these memories. Do not invent facts.
Return JSON only with keys call_name, profession, about, interests (array), ai_traits, custom_instructions.
Memories: ${JSON.stringify(memories ?? []).slice(0, 10000)}`;
  const result = await callAlibaba(admin, {
    model: "qwen-plus",
    stream: false,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }],
  });
  if (!result) return json({ error: "Personalization service unavailable" }, 503);
  const data = await result.response.json().catch(() => null) as any;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return json({ error: "No suggestions returned" }, 503);
  try {
    return json({ suggestion: JSON.parse(content.replace(/^```json\s*|\s*```$/g, "")) });
  } catch {
    return json({ error: "Invalid personalization response" }, 503);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json({ error: "Server misconfigured" }, 503);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  let userId: string | null = null;
  if (bearer && bearer !== anonKey) {
    const auth = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data } = await auth.auth.getUser(bearer);
    userId = data.user?.id ?? null;
  }

  if (body.action === "ingest_attachment") return json({ ok: true });
  if (body.action === "personalization_suggest") {
    if (!userId) return json({ error: "Authentication required", code: "auth_required" }, 403);
    return personalization(admin, userId);
  }

  const messages = normalizeMessages(Array.isArray(body.messages) ? body.messages : []);
  if (!messages) return json({ error: "A valid messages array is required" }, 400);
  if (!userId && !req.headers.get("x-anon-fingerprint")) {
    return json({ error: "Guest identity required", code: "auth_required" }, 403);
  }

  const question = lastUserText(messages);
  const profile = routeProfile(question, body.agent);
  const tierBoost = body.tier === "ultra" || body.tier === "pro";
  const candidates = profileModels(profile, body.model);
  const models = tierBoost && profile.id === "general" ? ["qwen-max", ...candidates] : candidates;

  const preFrames: Record<string, unknown>[] = [
    { status: "thinking", agent: profile.id, agent_label: profile.labelAr },
  ];
  let liveContext = "";
  const wantsResearch = profile.research === "always"
    ? body.searchEnabled !== false
    : profile.research === "auto" && body.searchEnabled !== false;
  if (wantsResearch) {
    try {
      const { findings, queries, digest } = await research(
        admin,
        question,
        (frame) => preFrames.push(frame),
        profile.research === "always",
      );
      liveContext = researchContext(findings, queries, digest);
    } catch (error) {
      console.error("chat-alibaba research pre-pass failed", error);
    }
  }

  const system = [
    SYSTEM,
    profileSystem(profile),
    typeof body.customSystem === "string" ? body.customSystem : "",
    liveContext,
  ]
    .filter(Boolean)
    .join("\n\n");
  let result: (ChatUpstream & { model?: string }) | null = await callAlibaba(admin, models, {
    stream: true,
    stream_options: { include_usage: true },
    enable_search: body.searchEnabled === true && !liveContext,
    enable_thinking: false,
    temperature: profile.temperature,
    max_tokens: Math.min(Math.max(Number(body.maxTokens) || 8192, 512), 16384),
    messages: [{ role: "system", content: system }, ...messages],
  });
  if (!result) {
    result = await callGateway([{ role: "system", content: system }, ...messages]);
  }

  if (!result) return json({ error: "Chat service temporarily unavailable" }, 503);
  if (!result.response.ok) {
    const detail = await result.response.text().catch(() => "");
    const status = result.response.status;
    console.error(`chat-alibaba fallback [${status}]: ${detail.slice(0, 500)}`);
    if ([400, 401, 402, 403, 429].includes(status)) {
      return json({ error: detail || "AI provider request failed", status }, status);
    }
    return json({ error: "Chat service temporarily unavailable" }, 503);
  }
  if (!result.response.body) return json({ error: "Chat service temporarily unavailable" }, 503);

  if (result.keyId) {
    void admin.from("alibaba_keys").update({ last_used_at: new Date().toISOString() }).eq("id", result.keyId);
  }

  const source = result.format === "responses"
    ? gatewayAsChatStream(result.response.body)
    : result.response.body;
  const upstreamReader = source.getReader();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "thinking", model })}\n\n`));
      if (body.resume_id) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: "resume_id", resumeId: body.resume_id })}\n\n`));
      }
      for (const frame of preFrames) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
      }
      try {
        while (true) {
          const { done, value } = await upstreamReader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
      } catch (error) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : "Stream interrupted" })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
    cancel() {
      return upstreamReader.cancel();
    },
  });

  return new Response(stream, {
    headers: {
      ...headers,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "x-model-used": model,
    },
  });
});