/**
 * The agent kernel: one loop that behaves like a careful human worker.
 *
 *   recall memory -> plan -> (parallel tools) -> execute -> watch
 *   -> loop detection -> pause & ask when unclear -> self-critique -> learn
 *
 * Every phase is persisted, so the loop is driven server-side by the
 * `agent-tick` cron and survives the user closing the tab. Long runs (hours)
 * checkpoint after every step and are resumed from the last checkpoint when the
 * provider sandbox dies.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { memoryBlock, recallMemory, learnFromRun, remember } from "./memory.ts";
import { fingerprint, loopInstruction, verdictFor } from "./loopGuard.ts";
import { askUser, detectBlock, detectLargeAmount, openQuestion, resolveQuestion } from "./questions.ts";
import { classifyPlanRisk, critique, makePlan, savePlanReview } from "./planner.ts";
import { webSearch } from "./tools.ts";
import { type AgentAction, decideNextAction, runTool } from "./executor.ts";
import {
  type ActivityEvent,
  classifyFailure,
  describeAction,
  emitActivity,
  redactDeep,
  toolFamily,
} from "./activity.ts";


const BU_BASE = Deno.env.get("BROWSER_USE_API_BASE") || "https://api.browser-use.com/api/v2";
const MAX_REVIEW_ROUNDS = 3;
const DEFAULT_BUDGET_MS = 6 * 60 * 60 * 1000;
const MAX_STEPS = 600;
/** How long the user gets to press "Continue" before the agent proceeds itself. */
const PLAN_ACK_MS = 60_000;
/** No real event for this long while "running" means the worker stalled. */
const STALL_MS = 5 * 60_000;
const MAX_STALLS = 6;
/** Bounded retries when the planner returns no action at all. */
const MAX_DECIDE_FAILURES = 5;
/** Tool calls executed per tick, and the wall-clock ceiling for one tick. */
const STEPS_PER_TICK = 6;
const TICK_DEADLINE_MS = 50_000;
/** Announced out loud before the agent grades its own work. */
const REVIEW_TEXT = "دلوقتي بأراجع اللي عملته";

function redactToolInput(tool: string, input: Record<string, unknown>): string {
  if (tool === "mcp_call") {
    return JSON.stringify({
      server: String(input.server ?? "").slice(0, 100),
      tool: String(input.tool ?? "").slice(0, 100),
      arguments: "[redacted]",
    });
  }
  if (tool === "write_file") {
    return JSON.stringify({ name: String(input.name ?? "artifact.txt").slice(0, 180), content: "[redacted]" });
  }
  if (tool === "run_code") return JSON.stringify({ code: "[redacted]" });
  return JSON.stringify(input).slice(0, 800);
}


export type RunRow = Record<string, any> & {
  id: string;
  user_id: string;
  goal: string;
};

/* ------------------------------------------------------------------ provider */

export async function browserUseKey(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from("provider_api_keys")
    .select("api_key")
    .eq("provider", "c")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Computer key lookup failed");
  const key =
    (data as { api_key?: string } | null)?.api_key?.trim() || Deno.env.get("BROWSER_USE_API_KEY");
  if (!key) throw new Error("Computer provider is not configured yet");
  return key;
}

