/**
 * @doc Server-only bridge to the same Alibaba model the main chat uses.
 * The Dev Agent never talks to another provider — it calls the existing
 * `chat-alibaba` edge function and accumulates the SSE stream into one blob.
 */
import { DEFAULT_MODEL } from "../defaultModel";

/** Last transport-level failure, surfaced in run events for debugging. */
export let lastModelError = "";

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * One completion from the chat model. Returns "" when the call fails.
 *
 * The fast lane (`chat-fast`) answers in ~1s and finishes a multi-file coding
 * reply in ~10s, while `chat-alibaba` buffers long enough on big coding prompts
 * to hit its 150s idle timeout — so the fast lane is the primary path and the
 * full model is only the fallback.
 */
export async function askModel(
  token: string,
  system: string,
  messages: LlmMessage[],
  timeoutMs = 0,
): Promise<string> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    lastModelError = "SUPABASE_URL missing";
    return "";
  }
  const fast = await callChat(supabaseUrl, "chat-fast", token, system, messages, timeoutMs, {
    model: "qwen-flash",
    force: true,
    maxTokens: 8192,
    system,
  });
  if (fast) return fast;
  return await callChat(supabaseUrl, "chat-alibaba", token, system, messages, timeoutMs, {
    model: DEFAULT_MODEL,
    chatMode: "normal",
  });
}

async function callChat(
  supabaseUrl: string,
  fn: string,
  token: string,
  system: string,
  messages: LlmMessage[],
  timeoutMs: number,
  extra: Record<string, unknown>,
): Promise<string> {
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  const url = `${supabaseUrl}/functions/v1/${fn}`;
  // No artificial deadline by default: a coding reply that writes several full
  // files routinely streams for minutes, and aborting throws that work away.
  const controller = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: publishableKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ messages, customSystem: system, ...extra }),
      signal: controller.signal,
    });
    if (!resp.ok || !resp.body) {
      lastModelError = `${fn} HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`;
      console.error("[devagent] model call failed", lastModelError);
      return "";
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let out = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          const j = JSON.parse(raw) as Record<string, any>;
          out += j?.choices?.[0]?.delta?.content ?? j?.delta ?? j?.content ?? "";
        } catch {
          /* keepalive frame */
        }
      }
    }
    if (!out) lastModelError = `${fn}: empty stream`;
    return out;
  } catch (e) {
    lastModelError = e instanceof Error ? `${fn} ${e.name}: ${e.message}` : String(e);
    console.error("[devagent] model call error", lastModelError);
    return "";
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Same call, but parses the first JSON object/array found in the reply. */
export async function askJson<T = Record<string, unknown>>(
  token: string,
  system: string,
  messages: LlmMessage[],
  timeoutMs = 0,
): Promise<T | null> {
  const text = await askModel(token, system, messages, timeoutMs);
  return extractJson<T>(text);
}

export function extractJson<T = Record<string, unknown>>(text: string): T | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;
  const opener = candidate[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === opener) depth++;
    else if (ch === closer) {
      depth--;
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
