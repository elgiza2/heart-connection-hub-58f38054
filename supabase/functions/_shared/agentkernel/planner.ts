/**
 * plan -> execute -> self-critique.
 *
 * The plan is written before the browser opens and stored in `agent_plans`.
 * When the provider says the task finished, the kernel reviews the trace and
 * the final output and decides: pass, retry (with a corrective task), or ask.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { askJson } from "./llm.ts";

export interface Plan {
  id: string;
  steps: string[];
  clarify?: string | null;
  tools?: string[];
  kind?: "browser" | "agentic";
}

export type PlanRisk = "low" | "medium" | "high";

const HIGH_RISK_GOAL = /\b(pay|payment|purchase|buy|checkout|transfer|wire|send (?:an? )?(?:email|message)|publish|post publicly|delete|drop table|remove permanently|cancel subscription|close account|change permissions?|grant access|deploy|production|push)\b|(?:ادفع|دفع|شراء|حوّل|تحويل|احذف|حذف|انشر|إرسال|ارسل|صلاحيات|نشر)/i;
const MEDIUM_RISK_GOAL = /\b(edit|update|write|create|upload|install|connect|configure|commit)\b|(?:عدّل|تعديل|اكتب|أنشئ|ارفع|ثبّت|اربط|اضبط)/i;

/** Deterministic safety classification; the model cannot downgrade it. */
export function classifyPlanRisk(goal: string): PlanRisk {
  if (HIGH_RISK_GOAL.test(goal)) return "high";
  if (MEDIUM_RISK_GOAL.test(goal)) return "medium";
  return "low";
}

export interface Critique {
  verdict: "pass" | "retry" | "ask";
  critique: string;
  fix_instruction?: string | null;
  question?: string | null;
}

const PLAN_SYSTEM = [
  "You plan a real task for a fully autonomous agent before it runs, like a careful human assistant.",
  'Return JSON only: {"kind":"browser|agentic","steps":["..."],"tools":["browser","web_search","run_code","mcp_call","write_file"],"clarify":"question or null","success_criteria":"one sentence"}',
  '"kind":"browser" ONLY when the whole job is operating a website UI (login, forms, clicking, scraping a UI).',
  '"kind":"agentic" for everything else: coding, data work, file/document production, API and MCP integrations, or mixed jobs — the agent can still hand a browser sub-task to the browser from there.',
  "3-8 steps, each a concrete observable action. Use the provided memories: never re-discover something already known.",
  'Set "clarify" ONLY when the goal cannot be attempted at all without an answer (missing target, missing account, ambiguous amount).',
  'List every tool the task genuinely needs in "tools" — you decide, not the user.',
].join("\n");


/** Creates and persists the plan for a run. */
export async function makePlan(
  supabase: SupabaseClient,
  run: { id: string; user_id: string; goal: string },
  memoryText: string,
): Promise<Plan & { clarify: string | null; success_criteria: string | null }> {
  const parsed = await askJson<{
    kind?: "browser" | "agentic";
    steps?: string[];
    tools?: string[];
    clarify?: string | null;
    success_criteria?: string | null;
  }>(supabase, PLAN_SYSTEM, [`Goal: ${run.goal}`, memoryText].filter(Boolean).join("\n\n"));

  const steps = (parsed?.steps ?? []).map((step) => String(step)).slice(0, 8);
  const tools = (parsed?.tools ?? ["browser"]).map((tool) => String(tool)).slice(0, 6);
  const clarify =
    parsed?.clarify && String(parsed.clarify).toLowerCase() !== "null"
      ? String(parsed.clarify)
      : null;

  const { data } = await supabase
    .from("agent_plans")
    .insert({
      run_id: run.id,
      user_id: run.user_id,
      goal: run.goal,
      steps: { steps, tools, success_criteria: parsed?.success_criteria ?? null },
    })
    .select("id")
    .single();

  return {
    id: (data as { id?: string } | null)?.id ?? "",
    steps,
    tools,
    clarify,
    success_criteria: parsed?.success_criteria ?? null,
    kind: parsed?.kind === "browser" ? "browser" : "agentic",
  };
}

/** Reviews a finished run against its own plan. */
export async function critique(
  supabase: SupabaseClient,
  args: {
    goal: string;
    steps: string[];
    successCriteria?: string | null;
    trace: string[];
    output: string | null;
    round: number;
  },
): Promise<Critique> {
  const system = [
    "You are the reviewer of a browser-automation run that just reported success.",
    'Return JSON only: {"verdict":"pass|retry|ask","critique":"2 sentences max","fix_instruction":"what to do differently, or null","question":"question for the user, or null"}',
    'Answer honestly: was the goal ACTUALLY achieved? A run that only "looks" done (form not submitted, no confirmation, wrong item) is a retry.',
    'Use "ask" only when finishing needs information or permission the agent cannot get itself.',
  ].join("\n");
  const user = [
    `Goal: ${args.goal}`,
    args.successCriteria ? `Success criteria: ${args.successCriteria}` : "",
    `Plan: ${args.steps.join(" | ")}`,
    `Review round: ${args.round}`,
    "Trace:",
    args.trace.slice(-40).join("\n"),
    `Final output: ${args.output ?? "(none)"}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const parsed = await askJson<Critique>(supabase, system, user);
  const verdict: Critique["verdict"] =
    parsed?.verdict === "retry" || parsed?.verdict === "ask" ? parsed.verdict : "pass";
  return {
    verdict,
    critique: parsed?.critique ? String(parsed.critique) : "No review available.",
    fix_instruction: parsed?.fix_instruction ? String(parsed.fix_instruction) : null,
    question: parsed?.question ? String(parsed.question) : null,
  };
}

/** Persists the review outcome on the plan row. */
export async function savePlanReview(
  supabase: SupabaseClient,
  planId: string,
  round: number,
  review: Critique,
): Promise<void> {
  if (!planId) return;
  await supabase
    .from("agent_plans")
    .update({
      review_round: round,
      critique: review.critique,
      verdict: review.verdict,
      updated_at: new Date().toISOString(),
    })
    .eq("id", planId);
}
