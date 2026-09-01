/**
 * @doc generate-skill
 * Turns a short conversation ("a YC pitch coach") into a structured skill draft.
 *
 * Request body: { messages: [{ role, content }] }
 * Response: { action: "draft", skill, summary } | { action: "ask", message }
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const headers = {
  ...corsHeaders,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const ENDPOINTS = [
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
  "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
];

function apiKey(): string | null {
  for (const n of [
    "DASHSCOPE_API_KEY",
    "ALIBABA_API_KEY",
    "QWEN_API_KEY",
    "ALIBABA_DASHSCOPE_API_KEY",
    "DASHSCOPE_KEY",
  ]) {
    const v = Deno.env.get(n);
    if (v) return v;
  }
  return null;
}

const TOOLS = [
  "web_search",
  "read_url",
  "image_generation",
  "video_generation",
  "code_interpreter",
  "file_analysis",
  "documents",
  "slides",
  "spreadsheets",
  "memory",
];

const SYSTEM = `You design "skills" (custom expert personas) for the MEGSY assistant.

Always reply with ONE JSON object, no markdown fences, in this exact shape:
{"action":"draft","summary":"<one short friendly sentence in the user's language>","skill":{"name":"","description":"","body":"","triggers":[],"enabled_tools":[],"preferred_model":null}}
or, only when the request is truly empty/meaningless:
{"action":"ask","message":"<one short question in the user's language>"}

Rules:
- Prefer drafting immediately. Never ask more than one question.
- name: 2-4 words. description: one line, under 120 characters.
- body: the system prompt for the expert — role, expertise, method, tone, output format. 120-350 words. Write it in the same language the user used.
- triggers: 3-6 lowercase keywords/phrases that should activate the skill.
- enabled_tools: pick only from ${TOOLS.join(", ")}. Empty array when none fit.
- preferred_model: always null.`;

function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }
  const authClient = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_ANON_KEY") || "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  const key = apiKey();
  if (!key) {
    return new Response(
      JSON.stringify({ action: "ask", message: "The skill designer is not configured yet." }),
      { status: 200, headers },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    messages?: { role: string; content: string }[];
  } | null;
  const history = (body?.messages ?? [])
    .filter((m) => typeof m?.content === "string" && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));

  if (!history.length) {
    return new Response(
      JSON.stringify({ action: "ask", message: "What kind of expert should I build?" }),
      { status: 200, headers },
    );
  }

  let lastError = "";
  for (const endpoint of ENDPOINTS) {
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: "qwen-plus",
          temperature: 0.6,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: SYSTEM }, ...history],
        }),
      });
      if (!resp.ok) {
        lastError = `${resp.status} ${await resp.text()}`;
        continue;
      }
      const data = await resp.json();
      const text = String(data?.choices?.[0]?.message?.content ?? "");
      const parsed = extractJson(text);
      if (!parsed) {
        lastError = "unparsable model output";
        continue;
      }

      if (parsed.action === "draft" && parsed.skill && typeof parsed.skill === "object") {
        const s = parsed.skill as Record<string, unknown>;
        const skill = {
          name: String(s.name ?? "New skill").slice(0, 80),
          description: String(s.description ?? "").slice(0, 200),
          body: String(s.body ?? "").slice(0, 8000),
          triggers: Array.isArray(s.triggers)
            ? s.triggers.slice(0, 8).map((t) => String(t).toLowerCase().slice(0, 40))
            : [],
          enabled_tools: Array.isArray(s.enabled_tools)
            ? s.enabled_tools.map(String).filter((t) => TOOLS.includes(t))
            : [],
          preferred_model: null,
        };
        if (!skill.body.trim()) {
          lastError = "empty body";
          continue;
        }
        return new Response(
          JSON.stringify({ action: "draft", skill, summary: String(parsed.summary ?? "") }),
          { status: 200, headers },
        );
      }

      return new Response(
        JSON.stringify({
          action: "ask",
          message: String(parsed.message ?? "Could you tell me a bit more?"),
        }),
        { status: 200, headers },
      );
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  console.error("generate-skill failed:", lastError);
  return new Response(
    JSON.stringify({ action: "ask", message: "I hit an error building that — try again?" }),
    { status: 200, headers },
  );
});
