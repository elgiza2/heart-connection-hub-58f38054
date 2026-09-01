/**
 * @doc In-tab fallback for the agent kernel.
 *
 * The real kernel lives in the `long-run` edge function and keeps running with
 * the tab closed. When that function can't be reached, this module drives the
 * exact same rows (`long_runs`, `long_run_events`, `agent_questions`,
 * `agent_memory`) from the browser, so the UI, plan gate, questions, trace and
 * artifacts all behave identically — the only difference is that progress
 * happens while the tab is open, and resumes from the database when it reopens.
 */
import { supabase } from "@/integrations/supabase/client";
import type { LongRun } from "@/lib/longrun/types";
import { loginIdentityFor } from "./credentials";
import { listMail } from "@/lib/mail/mailClient";
import { askJson, askModel } from "./llm";
import { CATALOG_SIZE, catalogCategories } from "@/lib/agentTools/catalog";
import { runCatalogTool, searchToolsFor } from "@/lib/agentTools/runtime";
import { renderSubAgents, runSubAgent } from "@/lib/agentTools/subagents";
import {
  fetchUrl,
  filesToArtifacts,
  readFile,
  runCode,
  writeFile,
  type ToolContext,
} from "./tools";



const AUTO_CONTINUE_MS = 60_000;
const MAX_ACTIONS_PER_TICK = 6;
const TICK_DEADLINE_MS = 40_000;
const MAX_STEPS = 600;
const MAX_REVIEW_ROUNDS = 3;
const DEFAULT_BUDGET_MS = 6 * 60 * 60 * 1000;

/** Tools whose arguments must never be echoed into the public trace. */
const REDACTED_TOOLS = new Set(["remember", "login_identity"]);

const ticking = new Set<string>();
const fileCache = new Map<string, ToolContext>();

type RunRow = LongRun & { result: any };

function ctxFor(run: RunRow): ToolContext {
  let ctx = fileCache.get(run.id);
  if (!ctx) {
    ctx = { files: new Map<string, string>() };
    const saved = Array.isArray(run.result?.files) ? run.result.files : [];
    for (const f of saved) {
      if (f && typeof f.path === "string" && typeof f.content === "string") {
        ctx.files.set(f.path, f.content);
      }
    }
    fileCache.set(run.id, ctx);
  }
  return ctx;
}

async function loadRun(runId: string): Promise<RunRow | null> {
  const { data } = await supabase.from("long_runs").select("*").eq("id", runId).maybeSingle();
  return (data as unknown as RunRow) ?? null;
}

async function patch(runId: string, fields: Record<string, unknown>): Promise<RunRow | null> {
  const { data } = await supabase
    .from("long_runs")
    .update({ ...fields, last_heartbeat_at: new Date().toISOString() })
    .eq("id", runId)
    .select("*")
    .maybeSingle();
  return (data as unknown as RunRow) ?? null;
}

async function event(runId: string, type: string, title: string, detail?: string) {
  await supabase
    .from("long_run_events")
    .insert({ run_id: runId, type, title, detail: detail ?? null } as never);
}

async function recallMemory(userId: string): Promise<string> {
  const { data } = await supabase
    .from("agent_memory")
    .select("content")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(20);
  const lines = (data ?? [])
    .map((r) => (r as { content?: string }).content)
    .filter((c): c is string => !!c);
  return lines.length ? `Things you already learned:\n- ${lines.join("\n- ")}` : "";
}

async function remember(userId: string, content: string) {
  await supabase
    .from("agent_memory")
    .insert({ user_id: userId, kind: "user_fact", content } as never);
}

/* ------------------------------------------------------------------ planning */

interface Plan {
  steps: string[];
  risk: "low" | "medium" | "high";
}

/** Live clock + inventory, so plans never assume an old year or a tiny toolset. */
const nowBrief = () => {
  const now = new Date();
  return `Today is ${now.toISOString().slice(0, 10)} and the current year is ${now.getUTCFullYear()} — never treat anything from an earlier year as current.`;
};

