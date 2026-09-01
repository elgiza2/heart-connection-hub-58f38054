/**
 * Manager-level orchestration for the internal agent team.
 *
 * Flow per turn:
 *   1. plan()  — a fast model classifies the request semantically (better than
 *      keyword routing), rates its complexity and, when needed, splits it into
 *      bounded subtasks addressed to specific specialists.
 *   2. runTeam() — the specialists run IN PARALLEL as non-streaming workers and
 *      each returns a compact brief.
 *   3. teamContext() — the briefs are folded into the system prompt of the final
 *      streaming answer, which is produced by the lead specialist.
 *
 * Everything is bounded (max 4 subtasks, short outputs, hard timeouts) so a turn
 * never hangs, and every stage emits a status frame so the UI stays transparent.
 */

import { AGENTS, type AgentProfile } from "./router.ts";

export type CallFn = (
  models: string[],
  payload: Record<string, unknown>,
) => Promise<{ response: Response; model: string } | null>;

export type Subtask = { agent: string; goal: string };
export type TurnPlan = {
  profile: AgentProfile;
  complexity: "simple" | "standard" | "complex";
  subtasks: Subtask[];
  deliverable: string;
};

const PLANNER_MODELS = ["qwen-flash", "qwen-turbo", "qwen-plus"];
const WORKER_TIMEOUT_MS = 55_000;
const MAX_SUBTASKS = 4;

/** Reads the assistant text out of an OpenAI-compatible non-streaming reply. */
async function callText(
  call: CallFn,
  models: string[],
  payload: Record<string, unknown>,
): Promise<string> {
  const result = await call(models, { ...payload, stream: false });
  if (!result) return "";
  const data = await result.response.json().catch(() => null) as any;
  const content = data?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

function parseJson(raw: string): any {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

const AGENT_IDS = Object.keys(AGENTS);

const PLANNER_PROMPT =
  `You are the manager of an internal agent team. Classify ONE user request.
Available specialists: ${AGENT_IDS.join(", ")}.
 - coder: software, repositories, debugging, infrastructure.
 - researcher: live facts, news, sources, citations.
 - analyst: math, data, finance, strategy, reasoning.
 - writer: prose, copy, documents, translation, summaries.
 - operator: multi-step execution, automation, planning, integrations.
 - general: direct short answers.
Return JSON ONLY:
{"lead":"<specialist>","complexity":"simple|standard|complex","deliverable":"<one line describing the exact artifact the user should receive>","subtasks":[{"agent":"<specialist>","goal":"<self-contained instruction>"}]}
Rules:
- simple = a single short factual or conversational answer. No subtasks.
- standard = one deliverable for one specialist. At most 1 subtask.
- complex = the request names TWO OR MORE distinct deliverables, or needs different specialties (e.g. research + numbers + code + copy). This is the common case for long requests — do not downgrade it. Give 2-4 subtasks.
- Subtasks run in PARALLEL, so each must be independent and self-contained, with no reference to another subtask's output and nothing to ask the user.
- Split by deliverable, never into "step 1 / step 2" of the same deliverable.`;



/** Semantic plan for the turn; falls back to the keyword-routed profile. */
export async function plan(
  call: CallFn,
  question: string,
  fallback: AgentProfile,
): Promise<TurnPlan> {
  const base: TurnPlan = {
    profile: fallback,
    complexity: "standard",
    subtasks: [],
    deliverable: "",
  };
  if (!question.trim()) return { ...base, complexity: "simple" };

  const raw = await callText(call, PLANNER_MODELS, {
    temperature: 0.1,
    max_tokens: 700,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: PLANNER_PROMPT },
      { role: "user", content: question.slice(0, 6000) },
    ],
  });
  const parsed = parseJson(raw);
  if (!parsed || typeof parsed !== "object") return base;

  const lead = typeof parsed.lead === "string" ? parsed.lead.trim().toLowerCase() : "";
  const complexity = ["simple", "standard", "complex"].includes(parsed.complexity)
    ? parsed.complexity as TurnPlan["complexity"]
    : "standard";
  const subtasks: Subtask[] = Array.isArray(parsed.subtasks)
    ? parsed.subtasks
      .filter((item: any) => item && typeof item.goal === "string" && item.goal.trim().length > 8)
      .slice(0, MAX_SUBTASKS)
      .map((item: any) => ({
        agent: AGENTS[String(item.agent ?? "").trim().toLowerCase()] ? String(item.agent).trim().toLowerCase() : "general",
        goal: String(item.goal).trim().slice(0, 600),
      }))
    : [];

  // Two or more independent parts is a complex turn regardless of the label the
  // planner attached to it.
  const effective = subtasks.length >= 2 ? "complex" : complexity;
  const turn: TurnPlan = {
    profile: AGENTS[lead] ?? fallback,
    complexity: effective,
    subtasks: effective === "complex" ? subtasks : subtasks.slice(0, 1),
    deliverable: typeof parsed.deliverable === "string" ? parsed.deliverable.slice(0, 300) : "",
  };
  console.log(
    `chat-alibaba plan: lead=${turn.profile.id} complexity=${turn.complexity} subtasks=${turn.subtasks.length}`,
  );
  return turn;
}


