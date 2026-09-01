/**
 * @doc Browser-side bridge to the chat model.
 *
 * The agent kernel normally runs inside the `long-run` edge function. When that
 * function is unavailable (deploy channel down, 404, 500) the kernel falls back
 * to running in the tab, and it still uses the SAME model endpoint the main chat
 * uses — the already-deployed `chat-alibaba` function — so no new deploy is
 * needed. Verified live: `chat-alibaba` streams SSE `choices[].delta.content`.
 */
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_MODEL } from "@/lib/defaultModel";

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-alibaba`;


/** One completion from the chat model. Returns "" when the call fails. */
export async function askModel(
  system: string,
  messages: LlmMessage[],
  timeoutMs = 120_000,
): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return "";

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages,
        model: DEFAULT_MODEL,
        chatMode: "normal",
        customSystem: system,
      }),
      signal: controller.signal,
    });
    if (!resp.ok || !resp.body) return "";

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
    return out;
  } catch {
    return "";
  } finally {
    window.clearTimeout(timer);
  }
}

/** Same call, but parses the first JSON object/array found in the reply. */
export async function askJson<T = Record<string, unknown>>(
  system: string,
  messages: LlmMessage[],
  timeoutMs = 120_000,
): Promise<T | null> {
  return extractJson<T>(await askModel(system, messages, timeoutMs));
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
