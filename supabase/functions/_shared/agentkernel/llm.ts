/**
 * Server-only LLM bridge for the agent kernel.
 *
 * The kernel runs from cron ticks where there is no user JWT, so it cannot go
 * through the user-facing chat function. It talks to the same Alibaba (Qwen)
 * models directly, using an active key from `alibaba_keys` (service-role read).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * Endpoints tried in order: the international DashScope region first, then the
 * mainland one. A key entitled to only one region used to look "rejected".
 */
const BASES = [
  Deno.env.get("ALIBABA_API_BASE") || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  "https://dashscope.aliyuncs.com/compatible-mode/v1",
];
/** Model ladder: a model the key is not entitled to must not kill the run. */
const MODELS = [
  Deno.env.get("AGENT_KERNEL_MODEL") || "qwen-plus",
  "qwen-max",
  "qwen-turbo",
];

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Every env secret name the project uses for the DashScope/Alibaba key. */
const ENV_KEY_NAMES = [
  "DASHSCOPE_API_KEY",
  "ALIBABA_API_KEY",
  "QWEN_API_KEY",
  "ALIBABA_DASHSCOPE_API_KEY",
  "DASHSCOPE_KEY",
];

/**
 * The project secret comes FIRST: it is the key that is actually entitled to
 * the text models. Rows in `alibaba_keys` are workspace/media keys that answer
 * 401/403 for chat, so relying on them left the planner with no answer at all.
 */
async function apiKeys(supabase: SupabaseClient): Promise<Array<{ id?: string; key: string }>> {
  const out: Array<{ id?: string; key: string }> = [];
  const seen = new Set<string>();
  for (const name of ENV_KEY_NAMES) {
    const value = Deno.env.get(name)?.trim();
    if (value && !seen.has(value)) {
      seen.add(value);
      out.push({ key: value });
    }
  }
  const { data } = await supabase
    .from("alibaba_keys")
    .select("id,api_key,category")
    .eq("status", "active")
    .in("category", ["qwen", "memory", "text"])
    .order("last_used_at", { ascending: true, nullsFirst: true })
    .limit(6);
  for (const row of (data ?? []) as { id?: string; api_key?: string }[]) {
    const key = row.api_key?.trim();
    // Only real DashScope keys — the table also holds junk/placeholder rows.
    if (key && key.startsWith("sk-") && !seen.has(key)) {
      seen.add(key);
      out.push({ id: row.id, key });
    }
  }
  if (!out.length) throw new Error("no_model_key");
  return out;
}


/**
 * One non-streaming completion. Returns "" on any failure so the caller can
 * degrade gracefully instead of killing a long run.
 *
 * No artificial timeout: reasoning replies routinely take a while and aborting
 * would throw away work that still gets billed.
 */
export async function askModel(
  supabase: SupabaseClient,
  system: string,
  user: string,
): Promise<string> {
  let keys: Array<{ id?: string; key: string }>;
  try {
    keys = await apiKeys(supabase);
  } catch (error) {
    console.error("agentkernel llm has no usable key", error);
    return "";
  }

  // Try each active key in turn: a rejected key is a real, recoverable failure,
  // so it is retired instead of stalling every future tick on the same 401.
  for (const entry of keys) {
    try {
      const response = await fetch(`${BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${entry.key}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ] satisfies LlmMessage[],
          temperature: 0.2,
        }),
      });
      if (response.status === 401 || response.status === 403) {
        // The key is rejected for this endpoint only — other functions may use
        // it against a different region, so never retire it here.
        console.error(`agentkernel llm key rejected [${response.status}] — trying next key`);
        continue;
      }
      if (response.status === 429 || response.status >= 500) {
        console.error(`agentkernel llm transient [${response.status}] — trying next key`);
        continue;
      }
      if (!response.ok) {
        console.error(`agentkernel llm [${response.status}]: ${await response.text()}`);
        return "";
      }
      const data = (await response.json().catch(() => null)) as
        | { choices?: { message?: { content?: string } }[] }
        | null;
      const text = data?.choices?.[0]?.message?.content ?? "";
      if (entry.id) {
        await supabase
          .from("alibaba_keys")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", entry.id);
      }
      return text;
    } catch (error) {
      console.error("agentkernel llm failed", error);
    }
  }
  return await askGateway(system, user);
}

/**
 * Fallback provider: the Lovable AI Gateway. Used only when no Alibaba key
 * answers, so a rejected or exhausted key never leaves an autonomous task
 * unable to decide its next step.
 */
async function askGateway(system: string, user: string): Promise<string> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return "";
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: GATEWAY_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ] satisfies LlmMessage[],
      }),
    });
    if (!response.ok) {
      console.error(`agentkernel gateway [${response.status}]: ${await response.text()}`);
      return "";
    }
    const data = (await response.json().catch(() => null)) as
      | { choices?: { message?: { content?: string } }[] }
      | null;
    return data?.choices?.[0]?.message?.content ?? "";
  } catch (error) {
    console.error("agentkernel gateway failed", error);
    return "";
  }
}

/** Same call, parsing the first JSON object/array in the reply. */
export async function askJson<T>(
  supabase: SupabaseClient,
  system: string,
  user: string,
): Promise<T | null> {
  return extractJson<T>(await askModel(supabase, system, user));
}

export function extractJson<T>(text: string): T | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;
  const opener = candidate[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < candidate.length; i += 1) {
    const ch = candidate[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === opener) depth += 1;
    else if (ch === closer) {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1)) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