async function runWorker(
  call: CallFn,
  subtask: Subtask,
  question: string,
  liveContext: string,
): Promise<string> {
  const profile = AGENTS[subtask.agent] ?? AGENTS.general;
  const messages = [
    {
      role: "system",
      content: `${profile.persona}
You are a worker inside an internal agent team. Deliver ONLY your assigned part as a dense brief the lead agent will merge into the final answer.
Rules: no greetings, no restating the task, no questions back. Facts must come from the supplied context and be marked [n] when they do. Under 400 words. If your part cannot be completed, say exactly what is missing in one line.${
        liveContext ? `\n\nLIVE CONTEXT:\n${liveContext.slice(0, 12000)}` : ""
      }`,
    },
    {
      role: "user",
      content: `Overall user request: ${question.slice(0, 3000)}\n\nYour assigned part: ${subtask.goal}`,
    },
  ];
  const text = await Promise.race([
    callText(call, profile.models, { temperature: profile.temperature, max_tokens: 1400, messages }),
    new Promise<string>((resolve) => setTimeout(() => resolve(""), WORKER_TIMEOUT_MS)),
  ]);
  return text;
}

/** Runs every subtask in parallel and returns the collected briefs. */
export async function runTeam(
  call: CallFn,
  turn: TurnPlan,
  question: string,
  liveContext: string,
  emit: (frame: Record<string, unknown>) => void,
): Promise<string> {
  if (!turn.subtasks.length) return "";
  for (const subtask of turn.subtasks) {
    const profile = AGENTS[subtask.agent] ?? AGENTS.general;
    emit({ status: "working", agent: profile.id, agent_label: profile.labelAr, note: subtask.goal });
  }
  const results = await Promise.all(
    turn.subtasks.map((subtask) => runWorker(call, subtask, question, liveContext)),
  );
  const sections = turn.subtasks
    .map((subtask, index) => {
      const brief = results[index];
      if (!brief) return "";
      const profile = AGENTS[subtask.agent] ?? AGENTS.general;
      return `### ${profile.label} — ${subtask.goal}\n${brief}`;
    })
    .filter(Boolean);
  emit({ status: "merging", agent: turn.profile.id, agent_label: turn.profile.labelAr });
  if (!sections.length) return "";
  return `INTERNAL TEAM BRIEFS (already produced for this turn — use them as verified working material, merge and improve, never quote them as coming from an agent):\n\n${
    sections.join("\n\n")
  }`;
}

/** Output contract appended to the lead agent's system prompt. */
export function deliveryContract(turn: TurnPlan): string {
  const lines = [
    "FINAL ANSWER CONTRACT:",
    "- Answer in the user's own language and register.",
    "- Lead with the result, not with a plan or a preamble. No 'as an AI', no describing your process, no mention of agents, models, briefs or tools.",
    "- Structure long answers with short headings and tight bullets; keep short answers short.",
    "- Every factual claim taken from live context carries its [n] marker, and the numbered source list with URLs closes the message.",
    "- Code is complete and runnable, in fenced blocks with the file path on the fence line.",
    "- Do not claim an action ran unless there is evidence in context; instead give the exact next executable step.",
    "- One language per answer: never mix languages except for technical identifiers and quoted source titles.",
  ];
  if (turn.deliverable) lines.push(`- Expected deliverable for this turn: ${turn.deliverable}`);
  if (turn.complexity === "complex") {
    lines.push(
      "- This is a multi-part job: cover every part, keep the parts coherent with each other, and end with what remains open (if anything).",
    );
  }
  return lines.join("\n");
}
