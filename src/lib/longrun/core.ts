import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Long-running computer sessions — Browser Use Cloud provider.
 *
 * The chat UI calls this through /api/long-run (Vercel function in prod,
 * Vite dev middleware locally). The frontend reads run rows and events over
 * Supabase realtime; this handler is the only writer and syncs status from
 * the Browser Use Cloud API on start/keepalive/stop.
 */

export interface LongRunPayload {
  action: "start" | "keepalive" | "status" | "stop";
  token?: string;
  goal?: string;
  conversation_id?: string | null;
  run_id?: string;
}

const BU_BASE = "https://api.browser-use.com/api/v2";

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server misconfigured");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getUser(supabase: SupabaseClient, token?: string) {
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error || !data.user ? null : data.user;
}

async function buKey(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from("provider_api_keys")
    .select("api_key")
    .eq("provider", "c")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const key =
    (data as { api_key?: string } | null)?.api_key?.trim() ||
    process.env.BROWSER_USE_API_KEY;
  if (!key) throw new Error("Computer provider is not configured yet");
  return key;
}

async function buFetch(
  supabase: SupabaseClient,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${BU_BASE}${path}`, {
    ...init,
    headers: {
      "X-Browser-Use-API-Key": await buKey(supabase),
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

type BuStatus = "created" | "started" | "running" | "paused" | "stopped" | "finished" | "failed" | string;

interface BuStep {
  number?: number;
  nextGoal?: string | null;
  evaluationPreviousGoal?: string | null;
  memory?: string | null;
  url?: string | null;
  actions?: unknown[];
}

interface BuTask {
  id: string;
  sessionId?: string | null;
  status?: BuStatus;
  liveUrl?: string | null;
  output?: string | null;
  error?: string | null;
  steps?: BuStep[];
}

function mapStatus(s: BuStatus | undefined): string {
  switch (s) {
    case "created":
      return "queued";
    case "started":
    case "running":
      return "running";
    case "paused":
      return "paused";
    case "finished":
      return "done";
    case "stopped":
      return "canceled";
    case "failed":
      return "error";
    default:
      return "running";
  }
}

async function getTask(supabase: SupabaseClient, taskId: string): Promise<BuTask | null> {
  const resp = await buFetch(supabase, `/tasks/${taskId}`);
  if (!resp.ok) return null;
  const task = (await resp.json().catch(() => null)) as BuTask | null;
  if (!task) return null;

  // The live browser URL lives on the session, not the task.
  if (task.sessionId) {
    try {
      const sResp = await buFetch(supabase, `/sessions/${task.sessionId}`);
      if (sResp.ok) {
        const session = (await sResp.json().catch(() => null)) as {
          liveUrl?: string | null;
        } | null;
        task.liveUrl = session?.liveUrl ?? null;
      }
    } catch {
      /* live URL is best-effort */
    }
  }
  return task;
}

async function addEvent(
  supabase: SupabaseClient,
  runId: string,
  title: string,
  type = "log",
  detail?: string | null,
) {
  await supabase.from("long_run_events").insert({
    run_id: runId,
    type,
    title,
    detail: detail ?? null,
  });
}

/**
 * Pull the latest state from Browser Use and mirror it into the run row so
 * realtime subscribers (the chat card) update live.
 */
async function syncRun(supabase: SupabaseClient, run: Record<string, any>) {
  if (!run.external_run_id) return run;
  if (["done", "error", "canceled"].includes(run.status)) return run;

  const task = await getTask(supabase, run.external_run_id);
  if (!task) return run;

  const nextStatus = mapStatus(task.status);
  const patch: Record<string, unknown> = {
    status: nextStatus,
    live_view_url: task.liveUrl ?? run.live_view_url,
    last_heartbeat_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (nextStatus === "running" && !run.phase) patch.phase = "working";
  if (nextStatus === "done") {
    patch.phase = "finished";
    patch.result = { output: task.output ?? null };
    patch.expires_at = new Date().toISOString();
  }
  if (nextStatus === "error") {
    patch.error = task.error || "Task failed";
  }

  await supabase.from("long_runs").update(patch).eq("id", run.id);

  // Mirror the agent's reasoning steps into the event feed (the "thinking" view).
  const steps = Array.isArray(task.steps) ? task.steps : [];
  if (steps.length) {
    const { count } = await supabase
      .from("long_run_events")
      .select("id", { count: "exact", head: true })
      .eq("run_id", run.id)
      .eq("type", "thought");
    const already = count ?? 0;
    const fresh = steps.slice(already);
    if (fresh.length) {
      await supabase.from("long_run_events").insert(
        fresh.map((s, i) => ({
          run_id: run.id,
          type: "thought",
          title: s.nextGoal || s.evaluationPreviousGoal || `Step ${already + i + 1}`,
          detail: [s.evaluationPreviousGoal, s.url].filter(Boolean).join(" · ") || null,
        })),
      );
    }
  }

  if (nextStatus !== run.status) {
    const label =
      nextStatus === "done"
        ? "Task finished"
        : nextStatus === "error"
          ? "Task failed"
          : nextStatus === "canceled"
            ? "Task stopped"
            : nextStatus === "running"
              ? "Computer is working"
              : "Task queued";
    await addEvent(supabase, run.id, label, "status", task.output ?? null);
  }

  return { ...run, ...patch };
}

async function start(supabase: SupabaseClient, userId: string, payload: LongRunPayload) {
  const goal = (payload.goal ?? "").trim();
  if (!goal) return { status: 400, body: { error: "Empty goal" } };

  const { data: run, error } = await supabase
    .from("long_runs")
    .insert({
      user_id: userId,
      conversation_id: payload.conversation_id ?? null,
      goal,
      status: "queued",
      provider: "browser-use",
      status_text: "Starting the computer",
    })
    .select("*")
    .single();
  if (error) return { status: 500, body: { error: error.message } };

  try {
    const resp = await buFetch(supabase, "/tasks", {
      method: "POST",
      body: JSON.stringify({ task: goal }),
    });
    const data = (await resp.json().catch(() => ({}))) as Record<string, any>;
    if (!resp.ok || !data.id) {
      throw new Error((data.detail as string) || (data.error as string) || `Provider HTTP ${resp.status}`);
    }

    // Fetch once more to grab the live view URL as soon as it exists.
    const task: BuTask = (await getTask(supabase, data.id)) ?? { id: data.id as string };

    const { data: updated } = await supabase
      .from("long_runs")
      .update({
        status: mapStatus(task.status),
        phase: "working",
        external_run_id: data.id,
        live_view_url: task.liveUrl ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .select("*")
      .single();

    await addEvent(supabase, run.id, "Computer session started", "status");
    return { status: 200, body: { ok: true, run: updated ?? run } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to start task";
    await supabase
      .from("long_runs")
      .update({ status: "error", error: msg, updated_at: new Date().toISOString() })
      .eq("id", run.id);
    await addEvent(supabase, run.id, "Failed to start", "error", msg);
    return { status: 502, body: { error: msg } };
  }
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

async function stopTask(supabase: SupabaseClient, taskId: string) {
  const resp = await buFetch(supabase, `/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "stop" }),
  });
  return resp.ok;
}