const PLAN_SYSTEM = `You plan a task an autonomous agent will execute in the user's browser.
${nowBrief()}
Core tools: run_code (sandboxed JS), fetch_url (read a public page as text),
write_file / read_file (task workspace), remember (save a durable fact),
tool_search + tool_call (a catalog of ${CATALOG_SIZE} tools across ${catalogCategories().length} domains:
${catalogCategories().slice(0, 12).map((c) => c.category).join(", ")} …),
spawn_agent (delegate a sub-task to a specialist),
ask_user (pause and ask), finish (deliver the result).
Assume a tool exists for almost anything — plan the real work, not a reduced version of it.
Reply with JSON only: {"steps":["...", "..."],"risk":"low|medium|high"}
3 to 8 short imperative steps, in the same language the user used.
risk is "high" when the task involves payments, deletions, sending messages on the
user's behalf, or credentials; "medium" when it changes data the user owns; else "low".`;


async function makePlan(goal: string, memory: string): Promise<Plan> {
  const parsed = await askJson<{ steps?: unknown; risk?: unknown }>(PLAN_SYSTEM, [
    { role: "user", content: memory ? `${memory}\n\nTask: ${goal}` : `Task: ${goal}` },
  ]);
  const steps = Array.isArray(parsed?.steps)
    ? parsed!.steps.map((s) => String(s)).filter(Boolean).slice(0, 8)
    : [];
  const risk =
    parsed?.risk === "high" || parsed?.risk === "medium" ? parsed.risk : ("low" as const);
  return {
    steps: steps.length ? steps : ["افهم المطلوب", "نفّذ المهمة خطوة بخطوة", "راجع النتيجة وسلّمها"],
    risk,
  };
}

/** Deterministic risk floor — the model can raise risk but never lower it. */
function riskFloor(goal: string): "low" | "high" {
  const sensitive =
    /(payment|pay\b|checkout|purchase|شراء|ادفع|الدفع|delete|حذف|امسح|password|كلمة السر|otp|verification code|كود التحقق|transfer|تحويل|send email|ابعت|invoice)/i;
  return sensitive.test(goal) ? "high" : "low";
}

/* ------------------------------------------------------------------ executing */

const EXEC_SYSTEM = `You are an autonomous agent executing a task end to end, like a senior human operator.
${nowBrief()}
Pick exactly ONE next action and reply with JSON only:
{"thought":"one short sentence","tool":"tool_search|tool_call|spawn_agent|run_code|fetch_url|login_identity|check_mail|write_file|read_file|remember|ask_user|finish","args":{...}}
Args by tool:
- tool_search: {"need":"what you want to do, plain language"}
  -> shortlist of ids from a catalog of ${CATALOG_SIZE} real tools. Search FIRST whenever
     you think "I have no tool for this" — you almost certainly do.
- tool_call: {"id":"github.search","args":{...}}  -> runs a catalog tool.
     Common arg shapes: http tools {"url"|"path","method","body"}; web tools {"query"} or {"url"};
     code tools {"code"}; model tools {"prompt"}; file tools {"path","content"}.
- spawn_agent: {"agent":"researcher","task":"one focused sub-task"}
  -> runs a specialist to completion and returns its report. Specialists:
${renderSubAgents()}
     Delegate whenever a sub-task is a whole job on its own (deep research, coding,
     data crunching, a website operation, final writing, review).
- run_code: {"code":"async JS; console.log results"}
- fetch_url: {"url":"https://..."}
- login_identity: {"site":"example.com","url":"https://example.com/signup"}
  -> returns the user's own Megsy email plus a clean strong password, already saved
     in Settings > Passwords. ALWAYS use this to sign up or sign in to any site.
- check_mail: {"query":"verification"} -> reads the newest messages in that Megsy
  mailbox, so you can pull confirmation links and verification codes yourself.
- write_file: {"path":"report.md","content":"..."}
- read_file: {"path":"report.md"}
- remember: {"content":"durable fact about the user or the task"}
- ask_user: {"question":"...","reason":"...","sensitive":true|false}
- finish: {"summary":"what you delivered, in the user's language"}

How you behave:
- You are a manager with a large toolbox and a team of specialists. There is no fixed
  menu of supported tasks: decompose whatever was asked and execute it to the end.
- NEVER ask the user for an email or a password: call login_identity and use it.
- When something blocks you (error page, dead selector, rate limit, missing data),
  do NOT stop the task. Think it through in "thought": name the obstacle, then take a
  DIFFERENT action towards the same goal — another tool from tool_search, another
  source, another method, or a specialist via spawn_agent.
- A sub-agent's report is raw material, not the answer: review it, fill gaps, and for
  anything important have the "reviewer" specialist check it before you finish.
- Only ask_user for things no software can do for you: a CAPTCHA you cannot pass, a
  2FA code that never lands in the mailbox, a payment, or an irreversible action.
- Deliver real artifacts with write_file when the task produces a document or code.
- Call finish only when the task is genuinely complete, with evidence in the log.`;


