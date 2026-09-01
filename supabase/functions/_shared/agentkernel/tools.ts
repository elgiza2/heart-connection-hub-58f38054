/**
 * Tool registry for the kernel.
 *
 * The agent decides which tools a task needs (from the plan) and the kernel runs
 * the independent ones in parallel before the browser opens, so a single task can
 * search the web, load memory and write a file without the user orchestrating it.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { askModel } from "./llm.ts";

export type ToolName =
  | "browser"
  | "web_search"
  | "write_file"
  | "read_file"
  | "remember"
  | "ask_user";

export const TOOLS: Record<ToolName, string> = {
  browser: "Drive a real cloud browser: navigate, click, type, extract.",
  web_search: "Search the public web for facts, URLs and prices.",
  write_file: "Write a text/markdown/CSV artifact the user can download.",
  read_file: "Read a previously produced artifact.",
  remember: "Store a durable fact for future tasks.",
  ask_user: "Pause and ask the user when something is unclear or sensitive.",
};

async function braveKey(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from("brave_keys")
    .select("api_key")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return (data as { api_key?: string } | null)?.api_key?.trim() || Deno.env.get("BRAVE_API_KEY") || null;
}

/** Web search used as pre-execution research. Returns a compact digest. */
export async function webSearch(supabase: SupabaseClient, query: string): Promise<string> {
  const key = await braveKey(supabase);
  if (!key) {
    // Fall back to the model's own knowledge rather than losing the step.
    return await askModel(
      supabase,
      "Answer with 3 short factual bullets. Say 'unknown' when unsure.",
      query,
    );
  }
  try {
    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?count=5&q=${encodeURIComponent(query)}`,
      { headers: { Accept: "application/json", "X-Subscription-Token": key } },
    );
    if (!response.ok) return "";
    const data = (await response.json()) as {
      web?: { results?: { title?: string; url?: string; description?: string }[] };
    };
    return (data.web?.results ?? [])
      .slice(0, 5)
      .map((item) => `- ${item.title ?? ""} — ${item.url ?? ""}\n  ${item.description ?? ""}`)
      .join("\n");
  } catch {
    return "";
  }
}

/** Stores an artifact for the run and returns its public URL. */
export async function writeFile(
  supabase: SupabaseClient,
  runId: string,
  name: string,
  content: string,
): Promise<{ name: string; url: string } | null> {
  const safe = name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "artifact.txt";
  const path = `agent-runs/${runId}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage
    .from("public")
    .upload(path, new Blob([content], { type: "text/plain" }), { upsert: true });
  if (error) return null;
  const { data } = supabase.storage.from("public").getPublicUrl(path);
  return { name: safe, url: data.publicUrl };
}

export async function readFile(supabase: SupabaseClient, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("public").download(path);
  if (error || !data) return "";
  return await data.text();
}