export async function handleLongRun(payload: LongRunPayload | null) {
  const supabase = db();
  const user = await getUser(supabase, payload?.token);
  if (!user) return { status: 401, body: { error: "Sign in required" } };

  switch (payload?.action) {
    case "start":
      return start(supabase, user.id, payload);

    case "keepalive":
    case "status": {
      const run = await loadOwnedRun(supabase, user.id, payload.run_id);
      if (!run) return { status: 404, body: { error: "Unknown run" } };
      const synced = await syncRun(supabase, run);
      return { status: 200, body: { ok: true, run: synced } };
    }

    case "stop": {
      const run = await loadOwnedRun(supabase, user.id, payload.run_id);
      if (!run) return { status: 404, body: { error: "Unknown run" } };
      if (run.external_run_id) {
        try {
          await stopTask(supabase, run.external_run_id);
        } catch {
          /* still mark locally canceled */
        }
      }
      const { data: updated } = await supabase
        .from("long_runs")
        .update({
          status: "canceled",
          expires_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", run.id)
        .select("*")
        .single();
      await addEvent(supabase, run.id, "Task stopped by user", "status");
      return { status: 200, body: { ok: true, run: updated ?? run } };
    }

    default:
      return { status: 400, body: { error: "Unknown action" } };
  }
}