interface Action {
  thought?: string;
  tool?: string;
  args?: Record<string, any>;
}

async function nextAction(run: RunRow, memory: string): Promise<Action | null> {
  const plan: string[] = Array.isArray(run.result?.plan) ? run.result.plan : [];
  const transcript: string[] = Array.isArray(run.result?.transcript) ? run.result.transcript : [];
  const guidance = [...(run.pending_steering ?? []), ...(run.pending_guidance ?? [])];
  const directive: string | null = run.result?.supervisor ?? null;
  const context = [
    memory,
    `Task: ${run.goal}`,
    plan.length ? `Plan:\n- ${plan.join("\n- ")}` : "",
    directive ? `Supervisor directive (follow it):\n${directive}` : "",
    guidance.length ? `New instructions from the user:\n- ${guidance.join("\n- ")}` : "",
    transcript.length ? `Progress so far:\n${transcript.slice(-16).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return askJson<Action>(EXEC_SYSTEM, [{ role: "user", content: context }]);
}

/* ----------------------------------------------------------------- supervisor */

const SUPERVISOR_SYSTEM = `You are the supervising agent of a worker agent running a long task.
You never execute anything yourself; you keep the worker moving for hours without stalling.
Read the task and the recent log, then reply with JSON only:
{"keep_going":true|false,"directive":"one or two concrete sentences telling the worker exactly what to do next, in the user's language"}
keep_going=false ONLY when the task is verifiably complete or a human decision is truly required.
If the worker is repeating itself, stuck on an obstacle, or drifting, order a concrete different approach.`;

/** Asks the supervisor for a directive; injected into the worker's next prompt. */
async function superviseRun(run: RunRow): Promise<{ keep_going: boolean; directive: string } | null> {
  const transcript: string[] = Array.isArray(run.result?.transcript) ? run.result.transcript : [];
  const parsed = await askJson<{ keep_going?: boolean; directive?: unknown }>(SUPERVISOR_SYSTEM, [
    {
      role: "user",
      content: [
        `Task: ${run.goal}`,
        `Steps so far: ${run.step_count ?? 0}`,
        `Recent log:\n${transcript.slice(-20).join("\n") || "(nothing yet)"}`,
      ].join("\n\n"),
    },
  ]);
  if (!parsed) return null;
  const directive = String(parsed.directive ?? "").slice(0, 500);
  return { keep_going: parsed.keep_going !== false, directive };
}

/**
 * The supervisor signs off the plan instead of the user: it reads the plan like a
 * manager would, adjusts it, and hands the worker its opening order.
 */
async function supervisorReviewPlan(
  goal: string,
  plan: string[],
  memory: string,
): Promise<{ steps: string[]; directive: string }> {
  const parsed = await askJson<{ steps?: unknown; directive?: unknown }>(
    `You are the supervising manager of a worker agent. The worker proposed a plan for a task.
You approve or rewrite it yourself — the user is NOT asked. Reply with JSON only:
{"steps":["..."],"directive":"the first concrete order for the worker, in the user's language"}
Keep 3-8 steps, remove filler, add any verification step the worker forgot.`,
    [
      {
        role: "user",
        content: [memory, `Task: ${goal}`, `Proposed plan:\n- ${plan.join("\n- ")}`]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  );
  const steps = Array.isArray(parsed?.steps)
    ? parsed!.steps.map((s) => String(s)).filter(Boolean).slice(0, 8)
    : [];
  return {
    steps: steps.length ? steps : plan,
    directive: String(parsed?.directive ?? "ابدأ بأول خطوة في الخطة ونفّذها بالكامل.").slice(0, 500),
  };
}

/**
 * The supervisor writes the message the user actually reads: what happened, what
 * was delivered, and — when something is blocking — what it needs from the user
 * plus the options it suggests.
 */
async function supervisorReport(
  run: RunRow,
  summary: string,
  files: string[],
): Promise<string> {
  const transcript: string[] = Array.isArray(run.result?.transcript) ? run.result.transcript : [];
  const text = await askModel(
    `You are the supervising manager reporting to the user in their own language (Arabic if the task is Arabic).
Write a short clean report: what was accomplished, what was delivered, and any problem that came up with the options you suggest for it.
No JSON, no markdown headers, no bullet spam — at most 6 short lines. Never invent results.`,
    [
      {
        role: "user",
        content: [
          `Task: ${run.goal}`,
          `Worker summary: ${summary}`,
          `Files delivered: ${files.join(", ") || "none"}`,
          `Work log:\n${transcript.slice(-24).join("\n")}`,
        ].join("\n\n"),
      },
    ],
  );
  return (text?.trim() || summary).slice(0, 2000);
}

/** Blockers a human really has to handle — everything else the agent solves itself. */
function needsHuman(text: string): boolean {
  return /(captcha|كابتشا|recaptcha|2fa|two-factor|otp|كود التحقق|verification code|payment|credit card|بطاقة|ادفع|الدفع|refund|delete account|حذف الحساب)/i.test(
    text,
  );
}



/* -------------------------------------------------------------------- public */

export async function startRun(
  goal: string,
  conversationId: string | null,
  budgetMs?: number,
): Promise<RunRow | null> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("سجّل الدخول أولاً لتشغيل المهام");

  const { data: inserted, error } = await supabase
    .from("long_runs")
    .insert({
      user_id: userId,
      conversation_id: conversationId,
      kind: "agentic",
      goal,
      status: "paused",
      phase: "plan_review",
      status_text: "بأجهّز الخطة…",
      provider: "in_tab",
      budget_ms: budgetMs ?? DEFAULT_BUDGET_MS,
      step_count: 0,
      review_round: 0,
    } as never)
    .select("*")
    .maybeSingle();
  if (error || !inserted) throw new Error(error?.message ?? "مش قادر أبدأ المهمة");
  const run = inserted as unknown as RunRow;

  const memory = await recallMemory(userId);
  const plan = await makePlan(goal, memory);
  const risk = riskFloor(goal) === "high" ? "high" : plan.risk;

  // The supervisor — not the user — signs off the plan and issues the first order.
  const approved = await supervisorReviewPlan(goal, plan.steps, memory);

  await event(run.id, "plan", "الخطة", approved.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"));
  await event(run.id, "step", "المشرف وجّهني", approved.directive);
  return patch(run.id, {
    status: "running",
    phase: "executing",
    status_text: "بنفّذ…",
    awaiting_plan_ack: false,
    auto_continue_allowed: true,
    auto_continue_at: null,
    risk_level: risk,
    result: {
      ...(run.result ?? {}),
      plan: approved.steps,
      supervisor: approved.directive,
      transcript: [`SUPERVISOR: ${approved.directive}`],
    },
  });
}


export async function approvePlan(runId: string, planSteps?: string[]): Promise<RunRow | null> {
  const run = await loadRun(runId);
  if (!run) return null;
  const steps = planSteps?.length ? planSteps : run.result?.plan ?? [];
  await event(runId, "step", "بدأت التنفيذ");
  return patch(runId, {
    status: "running",
    phase: "executing",
    status_text: "بنفّذ…",
    awaiting_plan_ack: false,
    auto_continue_at: null,
    result: { ...(run.result ?? {}), plan: steps },
  });
}

export async function answer(runId: string, text: string): Promise<RunRow | null> {
  const run = await loadRun(runId);
  if (!run) return null;
  const { data: open } = await supabase
    .from("agent_questions")
    .select("id, sensitive, question")
    .eq("run_id", runId)
    .eq("status", "open")
    .order("asked_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const q = open as { id?: string; sensitive?: boolean; question?: string } | null;
  if (q?.id) {
    await supabase
      .from("agent_questions")
      .update({ answer: text, status: "answered" } as never)
      .eq("id", q.id);
  }
  const transcript: string[] = Array.isArray(run.result?.transcript) ? run.result.transcript : [];
  transcript.push(
    `USER answered${q?.question ? ` "${q.question}"` : ""}: ${q?.sensitive ? "[provided privately]" : text}`,
  );
  return patch(runId, {
    status: "running",
    phase: "executing",
    status_text: "كمّلت بعد ردك",
    needs_input: false,
    result: { ...(run.result ?? {}), transcript },
  });
}

export async function guide(runId: string, text: string): Promise<RunRow | null> {
  const run = await loadRun(runId);
  if (!run) return null;
  const queue = [...(run.pending_guidance ?? []), text];
  return patch(runId, { pending_guidance: queue });
}

export async function steer(runId: string, text: string): Promise<RunRow | null> {
  const run = await loadRun(runId);
  if (!run) return null;
  const queue = [...(run.pending_steering ?? []), text];
  return patch(runId, { pending_steering: queue });
}

export async function softStop(runId: string): Promise<RunRow | null> {
  await event(runId, "step", "طلب إيقاف بعد الخطوة الحالية");
  return patch(runId, { stop_requested: true, status_text: "بأنهي الخطوة الحالية وأوقف…" });
}

export async function stop(runId: string): Promise<RunRow | null> {
  fileCache.delete(runId);
  await event(runId, "step", "المهمة أُوقفت");
  return patch(runId, { status: "canceled", phase: "stopped", status_text: "أوقفتها" });
}

/**
 * Advances the run. Safe to call repeatedly (the UI polls it); overlapping calls
 * for the same run are dropped, and every step is persisted before returning so
 * closing the tab loses at most the step in flight.
 */
export async function tick(runId: string): Promise<RunRow | null> {
  if (ticking.has(runId)) return loadRun(runId);
  ticking.add(runId);
  try {
    let run = await loadRun(runId);
    if (!run) return null;

    if (run.status === "done" || run.status === "error" || run.status === "canceled") return run;

    if (run.stop_requested) return stop(runId);

    // Plan gate: low-risk plans continue by themselves once the timer elapses.
    if (run.awaiting_plan_ack) {
      const due = run.auto_continue_at ? Date.parse(run.auto_continue_at) : NaN;
      if (run.auto_continue_allowed && Number.isFinite(due) && Date.now() >= due) {
        run = (await approvePlan(runId)) ?? run;
      } else {
        return run;
      }
    }

    if (run.needs_input) return run;

    const started = Date.parse(run.created_at);
    const budget = run.budget_ms ?? DEFAULT_BUDGET_MS;
    if (Number.isFinite(started) && Date.now() - started > budget) {
      return fail(runId, "خلصت الميزانية الزمنية للمهمة قبل ما تكمل");
    }
    if ((run.step_count ?? 0) >= MAX_STEPS) {
      return fail(runId, "وصلت للحد الأقصى للخطوات");
    }

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return run;
    const memory = await recallMemory(userId);
    const ctx = ctxFor(run);
    const deadline = Date.now() + TICK_DEADLINE_MS;

    for (let i = 0; i < MAX_ACTIONS_PER_TICK && Date.now() < deadline; i++) {
      run = (await loadRun(runId)) ?? run;
      if (run.stop_requested) return stop(runId);
      if (run.needs_input || run.status === "done" || run.status === "canceled") return run;

      const transcript: string[] = Array.isArray(run.result?.transcript)
        ? [...run.result.transcript]
        : [];

      // Consume queued guidance so the model sees it exactly once.
      const guidance = [...(run.pending_steering ?? []), ...(run.pending_guidance ?? [])];
      if (guidance.length) {
        for (const g of guidance) transcript.push(`USER guidance: ${g}`);
        await event(runId, "step", "توجيه من المستخدم", guidance.join("\n"));
      }

      const action = await nextAction(run, memory);
      if (!action?.tool) {
        transcript.push("MODEL returned no usable action");
        run =
          (await patch(runId, {
            pending_guidance: [],
            pending_steering: [],
            loop_strikes: (run.loop_strikes ?? 0) + 1,
            result: { ...(run.result ?? {}), transcript },
          })) ?? run;
        if ((run.loop_strikes ?? 0) >= 3) {
          return fail(runId, "مش قادر أكمل — النموذج مش بيرجّع خطوة صالحة");
        }
        continue;
      }

      const tool = action.tool;
      const args = action.args ?? {};
      const signature = `${tool}:${JSON.stringify(args).slice(0, 200)}`;
      const repeats = transcript.filter((t) => t.includes(signature)).length;
      const loopHint =
        repeats >= 2 ? " (نفس الخطوة تكررت — لازم أغيّر الطريقة)" : "";

      if (tool === "finish") {
        const summary = String(args.summary ?? "خلصت المهمة");
        return finish(runId, run, summary, ctx);
      }

      if (tool === "ask_user") {
        const question = String(args.question ?? "محتاج توضيح");
        const reason = args.reason ? String(args.reason) : "";
        const selfSolveTries = Number(run.result?.self_solve ?? 0);

        // A human is only pulled in for things software genuinely cannot do.
        // Everything else becomes an internal "think it through" step, so the
        // task keeps moving instead of dying on the first obstacle.
        if (!needsHuman(`${question} ${reason}`) && selfSolveTries < 3) {
          // Ask the manager what to do instead of bothering the user.
          const verdict = await superviseRun({
            ...run,
            result: {
              ...(run.result ?? {}),
              transcript: [...transcript, `WORKER blocked: ${question} ${reason}`],
            },
          } as RunRow);
          const directive =
            verdict?.directive ||
            "حل المشكلة بنفسك بطريقة أو مصدر مختلف وكمّل المهمة، وما توقفش.";
          await event(runId, "step", "المشرف وجّهني", directive);
          run =
            (await patch(runId, {
              status: "running",
              phase: "executing",
              status_text: "ظهرت مشكلة — بجرب طريقة تانية",
              pending_guidance: [],
              pending_steering: [],
              result: {
                ...(run.result ?? {}),
                self_solve: selfSolveTries + 1,
                supervisor: directive,
                transcript: [
                  ...transcript,
                  `OBSTACLE: ${question}`,
                  `SUPERVISOR: ${directive}`,
                ].slice(-60),
              },
            })) ?? run;
          continue;
        }

        const sensitive = !!args.sensitive || needsHuman(question);
        // The manager, not the worker, phrases what it needs from the user.
        const escalation = await superviseRun({
          ...run,
          result: {
            ...(run.result ?? {}),
            transcript: [...transcript, `WORKER needs the user: ${question} ${reason}`],
          },
        } as RunRow);
        await supabase.from("agent_questions").insert({
          run_id: runId,
          user_id: userId,
          question,
          reason: [reason, escalation?.directive].filter(Boolean).join("\n") || null,
          options: [],
          sensitive,
          status: "open",
        } as never);

        await event(runId, "question", "وقفت وسألت", question);
        return patch(runId, {
          status: "paused",
          phase: "awaiting_user",
          status_text: "مستني ردك",
          needs_input: true,
          pending_guidance: [],
          pending_steering: [],
          result: {
            ...(run.result ?? {}),
            transcript: [...transcript, `AGENT asked: ${question}`],
          },
        });
      }

      let output = "";
      let ok = true;
      if (tool === "run_code") {
        const res = await runCode(String(args.code ?? ""));
        ok = res.ok;
        output = res.output;
      } else if (tool === "fetch_url") {
        const res = await fetchUrl(String(args.url ?? ""));
        ok = res.ok;
        output = res.output;
      } else if (tool === "login_identity") {
        try {
          const id = await loginIdentityFor(String(args.site ?? args.url ?? ""), {
            url: args.url ? String(args.url) : null,
            notes: run.goal ?? null,
          });
          output = `use email ${id.email} and password ${id.password} on ${id.site} (${
            id.reused ? "existing account" : "new account, saved in Settings > Passwords"
          })`;
        } catch (error) {
          ok = false;
          output = error instanceof Error ? error.message : "login identity failed";
        }
      } else if (tool === "check_mail") {
        try {
          const q = String(args.query ?? "").toLowerCase();
          const mail = await listMail("inbox", 20);
          const hits = q
            ? mail.filter(
                (m) =>
                  m.subject.toLowerCase().includes(q) || m.body_text.toLowerCase().includes(q),
              )
            : mail;
          output =
            hits
              .slice(0, 5)
              .map((m) => `From ${m.from_address} — ${m.subject}\n${m.body_text.slice(0, 800)}`)
              .join("\n---\n") || "مفيش رسايل مطابقة في البريد";
        } catch (error) {
          ok = false;
          output = error instanceof Error ? error.message : "mail read failed";
        }
      } else if (tool === "write_file") {
        const res = writeFile(ctx, String(args.path ?? ""), String(args.content ?? ""));
        ok = res.ok;
        output = res.output;
      } else if (tool === "read_file") {
        const res = readFile(ctx, String(args.path ?? ""));
        ok = res.ok;
        output = res.output;
      } else if (tool === "remember") {
        const content = String(args.content ?? "").trim();
        if (content) await remember(userId, content);
        output = content ? "تم الحفظ في الذاكرة" : "مفيش حاجة تُحفظ";
      } else {
        ok = false;
        output = `أداة غير معروفة: ${tool}`;
      }

      // Login identities and memory writes never leak into the visible trace.
      const redacted = REDACTED_TOOLS.has(tool);
      const detail = redacted ? "[محجوب]" : output;
      await event(runId, "tool", `${tool}${loopHint}`, detail.slice(0, 2000));
      if (!ok) {
        await event(runId, "step", "ظهرت مشكلة — بجرب طريقة تانية", output.slice(0, 400));
      }
      transcript.push(
        `AGENT ${signature}${loopHint}\nRESULT(${ok ? "ok" : "fail"}): ${
          redacted ? "[redacted]" : output.slice(0, 1500)
        }`,
      );
      if (!ok) {
        transcript.push(
          "OBSTACLE: the last action failed. Name the cause and try a different method or source — do not repeat it and do not stop the task.",
        );
      }

      const steps = (run.step_count ?? 0) + 1;

      // Supervisor pass: every few steps a second agent reads the log and hands
      // the worker a concrete directive, which is what keeps multi-hour tasks
      // from stalling or drifting.
      let supervisor: string | null = run.result?.supervisor ?? null;
      if (steps % 8 === 0 || repeats >= 2) {
        const verdict = await superviseRun({
          ...run,
          step_count: steps,
          result: { ...(run.result ?? {}), transcript },
        } as RunRow);
        if (verdict?.directive) {
          supervisor = verdict.directive;
          transcript.push(`SUPERVISOR: ${verdict.directive}`);
          await event(runId, "step", "المشرف وجّهني", verdict.directive);
        }
      }

      run =
        (await patch(runId, {
          status: "running",
          phase: "executing",
          status_text: action.thought ? String(action.thought).slice(0, 200) : "بنفّذ…",
          step_count: steps,
          loop_strikes: repeats >= 2 ? (run.loop_strikes ?? 0) + 1 : 0,
          pending_guidance: [],
          pending_steering: [],
          result: {
            ...(run.result ?? {}),
            supervisor,
            self_solve: ok ? 0 : Number(run.result?.self_solve ?? 0),
            transcript: transcript.slice(-60),
            files: filesToArtifacts(ctx),
          },
        })) ?? run;

    }

    return run;
  } finally {
    ticking.delete(runId);
  }
}

/* ---------------------------------------------------------------- finishing */

const CRITIQUE_SYSTEM = `You review an agent's own work. Reply with JSON only:
{"done":true|false,"gap":"what is still missing, in the user's language"}
done=true only when the task in "Task" is genuinely satisfied by the work shown.`;

async function finish(
  runId: string,
  run: RunRow,
  summary: string,
  ctx: ToolContext,
): Promise<RunRow | null> {
  const round = (run.review_round ?? 0) + 1;
  await event(runId, "step", "دلوقتي بأراجع اللي عملته");

  const transcript: string[] = Array.isArray(run.result?.transcript) ? run.result.transcript : [];
  const verdict = await askJson<{ done?: boolean; gap?: string }>(CRITIQUE_SYSTEM, [
    {
      role: "user",
      content: [
        `Task: ${run.goal}`,
        `Agent summary: ${summary}`,
        `Files produced: ${[...ctx.files.keys()].join(", ") || "none"}`,
        `Work log:\n${transcript.slice(-20).join("\n")}`,
      ].join("\n\n"),
    },
  ]);

  // The supervisor gets the last word: a premature finish is sent back to work,
  // and even a good finish gets one mandatory review pass ordered by the manager.
  const supervisor = round <= MAX_REVIEW_ROUNDS ? await superviseRun(run) : null;
  const supervisorBlocks = supervisor?.keep_going === true && !!supervisor.directive;
  const needsReviewPass = round === 1 && verdict?.done !== false && !supervisorBlocks;

  if ((verdict?.done === false || supervisorBlocks || needsReviewPass) && round <= MAX_REVIEW_ROUNDS) {
    const gap = needsReviewPass
      ? supervisor?.directive ??
        "راجع كل اللي عملته خطوة خطوة، اتأكد إن كل مخرج موجود وصحيح، وبعدها بس اعتبرها خلصت."
      : String(verdict?.gap ?? supervisor?.directive ?? "فيه حاجة ناقصة");
    await event(
      runId,
      "step",
      needsReviewPass ? "المشرف طلب مراجعة نهائية" : "المراجعة لقت نقص — بكمّل",
      gap,
    );
    return patch(runId, {
      status: "running",
      phase: "executing",
      status_text: needsReviewPass ? "بأراجع اللي عملته قبل التسليم" : "بأستكمل النقص اللي لقيته في المراجعة",
      review_round: round,
      result: {
        ...(run.result ?? {}),
        supervisor: gap,
        transcript: [
          ...transcript,
          needsReviewPass ? `SUPERVISOR: ${gap}` : `SELF-REVIEW: not done yet — ${gap}`,
        ],
        files: filesToArtifacts(ctx),
      },
    });
  }

  // The manager writes the message the user reads.
  const files = filesToArtifacts(ctx);
  const report = await supervisorReport(run, summary, [...ctx.files.keys()]);
  await event(runId, "result", "خلصت", report);
  const updated = await patch(runId, {
    status: "done",
    phase: "finished",
    status_text: "خلصت",
    needs_input: false,
    review_round: round,
    result: {
      ...(run.result ?? {}),
      summary: report,
      worker_summary: summary,
      transcript,
      files,
    },
  });

  fileCache.delete(runId);
  return updated;
}

async function fail(runId: string, message: string): Promise<RunRow | null> {
  await event(runId, "error", "المهمة وقفت", message);
  fileCache.delete(runId);
  return patch(runId, {
    status: "error",
    phase: "failed",
    status_text: message,
    error: message,
  });
}
