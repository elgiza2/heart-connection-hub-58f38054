/**
 * Durable agent memory (`agent_memory`).
 *
 * Read before every task, written after it — so the agent remembers things a
 * human would: "this site asks for an OTP", "the user prefers paying by card",
 * "clicking Continue twice did not work last time".
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { askJson } from "./llm.ts";

export type MemoryKind = "user_fact" | "site_fact" | "preference" | "lesson";

export interface MemoryRow {
  id?: string;
  kind: MemoryKind;
  domain?: string | null;
  key: string;
  value: string;
  confidence?: number;
}

const MAX_RECALL = 24;

/** Best-effort domain extraction from a free-text goal. */
export function domainsFromText(text: string): string[] {
  const found = new Set<string>();
  const re = /\b(?:https?:\/\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/gi;
  for (const match of text.matchAll(re)) {
    const host = match[1].toLowerCase().replace(/^www\./, "");
    if (host.includes(".") && !host.endsWith(".")) found.add(host);
  }
  return [...found];
}

/** Loads the memories worth injecting into this task's prompt. */
export async function recallMemory(
  supabase: SupabaseClient,
  userId: string,
  goal: string,
): Promise<MemoryRow[]> {
  const domains = domainsFromText(goal);
  const { data } = await supabase
    .from("agent_memory")
    .select("id,kind,domain,key,value,confidence")
    .eq("user_id", userId)
    .order("confidence", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(120);
  const rows = (data ?? []) as MemoryRow[];
  const scored = rows
    .map((row) => {
      let score = row.confidence ?? 0.6;
      if (row.domain && domains.includes(row.domain)) score += 1.5;
      if (!row.domain) score += 0.4; // global facts / preferences
      if (row.kind === "preference" || row.kind === "user_fact") score += 0.5;
      const words = `${row.key} ${row.value}`.toLowerCase();
      if (goal.toLowerCase().split(/\s+/).some((w) => w.length > 4 && words.includes(w))) {
        score += 0.6;
      }
      return { row, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RECALL)
    .map((entry) => entry.row);

  const ids = scored.map((row) => row.id).filter(Boolean) as string[];
  if (ids.length) {
    await supabase
      .from("agent_memory")
      .update({ last_used_at: new Date().toISOString() })
      .in("id", ids);
  }
  return scored;
}

/** Renders memories as a compact prompt block. */
export function memoryBlock(rows: MemoryRow[]): string {
  if (!rows.length) return "";
  const lines = rows.map(
    (row) => `- [${row.kind}${row.domain ? ` @${row.domain}` : ""}] ${row.key}: ${row.value}`,
  );
  return `What you already know (from previous tasks):\n${lines.join("\n")}`;
}

/** Upserts one memory, merging on (user, kind, domain, key). */
export async function remember(
  supabase: SupabaseClient,
  userId: string,
  row: MemoryRow & { source_run_id?: string | null },
): Promise<void> {
  const key = row.key.trim().slice(0, 200);
  const value = row.value.trim().slice(0, 2000);
  if (!key || !value) return;
  const domain = row.domain?.trim().toLowerCase() || null;
  let lookup = supabase
    .from("agent_memory")
    .select("id,hits,confidence")
    .eq("user_id", userId)
    .eq("kind", row.kind)
    .eq("key", key);
  lookup = domain ? lookup.eq("domain", domain) : lookup.is("domain", null);
  const { data: found } = await lookup.maybeSingle();


  if (found?.id) {
    await supabase
      .from("agent_memory")
      .update({
        value,
        hits: (found.hits ?? 0) + 1,
        confidence: Math.min(1, (found.confidence ?? 0.6) + 0.1),
        source_run_id: row.source_run_id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", found.id);
    return;
  }
  await supabase.from("agent_memory").insert({
    user_id: userId,
    kind: row.kind,
    domain,
    key,
    value,
    confidence: row.confidence ?? 0.6,
    source_run_id: row.source_run_id ?? null,
  });
}

/**
 * Post-task learning: asks the model which reusable facts this run produced and
 * stores them. Silently does nothing when the model is unavailable.
 */
export async function learnFromRun(
  supabase: SupabaseClient,
  userId: string,
  runId: string,
  goal: string,
  trace: string[],
  outcome: string,
): Promise<void> {
  const system = [
    "You extract durable, reusable memories from a completed browser-automation run.",
    "Return JSON only: {\"memories\":[{\"kind\":\"user_fact|site_fact|preference|lesson\",\"domain\":\"example.com|null\",\"key\":\"short slug\",\"value\":\"one sentence\"}]}",
    "Keep at most 5. Skip anything one-off, secret (passwords, OTP codes, card numbers), or already obvious.",
    "Prefer facts that make the NEXT task on the same site or for the same user faster.",
  ].join("\n");
  const user = [
    `Goal: ${goal}`,
    `Outcome: ${outcome}`,
    "Trace:",
    trace.slice(-40).join("\n"),
  ].join("\n\n");

  const parsed = await askJson<{ memories?: MemoryRow[] }>(supabase, system, user);
  for (const memory of parsed?.memories ?? []) {
    if (!memory?.key || !memory?.value) continue;
    const kind: MemoryKind = (
      ["user_fact", "site_fact", "preference", "lesson"] as MemoryKind[]
    ).includes(memory.kind)
      ? memory.kind
      : "site_fact";
    await remember(supabase, userId, {
      kind,
      domain: memory.domain && String(memory.domain) !== "null" ? String(memory.domain) : null,
      key: String(memory.key),
      value: String(memory.value),
      source_run_id: runId,
    });
  }
}
