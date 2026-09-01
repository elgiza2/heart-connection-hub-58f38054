/**
 * Semantic user memory for the MEGSY chat turn.
 *
 * recall()   — scores the user's stored facts against the current question and
 *              returns a compact block for the system prompt (no model call, so
 *              it costs nothing in time-to-first-token).
 * remember() — after the turn, a small model extracts durable facts and they are
 *              written back to `agent_memory`. Runs detached from the response.
 */

import type { CallFn } from "./orchestrator.ts";

const DOMAIN = "chat";
const MAX_RECALL = 12;
const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "you", "your", "من", "في", "على",
  "عن", "الي", "إلى", "هو", "هي", "ما", "مع", "ان", "أن", "كان", "ده", "دي",
]);

type MemoryRow = { kind: string; key: string; value: string; confidence: number };

function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? []).filter((t) => !STOPWORDS.has(t));
}

function score(row: MemoryRow, wanted: Set<string>): number {
  const bag = new Set(tokens(`${row.key} ${row.value}`));
  let overlap = 0;
  for (const token of bag) if (wanted.has(token)) overlap += 1;
  // Preferences and identity facts stay useful even without lexical overlap.
  const durable = /preference|identity|profile|style|constraint/i.test(row.kind) ? 1.2 : 0;
  return overlap + durable + (row.confidence || 0) * 0.5;
}

/** Compact memory block for the system prompt, or "" when nothing is relevant. */
export async function recall(admin: any, userId: string | null, question: string): Promise<string> {
  if (!userId) return "";
  const { data } = await admin
    .from("agent_memory")
    .select("kind,key,value,confidence")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as MemoryRow[];
  if (!rows.length) return "";

  const wanted = new Set(tokens(question));
  const picked = rows
    .map((row) => ({ row, weight: score(row, wanted) }))
    .filter((entry) => entry.weight > 0.9)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_RECALL)
    .map(({ row }) => `- (${row.kind}) ${row.key}: ${String(row.value).slice(0, 300)}`);
  if (!picked.length) return "";

  return `USER MEMORY (facts remembered from earlier conversations — apply silently, never list them back, and prefer the current message when it contradicts them):\n${
    picked.join("\n")
  }`;
}

const EXTRACT_PROMPT =
  `Extract ONLY durable facts about the user worth remembering across future conversations.
Return JSON: {"facts":[{"kind":"preference|identity|project|constraint","key":"<short slug>","value":"<one sentence>"}]}
Rules: at most 4 facts, no facts about this single task, no transient details, no guesses, nothing the user did not state. Return {"facts":[]} when nothing qualifies.`;

/** Extracts and persists durable facts. Best-effort: never throws. */
export async function remember(
  admin: any,
  call: CallFn,
  userId: string | null,
  question: string,
  answer: string,
): Promise<void> {
  if (!userId || question.trim().length < 12) return;
  try {
    const raw = await call(["qwen3.8-flash", "qwen-flash", "qwen-plus"], {
      temperature: 0,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EXTRACT_PROMPT },
        {
          role: "user",
          content: `User said: ${question.slice(0, 3000)}\n\nAssistant replied: ${answer.slice(0, 2000)}`,
        },
      ],
    });
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim());
    const facts = Array.isArray(parsed?.facts) ? parsed.facts.slice(0, 4) : [];
    for (const fact of facts) {
      const kind = String(fact?.kind ?? "").trim().toLowerCase();
      const key = String(fact?.key ?? "").trim().slice(0, 120);
      const value = String(fact?.value ?? "").trim().slice(0, 600);
      if (!key || !value || !["preference", "identity", "project", "constraint"].includes(kind)) continue;
      const { data: existing } = await admin
        .from("agent_memory")
        .select("id")
        .eq("user_id", userId)
        .eq("domain", DOMAIN)
        .eq("kind", kind)
        .eq("key", key)
        .maybeSingle();
      if (existing?.id) {
        await admin.from("agent_memory")
          .update({ value, updated_at: new Date().toISOString(), last_used_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await admin.from("agent_memory").insert({
          user_id: userId,
          domain: DOMAIN,
          kind,
          key,
          value,
          confidence: 0.7,
        });
      }
    }
  } catch (error) {
    console.error("chat-alibaba memory write skipped", error);
  }
}
