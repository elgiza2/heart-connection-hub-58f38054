/**
 * Long-run HTTP surface. All the intelligence lives in the shared agent kernel
 * (`_shared/agentkernel`) so the same loop runs from the browser and from cron.
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  addEvent,
  answerRun,
  beginExecution,
  providerFetch,
  startRun,
  tickAllRuns,
  tickRun,
} from "../_shared/agentkernel/kernel.ts";
import { openQuestion } from "../_shared/agentkernel/questions.ts";

export interface LongRunPayload {
  action?:
    | "start"
    | "keepalive"
    | "status"
    | "stop"
    | "answer"
    | "approve_plan"
    | "guide"
    | "steer"
    | "soft_stop"
    | "cron_tick";
  token?: string;
  goal?: string;
  answer?: string;
  budget_ms?: number;
  conversation_id?: string | null;
  run_id?: string;
  plan_steps?: string[];
  guidance?: string;

}

function db() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Server misconfigured");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getUser(supabase: SupabaseClient, token?: string) {
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error || !data.user ? null : data.user;
}

async function loadOwnedRun(supabase: SupabaseClient, userId: string, runId?: string) {
  if (!runId) return null;
  const { data } = await supabase
    .from("long_runs")
    .select("*")
    .eq("id", runId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

export async function handleLongRun(payload: LongRunPayload | null, tickSecret?: string) {
  const supabase = db();

  if (payload?.action === "cron_tick") {
    const { data: tickConfig } = await supabase
      .from("agent_tick_config")
      .select("secret")
      .eq("id", true)
      .maybeSingle();
    const expected = (tickConfig as { secret?: string } | null)?.secret;
    if (!expected || tickSecret !== expected) {
      return { status: 403, body: { error: "Forbidden" } };
    }
    return { status: 200, body: { ok: true, advanced: await tickAllRuns(supabase, 25) } };
  }

  const user = await getUser(supabase, payload?.token);
  if (!user) return { status: 401, body: { error: "Sign in required" } };

  if (payload?.action === "start") {
    return await startRun(supabase, user.id, {
      goal: payload.goal ?? "",
      conversationId: payload.conversation_id ?? null,
      budgetMs: payload.budget_ms,
    });
  }

  if (payload?.action === "keepalive" || payload?.action === "status") {
    const run = await loadOwnedRun(supabase, user.id, payload.run_id);
    if (!run) return { status: 404, body: { error: "Unknown run" } };
    const advanced = await tickRun(supabase, run);
    return {
      status: 200,
      body: { ok: true, run: advanced, question: await openQuestion(supabase, run.id) },
    };
  }

  if (payload?.action === "approve_plan") {
    const run = await loadOwnedRun(supabase, user.id, payload.run_id);
    if (!run) return { status: 404, body: { error: "Unknown run" } };
    if (!run.awaiting_plan_ack) return { status: 200, body: { ok: true, run } };
    const steps = Array.isArray(payload.plan_steps)
      ? payload.plan_steps.map((s) => String(s)).filter((s) => s.trim().length > 0)
      : undefined;
    return {
      status: 200,
      body: { ok: true, run: await beginExecution(supabase, run, false, steps) },
    };

  }

  if (payload?.action === "guide" || payload?.action === "steer") {
    const run = await loadOwnedRun(supabase, user.id, payload.run_id);
    if (!run) return { status: 404, body: { error: "Unknown run" } };
    const note = (payload.guidance ?? "").trim().slice(0, 2000);
    if (!note) return { status: 400, body: { error: "Empty guidance" } };
    const field = payload.action === "steer" ? "pending_steering" : "pending_guidance";
    const queued: string[] = Array.isArray((run as Record<string, unknown>)[field])
      ? ((run as Record<string, unknown>)[field] as string[])
      : [];
    const { data: updated } = await supabase
      .from("long_runs")
      .update({ [field]: [...queued, note].slice(-10) })
      .eq("id", run.id)
      .select("*")
      .single();
    return { status: 200, body: { ok: true, run: updated ?? run } };
  }

  if (payload?.action === "soft_stop") {
    const run = await loadOwnedRun(supabase, user.id, payload.run_id);
    if (!run) return { status: 404, body: { error: "Unknown run" } };
    const { data: updated } = await supabase
      .from("long_runs")
      .update({ stop_requested: true, status_text: "هقف عند أقرب نقطة آمنة", updated_at: new Date().toISOString() })
      .eq("id", run.id)
      .select("*")
      .single();
    await addEvent(supabase, run.id, "طلبت إيقافًا آمنًا", "status");
    return { status: 200, body: { ok: true, run: updated ?? run } };
  }

  if (payload?.action === "answer") {
    const run = await loadOwnedRun(supabase, user.id, payload.run_id);
    if (!run) return { status: 404, body: { error: "Unknown run" } };
    const answer = (payload.answer ?? "").trim();
    if (!answer) return { status: 400, body: { error: "Empty answer" } };
    return { status: 200, body: { ok: true, run: await answerRun(supabase, run, answer) } };
  }

  if (payload?.action === "stop") {
    const run = await loadOwnedRun(supabase, user.id, payload.run_id);
    if (!run) return { status: 404, body: { error: "Unknown run" } };
    if (run.external_run_id) {
      await providerFetch(supabase, `/tasks/${encodeURIComponent(run.external_run_id)}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "stop" }),
      }).catch(() => null);
    }
    const { data: updated } = await supabase
      .from("long_runs")
      .update({
        status: "canceled",
        needs_input: false,
        expires_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .select("*")
      .single();
    await supabase
      .from("agent_questions")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("run_id", run.id)
      .eq("status", "open");
    await addEvent(supabase, run.id, "Task stopped by user", "status");
    return { status: 200, body: { ok: true, run: updated ?? run } };
  }

  return { status: 400, body: { error: "Unknown action" } };
}