export async function providerFetch(
  supabase: SupabaseClient,
  path: string,
  init: RequestInit = {},
) {
  return fetch(`${BU_BASE}${path}`, {
    ...init,
    headers: {
      "X-Browser-Use-API-Key": await browserUseKey(supabase),
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

interface ProviderStep {
  number?: number;
  nextGoal?: string | null;
  evaluationPreviousGoal?: string | null;
  url?: string | null;
  screenshotUrl?: string | null;
}

interface ProviderTask {
  id: string;
  sessionId?: string | null;
  status?: string;
  liveUrl?: string | null;
  output?: string | null;
  error?: string | null;
  steps?: ProviderStep[];
}

export function mapStatus(status?: string) {
  if (status === "created") return "queued";
  if (status === "paused") return "paused";
  if (status === "finished") return "done";
  if (status === "stopped") return "canceled";
  if (status === "failed") return "error";
  return "running";
}

export async function getTask(
  supabase: SupabaseClient,
  taskId: string,
): Promise<ProviderTask | null> {
  const response = await providerFetch(supabase, `/tasks/${encodeURIComponent(taskId)}`);
  if (!response.ok) return null;
  const task = (await response.json().catch(() => null)) as ProviderTask | null;
  if (!task) return null;
  if (task.sessionId) {
    const sessionResponse = await providerFetch(
      supabase,
      `/sessions/${encodeURIComponent(task.sessionId)}`,
    ).catch(() => null);
    if (sessionResponse?.ok) {
      const session = (await sessionResponse.json().catch(() => null)) as
        | { liveUrl?: string | null }
        | null;
      task.liveUrl = session?.liveUrl ?? null;
    }
  }
  return task;
}

/* --------------------------------------------------------------- primitives */

export async function addEvent(
  supabase: SupabaseClient,
  runId: string,
  title: string,
  type = "log",
  detail?: string | null,
  extra?: Partial<ActivityEvent>,
) {
  await supabase.from("long_run_events").insert({
    run_id: runId,
    type,
    title,
    detail: detail ?? null,
    event_type: extra?.event_type ?? null,
    step_id: extra?.step_id ?? null,
    tool: extra?.tool ? toolFamily(extra.tool) : null,
    action: extra?.action ?? null,
    status: extra?.status ?? null,
    summary: title,
    progress: typeof extra?.progress === "number" ? extra.progress : null,
    metadata: (extra?.metadata ? redactDeep(extra.metadata) : null) as Record<string, unknown> | null,
  });
}


async function notify(
  supabase: SupabaseClient,
  run: RunRow,
  title: string,
  body: string,
): Promise<void> {
  if (run.notified_at) return;
  await supabase.from("notifications").insert({
    user_id: run.user_id,
    title,
    body,
    type: "agent",
    data: { run_id: run.id, goal: run.goal },
  });
  await supabase
    .from("long_runs")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", run.id);
}

async function traceOf(supabase: SupabaseClient, runId: string): Promise<string[]> {
  const { data } = await supabase
    .from("long_run_events")
    .select("title,detail,type")
    .eq("run_id", runId)
    .order("created_at", { ascending: true })
    .limit(300);
  return (data ?? []).map((event: any) =>
    event.detail ? `${event.title} — ${event.detail}` : String(event.title),
  );
}

async function checkpoint(
  supabase: SupabaseClient,
  run: RunRow,
  stepNumber: number,
  print: string,
  lastAction: string,
  state: Record<string, unknown>,
): Promise<void> {
  await supabase.from("agent_checkpoints").insert({
    run_id: run.id,
    user_id: run.user_id,
    step_number: stepNumber,
    fingerprint: print,
    last_action: lastAction.slice(0, 500),
    state,
  });
  await supabase.from("long_run_events").insert({
    run_id: run.id,
    type: "log",
    title: `Checkpoint saved after step ${stepNumber}`,
    event_type: "TASK_CHECKPOINTED",
    step_id: `${run.id}:${stepNumber}`,
    status: "checkpointed",
    summary: `Checkpoint saved after step ${stepNumber}`,
    metadata: redactDeep({ last_action: lastAction.slice(0, 200) }) as Record<string, unknown>,
  });
}

async function lastCheckpoint(supabase: SupabaseClient, runId: string) {
  const { data } = await supabase
    .from("agent_checkpoints")
    .select("*")
    .eq("run_id", runId)
    .order("step_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function planOf(supabase: SupabaseClient, planId?: string | null) {
  if (!planId) return null;
  const { data } = await supabase.from("agent_plans").select("*").eq("id", planId).maybeSingle();
  return data;
}

/* ----------------------------------------------------------- prompt building */

function buildInstruction(args: {
  goal: string;
  memory: string;
  plan: string[];
  research: string;
  extra?: string | null;
  resumeFrom?: string | null;
}): string {
  return [
    args.goal,
    args.plan.length ? `Plan you already agreed on:\n${args.plan.map((s, i) => `${i + 1}. ${s}`).join("\n")}` : "",
    args.memory,
    args.research ? `Research gathered before you started:\n${args.research}` : "",
    args.resumeFrom ? `You are resuming an interrupted session. Last known state: ${args.resumeFrom}` : "",
    args.extra ?? "",
    [
      "Rules:",
      "- Never repeat an action that already failed; change method instead.",
      "- If you hit a CAPTCHA, an OTP/2FA prompt, a login wall, a payment confirmation or an irreversible action, STOP and say exactly what you need. Do not guess.",
      "- State clearly at the end whether the goal was achieved, with the evidence you saw.",
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function createTask(
  supabase: SupabaseClient,
  instruction: string,
  sessionId?: string | null,
): Promise<ProviderTask> {
  const response = await providerFetch(supabase, "/tasks", {
    method: "POST",
    body: JSON.stringify(sessionId ? { task: instruction, sessionId } : { task: instruction }),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const taskId = typeof data.id === "string" ? data.id : "";
  if (!response.ok || !taskId) {
    throw new Error(String(data.detail || data.error || `Provider HTTP ${response.status}`));
  }
  return (await getTask(supabase, taskId)) ?? { id: taskId };
}

/* -------------------------------------------------------------------- start */

export async function startRun(
  supabase: SupabaseClient,
  userId: string,
  args: { goal: string; conversationId?: string | null; budgetMs?: number },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const goal = args.goal.trim();
  if (!goal) return { status: 400, body: { error: "Empty goal" } };

  const { data: run, error } = await supabase
    .from("long_runs")
    .insert({
      user_id: userId,
      conversation_id: args.conversationId ?? null,
      goal,
      status: "queued",
      provider: "browser-use",
      phase: "planning",
      status_text: "Thinking about how to do this",
      budget_ms: args.budgetMs ?? DEFAULT_BUDGET_MS,
    })
    .select("*")
    .single();
  if (error || !run) {
    return { status: 500, body: { error: error?.message || "Run creation failed" } };
  }

  try {
    await emitActivity(supabase, run.id, {
      event_type: "TASK_STARTED",
      summary: `Starting: ${goal.slice(0, 160)}`,
      metadata: { goal_length: goal.length },
    });
    // 1 — memory first, exactly like a human recalling the site.
    const memories = await recallMemory(supabase, userId, goal);
    const memory = memoryBlock(memories);
    if (memories.length) {
      await addEvent(
        supabase,
        run.id,
        `Recalled ${memories.length} thing(s) from previous tasks`,
        "memory",
        memories.slice(0, 6).map((m) => `${m.key}: ${m.value}`).join("\n"),
      );
    }

    // 2 — plan.
    await emitActivity(supabase, run.id, {
      event_type: "PLANNING_STARTED",
      summary: "Breaking the objective down into a plan",
    });
    const plan = await makePlan(supabase, run, memory);
    const riskLevel = classifyPlanRisk(goal);
    const autoContinueAllowed = riskLevel === "low";
    const planText = [
      ...plan.steps.map((step, index) => `${index + 1}. ${step}`),
      plan.success_criteria ? `\nمعيار النجاح: ${plan.success_criteria}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    // 3 — blocking ambiguity? ask before burning provider minutes.
    if (plan.clarify) {
      await supabase.from("long_runs").update({ plan_id: plan.id }).eq("id", run.id);
      if (plan.steps.length) await addEvent(supabase, run.id, "الخطة", "plan", planText);
      await askUser(supabase, run, {
        question: plan.clarify,
        reason: "ambiguous_goal",
        sensitive: false,
      });
      const { data: parked } = await supabase
        .from("long_runs")
        .select("*")
        .eq("id", run.id)
        .single();
      return { status: 200, body: { ok: true, run: parked ?? run } };
    }

    // 4 — show the plan and wait for "Continue" — for 60s only, then go ahead.
    await addEvent(
      supabase,
      run.id,
      "دي الخطة اللي هأمشي عليها",
      "plan",
      planText || String(run.goal ?? ""),
      { event_type: "PLAN_UPDATED", metadata: { steps: plan.steps.length, risk: riskLevel } },
    );
    const { data: pending } = await supabase
      .from("long_runs")
      .update({
        plan_id: plan.id,
        kind: plan.kind === "browser" ? "browser" : "agentic",
        risk_level: riskLevel,
        auto_continue_allowed: autoContinueAllowed,
        status: "paused",
        phase: "plan_review",
        awaiting_plan_ack: true,
        auto_continue_at: autoContinueAllowed
          ? new Date(Date.now() + PLAN_ACK_MS).toISOString()
          : null,
        status_text: autoContinueAllowed
          ? "مستني موافقتك على الخطة (هكمّل تلقائي بعد 60 ثانية)"
          : "الخطة فيها إجراء مؤثر وبتحتاج موافقة صريحة",
        last_heartbeat_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .select("*")
      .single();
    return { status: 200, body: { ok: true, run: pending ?? run } };
  } catch (thrown) {
    const message = thrown instanceof Error ? thrown.message : "Failed to start task";
    await supabase.from("long_runs").update({ status: "error", error: message }).eq("id", run.id);
    await addEvent(supabase, run.id, "Failed to start", "error", message);
    return { status: 502, body: { error: message } };
  }
}

/* ------------------------------------------------------ plan ack / execution */

/** The user pressed Continue (or the 60s timer expired) — start doing the work. */
export async function beginExecution(
  supabase: SupabaseClient,
  run: RunRow,
  auto = false,
  revisedSteps?: string[],
): Promise<RunRow> {
  if (auto && run.auto_continue_allowed === false) return run;
  const goal = String(run.goal ?? "");
  const plan = await planOf(supabase, run.plan_id);
  let planSteps: string[] = Array.isArray(plan?.steps?.steps) ? plan!.steps.steps : [];
  const planTools: string[] = Array.isArray(plan?.steps?.tools) ? plan!.steps.tools : [];

  // The user edited the checklist before continuing — that wins over the model's.
  if (revisedSteps && revisedSteps.length) {
    planSteps = revisedSteps.slice(0, 20).map((s) => String(s).slice(0, 400));
    if (run.plan_id) {
      await supabase
        .from("agent_plans")
        .update({ steps: { ...(plan?.steps ?? {}), steps: planSteps, edited_by_user: true } })
        .eq("id", run.plan_id);
    }
    await addEvent(supabase, run.id, "عدّلت الخطة", "plan", planSteps.join("\n"));
  }

  const memory = memoryBlock(await recallMemory(supabase, run.user_id, goal));


  await supabase
    .from("long_runs")
    .update({
      awaiting_plan_ack: false,
      auto_continue_at: null,
      status: "running",
      phase: "working",
      status_text: planSteps[0] ?? "بدأت الشغل",
      last_heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", run.id);
  await addEvent(
    supabase,
    run.id,
    auto ? "كمّلت تلقائيًا بعد انتهاء المهلة" : "تمت الموافقة على الخطة — بدأت التنفيذ",
    "status",
  );

  // Independent pre-work the agent asked for in its own plan.
  if (planTools.includes("web_search")) {
    const research = await webSearch(supabase, goal);
    if (research) {
      await addEvent(supabase, run.id, "بحثت قبل البدء", "tool", research.slice(0, 1200));
    }
  }

  const fresh = { ...run, awaiting_plan_ack: false, status: "running", phase: "working" } as RunRow;

  // Coding / integrations / MCP / mixed work runs in the agentic executor.
  if (String(run.kind ?? "agentic") !== "browser") {
    return await tickAgentic(supabase, fresh);
  }

  try {
    const task = await createTask(
      supabase,
      buildInstruction({ goal, memory, plan: planSteps, research: "" }),
    );
    await supabase
      .from("long_runs")
      .update({
        status: mapStatus(task.status),
        external_run_id: task.id,
        live_view_url: task.liveUrl ?? null,
        last_heartbeat_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    await addEvent(supabase, run.id, "Computer session started", "status", null, {
      event_type: "TOOL_STARTED",
      tool: "browser",
      status: "running",
      summary: "Opened a real browser session",
    });
  } catch (thrown) {
    const message = thrown instanceof Error ? thrown.message : "Failed to start task";
    await supabase.from("long_runs").update({ status: "error", error: message }).eq("id", run.id);
    await addEvent(supabase, run.id, "Failed to start", "error", message);
  }
  const { data } = await supabase.from("long_runs").select("*").eq("id", run.id).single();
  return (data as RunRow) ?? fresh;
}


/* --------------------------------------------------------------------- tick */

/**
 * One kernel iteration for a single run. Safe to call from the client (status
 * polling) and from cron — it is idempotent and does the same work either way.
 */
export async function tickRun(supabase: SupabaseClient, run: RunRow): Promise<RunRow> {
  const status = typeof run.status === "string" ? run.status : "queued";
  if (["done", "error", "canceled"].includes(status)) return run;
  if (run.needs_input) return run;
  if (run.stop_requested) {
    await addEvent(supabase, run.id, "وقفت عند نقطة آمنة وحفظت الشغل الحالي", "status");
    await supabase
      .from("long_runs")
      .update({ status: "canceled", phase: "finished", stop_requested: false, status_text: "توقفت بأمان", updated_at: new Date().toISOString() })
      .eq("id", run.id);
    return { ...run, status: "canceled", phase: "finished", stop_requested: false };
  }

  const now = Date.now();
  const startedAt = Date.parse(run.created_at ?? new Date().toISOString());
  const budget = Number(run.budget_ms ?? DEFAULT_BUDGET_MS);
  if (now - startedAt > budget) {
    await finish(supabase, run, "error", "Time budget exhausted");
    return { ...run, status: "error", error: "Time budget exhausted" };
  }

  // Waiting for "Continue": auto-proceed once the 60s window is over. This runs
  // from cron too, so the timer holds even with the tab closed.
  if (run.awaiting_plan_ack) {
    if (run.auto_continue_allowed === false) return run;
    const due = Date.parse(run.auto_continue_at ?? new Date(0).toISOString());
    if (!Number.isFinite(due) || now >= due) return await beginExecution(supabase, run, true);
    return run;
  }

  if (String(run.kind ?? "agentic") !== "browser" && run.phase !== "browser_sub") {
    return await tickAgentic(supabase, run);
  }

  const externalId = typeof run.external_run_id === "string" ? run.external_run_id : "";
  if (!externalId) return run;


  const task = await getTask(supabase, externalId);
  if (!task) {
    // Sandbox is gone — resume from the last checkpoint in a fresh session.
    return await resumeAfterSandboxLoss(supabase, run);
  }

  const mapped = mapStatus(task.status);
  const steps = Array.isArray(task.steps) ? task.steps : [];

  // --- new steps become events + checkpoints -------------------------------
  const { count } = await supabase
    .from("long_run_events")
    .select("id", { count: "exact", head: true })
    .eq("run_id", run.id)
    .eq("type", "thought");
  const already = count ?? 0;
  const fresh = steps.slice(already);
  if (fresh.length) {
    await supabase.from("long_run_events").insert(
      fresh.map((step, index) => ({
        run_id: run.id,
        type: "thought",
        title: step.nextGoal || step.evaluationPreviousGoal || `Step ${already + index + 1}`,
        detail: [step.evaluationPreviousGoal, step.url].filter(Boolean).join(" · ") || null,
        screenshot_url: step.screenshotUrl ?? null,
        // Structured mirror so the UI shows the real tool and its live action.
        event_type: "TOOL_PROGRESS",
        tool: "browser",
        status: "running",
        step_id: String(already + index + 1),
        summary: step.nextGoal || step.evaluationPreviousGoal || `Browser step ${already + index + 1}`,
        metadata: { url: step.url ?? null },
      })),
    );
  }

  const patch: Record<string, unknown> = {
    status: mapped,
    live_view_url: task.liveUrl ?? run.live_view_url ?? null,
    step_count: steps.length,
    last_heartbeat_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (mapped === "running") patch.phase = "working";

  const latest = steps[steps.length - 1];
  const latestText = [latest?.nextGoal, latest?.evaluationPreviousGoal, latest?.url]
    .filter(Boolean)
    .join(" · ");
  if (latestText) patch.status_text = (latest?.nextGoal || latestText).slice(0, 240);

  // --- loop detection ------------------------------------------------------
  if (latest && fresh.length) {
    const print = fingerprint([latest.nextGoal, latest.url]);
    const strikes = print && print === run.last_fingerprint ? Number(run.loop_strikes ?? 0) + 1 : 0;
    patch.last_fingerprint = print;
    patch.loop_strikes = strikes;
    await checkpoint(supabase, run, steps.length, print, latestText, {
      url: latest.url ?? null,
      goal: latest.nextGoal ?? null,
      status: mapped,
    });

    const verdict = verdictFor(strikes);
    if (verdict !== "ok") {
      await addEvent(
        supabase,
        run.id,
        `Repeated action detected (${strikes}x) — changing approach`,
        "loop",
        latestText,
        {
          event_type: "RECOVERY_STARTED",
          tool: "browser",
          status: "recovering",
          summary: `Same action repeated ${strikes}x — switching approach`,
          metadata: { failure_class: "logical", strikes },
        },
      );
      if (verdict === "ask_user") {
        await supabase.from("long_runs").update(patch).eq("id", run.id);
        await remember(supabase, run.user_id, {
          kind: "lesson",
          key: `stuck:${(latest.nextGoal ?? "step").slice(0, 60)}`,
          value: `Got stuck repeating "${latestText}" — needs another route.`,
          source_run_id: run.id,
        });
        await askUser(supabase, run, {
          question: `I'm stuck: "${latest.nextGoal ?? latestText}" keeps failing. How should I proceed?`,
          reason: "loop",
          sensitive: false,
        });
        const { data: parked } = await supabase.from("long_runs").select("*").eq("id", run.id).single();
        return parked ?? { ...run, ...patch };
      }
      await providerFetch(supabase, `/tasks/${encodeURIComponent(externalId)}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "add_follow_up_task", task: loopInstruction(verdict, latestText) }),
      }).catch(() => null);
    }
  }

  // --- pause & ask ---------------------------------------------------------
  const blockText = [latestText, task.output, task.error].filter(Boolean).join(" \n ");
  const block = detectBlock(blockText) ?? detectLargeAmount(blockText);
  if (block) {
    await supabase.from("long_runs").update(patch).eq("id", run.id);
    await providerFetch(supabase, `/tasks/${encodeURIComponent(externalId)}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "pause" }),
    }).catch(() => null);
    await askUser(supabase, { id: run.id, user_id: run.user_id }, block);
    await notify(supabase, run, "Your task needs you", block.question);
    const { data: parked } = await supabase.from("long_runs").select("*").eq("id", run.id).single();
    return parked ?? { ...run, ...patch };
  }

  if (steps.length > MAX_STEPS) {
    await supabase.from("long_runs").update(patch).eq("id", run.id);
    await finish(supabase, run, "error", "Step budget exhausted");
    return { ...run, status: "error" };
  }

  // --- provider says finished -> self-critique ----------------------------
  if (mapped === "done" || mapped === "error") {
    // A browser sub-task owned by the agentic loop: hand the result back.
    if (run.phase === "browser_sub") {
      await supabase
        .from("long_runs")
        .update({ ...patch, status: "running", phase: "working", external_run_id: null })
        .eq("id", run.id);
      await addEvent(
        supabase,
        run.id,
        "نتيجة مهمة المتصفح",
        "observation",
        (task.output || task.error || "no output").slice(0, 4000),
      );
      const { data: back } = await supabase.from("long_runs").select("*").eq("id", run.id).single();
      return await tickAgentic(supabase, (back as RunRow) ?? { ...run, ...patch });
    }
    if (mapped === "done") {
      await supabase.from("long_runs").update(patch).eq("id", run.id);
      return await reviewFinished(supabase, { ...run, ...patch }, task);
    }
    patch.error = task.error || "Task failed";
    await supabase.from("long_runs").update(patch).eq("id", run.id);
    await finish(supabase, { ...run, ...patch }, "error", String(patch.error));
    return { ...run, ...patch };
  }


  await supabase.from("long_runs").update(patch).eq("id", run.id);
  if (mapped !== run.status) {
    await addEvent(supabase, run.id, "Computer is working", "status", null, {
      event_type: "TOOL_PROGRESS",
      tool: "browser",
      status: mapped,
      summary: String(patch.status_text ?? "Browser is working"),
    });
  }
  return { ...run, ...patch };
}

/* ----------------------------------------------------------- agentic executor */

const AGENTIC_EVENT_TYPES = ["act", "observation", "tool", "review", "answer"];

async function agenticTranscript(supabase: SupabaseClient, runId: string): Promise<string[]> {
  const { data } = await supabase
    .from("long_run_events")
    .select("type,title,detail,created_at")
    .eq("run_id", runId)
    .in("type", AGENTIC_EVENT_TYPES)
    .order("created_at", { ascending: true })
    .limit(200);
  return (data ?? []).map((event: any) =>
    event.detail ? `[${event.type}] ${event.title} :: ${event.detail}` : `[${event.type}] ${event.title}`,
  );
}

/** Pops the user's queued steering notes (if any) and logs them in the trace. */
async function drainGuidance(supabase: SupabaseClient, run: RunRow): Promise<string> {
  const { data } = await supabase
    .from("long_runs")
    .select("pending_guidance")
    .eq("id", run.id)
    .maybeSingle();
  const queued: string[] = Array.isArray((data as any)?.pending_guidance)
    ? ((data as any).pending_guidance as string[])
    : [];
  if (!queued.length) return "";
  await supabase.from("long_runs").update({ pending_guidance: [] }).eq("id", run.id);
  const text = queued.join("\n");
  await addEvent(supabase, run.id, "استلمت توجيه منك وهمشي عليه", "log", text.slice(0, 800));
  return text;
}

/** Steering interrupts the next safe decision; queued guidance waits for the next tick. */
async function drainSteering(supabase: SupabaseClient, run: RunRow): Promise<string> {
  const { data } = await supabase
    .from("long_runs")
    .select("pending_steering")
    .eq("id", run.id)
    .maybeSingle();
  const notes: string[] = Array.isArray((data as any)?.pending_steering)
    ? ((data as any).pending_steering as string[])
    : [];
  if (!notes.length) return "";
  await supabase.from("long_runs").update({ pending_steering: [] }).eq("id", run.id);
  const text = notes.join("\n");
  await addEvent(supabase, run.id, "غيّرت المسار عند أول نقطة آمنة", "log", text.slice(0, 800));
  return text;
}


/**
 * One bounded slice of the ReAct loop: think, use a tool, record the
 * observation. Repeats a few times per tick and resumes on the next tick, so a
 * task can run for hours server-side.
 */
export async function tickAgentic(supabase: SupabaseClient, run: RunRow): Promise<RunRow> {
  const deadline = Date.now() + TICK_DEADLINE_MS;
  const goal = String(run.goal ?? "");
  const plan = await planOf(supabase, run.plan_id);
  const planSteps: string[] = Array.isArray(plan?.steps?.steps) ? plan!.steps.steps : [];
  const memory = memoryBlock(await recallMemory(supabase, run.user_id, goal));
  let current: RunRow = run;
  let strikes = Number(run.loop_strikes ?? 0);
  let stepCount = Number(run.step_count ?? 0);
  /** Real failure carried into the next decision so the model recovers instead of repeating. */
  let recovery: { tool: string; failureClass: string; observation: string } | null = null;
  let transientRetries = 0;
  /** Human-readable print of the previous action, used by loop instructions. */
  let lastActionPrint = "";

  for (let i = 0; i < STEPS_PER_TICK && Date.now() < deadline; i += 1) {
    const { data: control } = await supabase
      .from("long_runs")
      .select("stop_requested,status")
      .eq("id", current.id)
      .maybeSingle();
    if (control?.status === "canceled") return { ...current, status: "canceled" };
    if (control?.stop_requested) return await tickRun(supabase, { ...current, stop_requested: true });
    if (stepCount > MAX_STEPS) {
      await finish(supabase, current, "error", "Step budget exhausted");
      return { ...current, status: "error" };
    }

    // Mid-run steering: whatever the user queued while we were working gets
    // folded into the very next decision, then cleared.
    const steering = await drainSteering(supabase, current);
    const guidance = i === 0 ? await drainGuidance(supabase, current) : "";

    const transcript = await agenticTranscript(supabase, current.id);
    const action: AgentAction | null = await decideNextAction(supabase, {
      goal,
      memory,
      plan: planSteps,
      transcript,
      extra:
        [
          steering ? `The user changed direction at this safe checkpoint: ${steering}\nFollow it now.` : null,
          guidance ? `The user queued this for the next work cycle: ${guidance}\nAccount for it now.` : null,
          strikes >= 1
            ? `${loopInstruction(verdictFor(strikes), lastActionPrint)}\nYour last action produced nothing new. Change your approach — different tool, different input.`
            : null,
          recovery
            ? [
                `Your last action (${recovery.tool}) failed. Failure class: ${recovery.failureClass}.`,
                `Raw failure: ${recovery.observation}`,
                recovery.failureClass === "transient"
                  ? "It looks temporary: retry the same approach once."
                  : recovery.failureClass === "authorization"
                    ? "Recover authentication first, or ask the user only if a credential is genuinely missing."
                    : "Do NOT repeat it as-is: diagnose the current state first, then use a different selector, a different tool, an API/MCP path, or a different sequence.",
              ].join("\n")
            : null,
        ]
          .filter(Boolean)
          .join("\n") || null,
    });

    if (!action) {
      // The planner produced nothing. That is a real, classifiable failure —
      // retry a bounded number of times, then stop with the actual blocker
      // instead of looping on the same empty decision forever.
      const dead = Number(current.decide_failures ?? 0) + 1;
      await supabase.from("long_runs").update({ decide_failures: dead }).eq("id", current.id);
      current = { ...current, decide_failures: dead };
      await addEvent(
        supabase,
        current.id,
        "مش قدرت أحدد الخطوة الجاية — هجرّب تاني",
        "log",
        null,
        {
          event_type: "TOOL_FAILED",
          status: "failed",
          summary: "Could not decide the next step — the planning model did not answer",
          metadata: { failure_class: "provider_error", attempts: dead },
        },
      );
      if (dead >= MAX_DECIDE_FAILURES) {
        await finish(
          supabase,
          current,
          "error",
          "The planning model is unavailable right now, so the task could not continue. No usable model key answered.",
        );
        return { ...current, status: "error" };
      }
      break;
    }

    const actionDescription = `${action.tool} ${JSON.stringify(action.input)}`;
    const guardedTool = action.tool === "mcp_call" || action.tool === "write_file";
    const actionBlock = guardedTool
      ? detectBlock(actionDescription) ?? detectLargeAmount(actionDescription)
      : null;
    if (actionBlock) {
      await askUser(supabase, { id: current.id, user_id: current.user_id }, actionBlock);
      await addEvent(
        supabase,
        current.id,
        "وقفت قبل إجراء مؤثر وبستنى موافقتك",
        "approval",
        actionBlock.reason,
        { event_type: "WAITING_FOR_USER", tool: action.tool, status: "blocked" },
      );
      await notify(supabase, current, "المهمة محتاجة موافقتك", actionBlock.question);
      const { data } = await supabase.from("long_runs").select("*").eq("id", current.id).single();
      return (data as RunRow) ?? current;
    }

    stepCount += 1;
    const stepId = `${current.id}:${stepCount}`;
    await addEvent(
      supabase,
      current.id,
      action.say || describeAction(action.tool, action.input),
      "act",
      `${action.tool} ${redactToolInput(action.tool, action.input)}`,
      {
        event_type: "TOOL_STARTED",
        tool: action.tool,
        action: action.tool,
        status: "running",
        step_id: stepId,
        metadata: { thought: action.thought, input: action.input },
      },
    );
    await supabase
      .from("long_runs")
      .update({
        status: "running",
        phase: "working",
        step_count: stepCount,
        status_text: (action.say || describeAction(action.tool, action.input)).slice(0, 240),
        last_heartbeat_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.id);

    // --- loop detection --------------------------------------------------
    const print = fingerprint([action.tool, JSON.stringify(action.input)]);
    strikes = print && print === current.last_fingerprint ? strikes + 1 : 0;
    await supabase
      .from("long_runs")
      .update({ last_fingerprint: print, loop_strikes: strikes })
      .eq("id", current.id);
    current = { ...current, last_fingerprint: print, loop_strikes: strikes, step_count: stepCount };
    lastActionPrint = print;
    await checkpoint(supabase, current, stepCount, print, `${action.tool}`, {
      tool: action.tool,
      input: guardedTool ? { redacted: true } : action.input,
    });
    if (strikes >= 1) {
      await emitActivity(supabase, current.id, {
        event_type: "RECOVERY_STARTED",
        tool: action.tool,
        status: "recovering",
        step_id: stepId,
        summary: `The last attempt at ${describeAction(action.tool, action.input)} changed nothing — switching approach`,
        metadata: {
          strikes,
          directive: loopInstruction(verdictFor(strikes), describeAction(action.tool, action.input)),
        },
      });
    }
    if (verdictFor(strikes) === "ask_user") {
      await addEvent(supabase, current.id, `تكرار متكرر (${strikes}x) — محتاج توجيه`, "loop", null, {
        event_type: "WAITING_FOR_USER",
        tool: action.tool,
        status: "blocked",
        step_id: stepId,
        metadata: { strikes },
      });
      await askUser(supabase, { id: current.id, user_id: current.user_id }, {
        question: `أنا عالق: "${action.tool}" مش بيوصلني لحاجة جديدة. أعمل إيه؟`,
        reason: "loop",
        sensitive: false,
      });
      await notify(supabase, current, "المهمة محتاجاك", "الوكيل عالق ومحتاج توجيه");
      const { data } = await supabase.from("long_runs").select("*").eq("id", current.id).single();
      return (data as RunRow) ?? current;
    }

    // --- control-flow tools ----------------------------------------------
    if (action.tool === "ask_user") {
      await askUser(supabase, { id: current.id, user_id: current.user_id }, {
        question: String(action.input.question ?? "محتاج معلومة منك لأكمل"),
        reason: "agent_request",
        sensitive: Boolean(action.input.sensitive),
      });
      await notify(supabase, current, "المهمة محتاجاك", String(action.input.question ?? ""));
      const { data } = await supabase.from("long_runs").select("*").eq("id", current.id).single();
      return (data as RunRow) ?? current;
    }

    if (action.tool === "remember") {
      await remember(supabase, current.user_id, {
        kind: "user_fact",
        key: String(action.input.key ?? "note").slice(0, 120),
        value: String(action.input.value ?? "").slice(0, 800),
        source_run_id: current.id,
      }).catch(() => null);
      await addEvent(supabase, current.id, "حفظت المعلومة دي للمستقبل", "observation", String(action.input.key ?? ""));
      continue;
    }

    if (action.tool === "browser_task") {
      try {
        const task = await createTask(
          supabase,
          buildInstruction({
            goal: String(action.input.task ?? goal),
            memory,
            plan: [],
            research: "",
            extra: `This is a sub-task of a larger job: ${goal}`,
          }),
        );
        await supabase
          .from("long_runs")
          .update({
            status: mapStatus(task.status),
            phase: "browser_sub",
            external_run_id: task.id,
            live_view_url: task.liveUrl ?? null,
            status_text: "بشغّل المتصفح للجزء ده",
            last_heartbeat_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", current.id);
        await addEvent(supabase, current.id, "سلّمت الجزء ده للمتصفح", "tool", String(action.input.task ?? ""));
      } catch (error) {
        await addEvent(
          supabase,
          current.id,
          "المتصفح مش متاح",
          "observation",
          error instanceof Error ? error.message : null,
        );
        continue;
      }
      const { data } = await supabase.from("long_runs").select("*").eq("id", current.id).single();
      return (data as RunRow) ?? current;
    }

    if (action.tool === "finish") {
      return await reviewAgentic(supabase, current, String(action.input.summary ?? ""));
    }

    // --- real tools -------------------------------------------------------
    const outcome = await runTool(
      supabase,
      { runId: current.id, userId: current.user_id },
      action,
    );
    const failed = /^(error|sandbox unavailable|could not|timed out|mcp (error|call failed)|unsupported tool|no code provided|file not found)/i
      .test(outcome.observation.trim());
    const failureClass = failed ? classifyFailure(outcome.observation) : null;
    await addEvent(
      supabase,
      current.id,
      outcome.artifact
        ? `Produced ${outcome.artifact.name}`
        : failed
          ? `${describeAction(action.tool, action.input)} did not succeed — diagnosing`
          : `Finished: ${describeAction(action.tool, action.input)}`,
      "observation",
      outcome.observation.slice(0, 4000),
      {
        event_type: failed ? "TOOL_FAILED" : "TOOL_COMPLETED",
        tool: action.tool,
        action: action.tool,
        status: failed ? "failed" : "done",
        step_id: stepId,
        metadata: { failure_class: failureClass, artifact: outcome.artifact ?? null },
      },
    );
    if (failureClass) {
      await supabase.from("long_runs").update({ failure_class: failureClass }).eq("id", current.id);
      recovery = { tool: action.tool, failureClass, observation: outcome.observation.slice(0, 600) };
      if (failureClass === "human_required" || failureClass === "unsafe") {
        await askUser(supabase, { id: current.id, user_id: current.user_id }, {
          question: `I hit a blocker I cannot pass on my own while trying to ${describeAction(action.tool, action.input)}. How should I proceed?`,
          reason: failureClass,
          sensitive: false,
        });
        await emitActivity(supabase, current.id, {
          event_type: "WAITING_FOR_USER",
          tool: action.tool,
          status: "blocked",
          summary: "Blocked by something only you can resolve — waiting for you",
        });
        const { data } = await supabase.from("long_runs").select("*").eq("id", current.id).single();
        return (data as RunRow) ?? current;
      }
      if (failureClass === "transient") {
        await emitActivity(supabase, current.id, {
          event_type: "RECOVERY_STARTED",
          tool: action.tool,
          status: "retrying",
          summary: `Temporary failure — waiting a moment and retrying ${describeAction(action.tool, action.input)}`,
          metadata: { failure_class: failureClass },
        });
        await new Promise((r) => setTimeout(r, Math.min(4000 * (transientRetries + 1), 12_000)));
        transientRetries += 1;
        if (transientRetries > 3) {
          recovery = { tool: action.tool, failureClass: "terminal", observation: outcome.observation.slice(0, 600) };
        }
      } else {
        await emitActivity(supabase, current.id, {
          event_type: "RECOVERY_STARTED",
          tool: action.tool,
          status: "recovering",
          summary: `Diagnosing why ${describeAction(action.tool, action.input)} failed, then trying another way`,
          metadata: { failure_class: failureClass },
        });
      }
    } else {
      transientRetries = 0;
      recovery = null;
    }
    // Deliverables are collected on the run so the chat can offer them for download.
    if (outcome.artifact) {
      const { data: row } = await supabase
        .from("long_runs")
        .select("result")
        .eq("id", current.id)
        .maybeSingle();
      const result = ((row as any)?.result ?? {}) as Record<string, unknown>;
      const files = Array.isArray(result.files)
        ? (result.files as { name?: string; url: string }[])
        : [];
      if (!files.some((f) => f.url === outcome.artifact!.url)) files.push(outcome.artifact);
      await supabase
        .from("long_runs")
        .update({ result: { ...result, files }, updated_at: new Date().toISOString() })
        .eq("id", current.id);
    }
  }


  const { data } = await supabase.from("long_runs").select("*").eq("id", current.id).single();
  return (data as RunRow) ?? current;
}

/** The announced self-review of an agentic run. */
async function reviewAgentic(
  supabase: SupabaseClient,
  run: RunRow,
  summary: string,
): Promise<RunRow> {
  const round = Number(run.review_round ?? 0) + 1;
  await supabase
    .from("long_runs")
    .update({ phase: "reviewing", status_text: REVIEW_TEXT, updated_at: new Date().toISOString() })
    .eq("id", run.id);
  await addEvent(supabase, run.id, REVIEW_TEXT, "status", summary || null, {
    event_type: "VERIFICATION_STARTED",
    status: "verifying",
  });

  const plan = await planOf(supabase, run.plan_id);
  const planSteps: string[] = Array.isArray(plan?.steps?.steps) ? plan!.steps.steps : [];
  const review = await critique(supabase, {
    goal: String(run.goal ?? ""),
    steps: planSteps,
    successCriteria: plan?.steps?.success_criteria ?? null,
    trace: await agenticTranscript(supabase, run.id),
    output: summary || null,
    round,
  });
  await savePlanReview(supabase, String(run.plan_id ?? ""), round, review);
  await addEvent(supabase, run.id, `مراجعة ذاتية: ${review.verdict}`, "review", review.critique, {
    event_type: review.verdict === "pass" ? "VERIFICATION_PASSED" : "VERIFICATION_FAILED",
    status: review.verdict,
    metadata: { round },
  });
  await supabase.from("long_runs").update({ review_round: round }).eq("id", run.id);

  if (review.verdict === "ask" && review.question) {
    await askUser(supabase, { id: run.id, user_id: run.user_id }, {
      question: review.question,
      reason: "review",
      sensitive: false,
    });
    await notify(supabase, run, "المهمة محتاجاك", review.question);
    const { data } = await supabase.from("long_runs").select("*").eq("id", run.id).single();
    return (data as RunRow) ?? run;
  }

  if (review.verdict === "retry" && round <= MAX_REVIEW_ROUNDS) {
    await addEvent(
      supabase,
      run.id,
      "المراجعة كشفت نقص — برجع أكمّل صح",
      "answer",
      [review.critique, review.fix_instruction].filter(Boolean).join("\n"),
      { event_type: "REPLANNING_STARTED", status: "replanning", metadata: { round } },
    );
    await supabase
      .from("long_runs")
      .update({
        status: "running",
        phase: "working",
        status_text: "بصلّح اللي ناقص",
        loop_strikes: 0,
        last_fingerprint: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    const { data } = await supabase.from("long_runs").select("*").eq("id", run.id).single();
    return (data as RunRow) ?? { ...run, review_round: round };
  }

  await finish(supabase, { ...run, review_round: round }, "done", null, summary, review.critique);
  const { data } = await supabase.from("long_runs").select("*").eq("id", run.id).single();
  return (data as RunRow) ?? run;
}



/* --------------------------------------------------------- review / finish */

async function reviewFinished(
  supabase: SupabaseClient,
  run: RunRow,
  task: ProviderTask,
): Promise<RunRow> {
  const plan = await planOf(supabase, run.plan_id);
  const planSteps: string[] = Array.isArray(plan?.steps?.steps) ? plan!.steps.steps : [];
  const round = Number(run.review_round ?? 0) + 1;
  const trace = await traceOf(supabase, run.id);
  const output = task.output ?? null;

  // Say it out loud before grading itself.
  await supabase
    .from("long_runs")
    .update({ phase: "reviewing", status_text: REVIEW_TEXT, updated_at: new Date().toISOString() })
    .eq("id", run.id);
  await addEvent(supabase, run.id, REVIEW_TEXT, "status", output, {
    event_type: "VERIFICATION_STARTED",
    status: "verifying",
  });



  const review = await critique(supabase, {
    goal: String(run.goal ?? ""),
    steps: planSteps,
    successCriteria: plan?.steps?.success_criteria ?? null,
    trace,
    output,
    round,
  });
  await savePlanReview(supabase, String(run.plan_id ?? ""), round, review);
  await addEvent(supabase, run.id, `Self-review: ${review.verdict}`, "review", review.critique, {
    event_type: review.verdict === "pass" ? "VERIFICATION_PASSED" : "VERIFICATION_FAILED",
    status: review.verdict,
    metadata: { round },
  });

  if (review.verdict === "ask" && review.question) {
    await supabase.from("long_runs").update({ review_round: round }).eq("id", run.id);
    await askUser(supabase, { id: run.id, user_id: run.user_id }, {
      question: review.question,
      reason: "review",
      sensitive: false,
    });
    await notify(supabase, run, "Your task needs you", review.question);
    const { data: parked } = await supabase.from("long_runs").select("*").eq("id", run.id).single();
    return parked ?? run;
  }

  if (review.verdict === "retry" && round <= MAX_REVIEW_ROUNDS) {
    const memory = memoryBlock(await recallMemory(supabase, run.user_id, String(run.goal ?? "")));
    const instruction = buildInstruction({
      goal: String(run.goal ?? ""),
      memory,
      plan: planSteps,
      research: "",
      extra: [
        "Your previous attempt did NOT actually achieve the goal.",
        `Review: ${review.critique}`,
        review.fix_instruction ? `Do this differently: ${review.fix_instruction}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    });
    try {
      const next = await createTask(supabase, instruction);
      await supabase
        .from("long_runs")
        .update({
          status: mapStatus(next.status),
          phase: "working",
          review_round: round,
          external_run_id: next.id,
          live_view_url: next.liveUrl ?? null,
          status_text: "Fixing what was missed",
          loop_strikes: 0,
          last_fingerprint: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", run.id);
      await addEvent(supabase, run.id, "Retrying to finish the job properly", "status", review.critique, {
        event_type: "REPLANNING_STARTED",
        tool: "browser",
        status: "recovering",
        summary: "Self-review failed — retrying with a corrected approach",
      });
      const { data: retried } = await supabase.from("long_runs").select("*").eq("id", run.id).single();
      return retried ?? run;
    } catch {
      /* fall through to accepting the result */
    }
  }

  await finish(supabase, { ...run, review_round: round }, "done", null, output, review.critique);
  const { data: finished } = await supabase.from("long_runs").select("*").eq("id", run.id).single();
  return finished ?? run;
}

async function finish(
  supabase: SupabaseClient,
  run: RunRow,
  status: "done" | "error",
  error: string | null,
  output?: string | null,
  reviewNote?: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  // Keep any artifacts produced during the run attached to the final result.
  const { data: latest } = await supabase
    .from("long_runs")
    .select("result")
    .eq("id", run.id)
    .maybeSingle();
  const previous = (((latest as any)?.result ?? run.result) ?? {}) as Record<string, unknown>;
  const files = Array.isArray(previous.files) ? previous.files : [];
  await supabase
    .from("long_runs")
    .update({
      status,
      phase: "finished",
      review_round: run.review_round ?? 0,
      result:
        status === "done"
          ? { output: output ?? null, review: reviewNote ?? null, files }
          : files.length
            ? { ...previous, files }
            : run.result ?? null,

      error,
      status_text: status === "done" ? "Task completed" : "Task failed",
      expires_at: now,
      updated_at: now,
    })
    .eq("id", run.id);
  await addEvent(
    supabase,
    run.id,
    status === "done" ? "Task finished" : "Task failed",
    status === "done" ? "status" : "error",
    error ?? output ?? null,
    { event_type: status === "done" ? "TASK_COMPLETED" : "TASK_FAILED", status },
  );
  await notify(
    supabase,
    run,
    status === "done" ? "Task finished" : "Task failed",
    String(run.goal ?? "").slice(0, 160),
  );
  // Learn from the run whichever way it went.
  const trace = await traceOf(supabase, run.id);
  await learnFromRun(
    supabase,
    run.user_id,
    run.id,
    String(run.goal ?? ""),
    trace,
    status === "done" ? `success: ${output ?? ""}` : `failure: ${error ?? ""}`,
  ).catch(() => null);
}

/* ------------------------------------------------------- sandbox resilience */

async function resumeAfterSandboxLoss(supabase: SupabaseClient, run: RunRow): Promise<RunRow> {
  const generation = Number(run.sandbox_generation ?? 0) + 1;
  if (generation > 12) {
    await finish(supabase, run, "error", "Lost the browser session too many times");
    return { ...run, status: "error" };
  }
  const point = await lastCheckpoint(supabase, run.id);
  const memory = memoryBlock(await recallMemory(supabase, run.user_id, String(run.goal ?? "")));
  const plan = await planOf(supabase, run.plan_id);
  const planSteps: string[] = Array.isArray(plan?.steps?.steps) ? plan!.steps.steps : [];
  try {
    const task = await createTask(
      supabase,
      buildInstruction({
        goal: String(run.goal ?? ""),
        memory,
        plan: planSteps,
        research: "",
        resumeFrom: point
          ? `step ${point.step_number} — ${point.last_action ?? ""} (url: ${(point.state as any)?.url ?? "unknown"})`
          : null,
      }),
    );
    await supabase
      .from("long_runs")
      .update({
        status: mapStatus(task.status),
        external_run_id: task.id,
        live_view_url: task.liveUrl ?? null,
        sandbox_generation: generation,
        status_text: "Resuming after the browser restarted",
        loop_strikes: 0,
        last_fingerprint: null,
        last_heartbeat_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    await addEvent(
      supabase,
      run.id,
      "Browser session restarted — resuming from last checkpoint",
      "status",
      null,
      { event_type: "TASK_RESUMED", status: "resumed" },
    );
    const { data } = await supabase.from("long_runs").select("*").eq("id", run.id).single();
    return data ?? run;
  } catch (error) {
    await addEvent(
      supabase,
      run.id,
      "Could not restart the browser session",
      "error",
      error instanceof Error ? error.message : null,
    );
    return run;
  }
}

/* -------------------------------------------------------------- answer flow */

/** The user answered the open question — feed it back and continue. */
export async function answerRun(
  supabase: SupabaseClient,
  run: RunRow,
  answer: string,
): Promise<RunRow> {
  const question = await openQuestion(supabase, run.id);
  if (!question) return run;
  await resolveQuestion(supabase, question.id, run.id, answer);
  const safeAnswer = question.sensitive ? "تمت الخطوة الحساسة بواسطة المستخدم" : answer.slice(0, 400);
  await addEvent(supabase, run.id, "You answered", "answer", safeAnswer);

  if (!question.sensitive) {
    await remember(supabase, run.user_id, {
      kind: "preference",
      key: `answer:${String(question.reason ?? "general").slice(0, 40)}`,
      value: `When asked "${String(question.question).slice(0, 120)}" the user said: ${answer.slice(0, 200)}`,
      source_run_id: run.id,
    }).catch(() => null);
  }

  // Agentic runs continue inside their own loop with the answer in the transcript.
  if (String(run.kind ?? "agentic") !== "browser" && run.phase !== "browser_sub") {
    await supabase
      .from("long_runs")
      .update({
        status: "running",
        phase: run.awaiting_plan_ack ? "plan_review" : "working",
        status_text: "بكمّل بعد ردّك",
        loop_strikes: 0,
        last_fingerprint: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    const { data: resumedRun } = await supabase.from("long_runs").select("*").eq("id", run.id).single();
    const next = (resumedRun as RunRow) ?? run;
    return next.awaiting_plan_ack
      ? await beginExecution(supabase, next)
      : await tickAgentic(supabase, next);
  }

  const externalId = typeof run.external_run_id === "string" ? run.external_run_id : "";
  const followUp = question.sensitive
    ? "The user completed the sensitive step directly in the live browser. Continue from where you stopped."
    : `The user answered your question: ${answer}\nContinue the task from where you stopped.`;



  if (externalId) {
    const resumed = await providerFetch(supabase, `/tasks/${encodeURIComponent(externalId)}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "resume" }),
    }).catch(() => null);
    await providerFetch(supabase, `/tasks/${encodeURIComponent(externalId)}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "add_follow_up_task", task: followUp }),
    }).catch(() => null);
    if (resumed?.ok) {
      await supabase
        .from("long_runs")
        .update({ status: "running", status_text: "Continuing", updated_at: new Date().toISOString() })
        .eq("id", run.id);
      const { data } = await supabase.from("long_runs").select("*").eq("id", run.id).single();
      return data ?? run;
    }
  }

  // No live session (e.g. clarification asked before execution) — start now.
  const plan = await planOf(supabase, run.plan_id);
  const planSteps: string[] = Array.isArray(plan?.steps?.steps) ? plan!.steps.steps : [];
  const memory = memoryBlock(await recallMemory(supabase, run.user_id, String(run.goal ?? "")));
  try {
    const task = await createTask(
      supabase,
      buildInstruction({
        goal: String(run.goal ?? ""),
        memory,
        plan: planSteps,
        research: "",
        extra: `The user clarified: ${answer}`,
      }),
    );
    await supabase
      .from("long_runs")
      .update({
        status: mapStatus(task.status),
        phase: "working",
        external_run_id: task.id,
        live_view_url: task.liveUrl ?? null,
        status_text: planSteps[0] ?? "Working",
        last_heartbeat_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id);
  } catch (error) {
    await addEvent(
      supabase,
      run.id,
      "Could not continue after your answer",
      "error",
      error instanceof Error ? error.message : null,
    );
  }
  const { data } = await supabase.from("long_runs").select("*").eq("id", run.id).single();
  return data ?? run;
}

/** Cron entry point: advance every live run, oldest heartbeat first. */
export async function tickAllRuns(supabase: SupabaseClient, limit = 25): Promise<number> {
  const { data } = await supabase
    .from("long_runs")
    .select("*")
    .in("status", ["queued", "running", "paused"])
    .eq("needs_input", false)
    .order("last_heartbeat_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  const runs = (data ?? []) as RunRow[];
  for (const run of runs) {
    try {
      // Stall detection: a running task that has not produced a real event for
      // STALL_MS is resumed from its last checkpoint instead of hanging forever.
      const beat = run.last_heartbeat_at ? Date.parse(String(run.last_heartbeat_at)) : 0;
      const stalled = run.status === "running" && beat > 0 && Date.now() - beat > STALL_MS;
      if (stalled) {
        const stalls = Number(run.stall_count ?? 0) + 1;
        await supabase.from("long_runs").update({ stall_count: stalls }).eq("id", run.id);
        if (stalls > MAX_STALLS) {
          await finish(
            supabase,
            run,
            "error",
            "The task stopped making progress and could not be resumed automatically.",
          );
          continue;
        }
        const point = await lastCheckpoint(supabase, run.id);
        await emitActivity(supabase, run.id, {
          event_type: "TASK_RESUMED",
          status: "resumed",
          summary: point
            ? `No progress for a while — resuming from checkpoint ${point.step_number}`
            : "No progress for a while — restarting the current step",
          metadata: { stalls, last_action: point?.last_action ?? null },
        });
      }
      await tickRun(supabase, { ...run, stall_count: run.stall_count ?? 0 });
    } catch (error) {
      console.error(`tick failed for run ${run.id}`, error);
      await emitActivity(supabase, run.id, {
        event_type: "TOOL_FAILED",
        status: "failed",
        summary: "A worker step crashed — recovering from the last checkpoint",
        metadata: { failure_class: classifyFailure(error instanceof Error ? error.message : "") },
      }).catch(() => null);
    }
  }
  return runs.length;
}
