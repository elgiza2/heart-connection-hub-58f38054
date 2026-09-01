/**
 * @doc Server-only core for the Computer Agent (Megsy Computer).
 * Owns: key-pool selection with automatic failover, task creation/polling/stop
 * against the upstream computer provider, plus conversation memory.
 * The provider name is never exposed to the client — the UI only sees
 * "Megsy Computer".
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const API_BASE = process.env.MANUS_API_BASE || "https://api.manus.ai";

export type ComputerAction = "create" | "poll" | "stop" | "list";

export interface ComputerPayload {
  action?: ComputerAction;
  token?: string;
  prompt?: string;
  conversation_id?: string | null;
  message_id?: string | null;
  attachments?: string[];
  task_id?: string;
}

export interface ComputerResult {
  status: number;
  body: Record<string, unknown>;
}

interface KeyRow {
  id: string;
  api_key: string;
  status: string;
  failure_count: number | null;
  cooldown_until: string | null;
  last_used_at: string | null;
  priority: number | null;
}

function admin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase server credentials are not configured");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

async function authenticate(supabase: SupabaseClient, token?: string) {
  if (!token) return null;
  const { data } = await supabase.auth.getUser(token);
  return data?.user ?? null;
}

/** Active keys, least-recently-used first, skipping keys in cooldown. */
async function availableKeys(supabase: SupabaseClient): Promise<KeyRow[]> {
  const { data } = await supabase
    .from("manus_keys")
    .select("id,api_key,status,failure_count,cooldown_until,last_used_at,priority")
    .eq("status", "active");
  const now = Date.now();
  return ((data ?? []) as KeyRow[])
    .filter((k) => !k.cooldown_until || new Date(k.cooldown_until).getTime() <= now)
    .sort((a, b) => {
      const pa = a.priority ?? 0;
      const pb = b.priority ?? 0;
      if (pa !== pb) return pb - pa;
      const ta = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
      const tb = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
      return ta - tb;
    });
}

async function markFailure(
  supabase: SupabaseClient,
  key: KeyRow,
  status: number,
  message: string,
  retryAfterSec?: number,
) {
  const patch: Record<string, unknown> = {
    failure_count: (key.failure_count ?? 0) + 1,
    last_error: `${status}: ${message}`.slice(0, 500),
    updated_at: new Date().toISOString(),
  };
  if (status === 402 || status === 403) {
    patch.status = "exhausted";
  } else if (status === 429) {
    patch.cooldown_until = new Date(Date.now() + (retryAfterSec ?? 120) * 1000).toISOString();
  } else if (status === 401) {
    patch.status = "disabled";
  } else {
    patch.cooldown_until = new Date(Date.now() + 30_000).toISOString();
  }
  if (key.id === "env") return; // env-configured fallback key has no DB row
  await supabase.from("manus_keys").update(patch).eq("id", key.id);
}

interface UpstreamCall {
  path: string;
  method: "GET" | "POST";
  body?: unknown;
}

interface UpstreamOk {
  ok: true;
  data: any;
  key: KeyRow;
}
interface UpstreamFail {
  ok: false;
  status: number;
  message: string;
}

/** Runs one upstream call, rotating through the key pool on failure. */
async function callUpstream(
  supabase: SupabaseClient,
  call: UpstreamCall,
  preferKeyId?: string | null,
): Promise<UpstreamOk | UpstreamFail> {
  let keys = await availableKeys(supabase);
  if (preferKeyId) {
    const idx = keys.findIndex((k) => k.id === preferKeyId);
    if (idx > 0) keys = [keys[idx], ...keys.filter((_, i) => i !== idx)];
  }
  // Fallback: a single key configured as a server secret, used when the
  // database key pool is empty (e.g. fresh install).
  if (keys.length === 0 && process.env.MANUS_API_KEY) {
    keys = [
      {
        id: "env",
        api_key: process.env.MANUS_API_KEY,
        status: "active",
        failure_count: 0,
        cooldown_until: null,
        last_used_at: null,
        priority: 0,
      },
    ];
  }
  if (keys.length === 0) {
    return { ok: false, status: 503, message: "no_capacity" };
  }

  let last: UpstreamFail = { ok: false, status: 503, message: "no_capacity" };
  for (const key of keys) {
    try {
      const resp = await fetch(`${API_BASE}${call.path}`, {
        method: call.method,
        headers: {
          "Content-Type": "application/json",
          API_KEY: key.api_key,
          Authorization: `Bearer ${key.api_key}`,
        },
        body: call.body ? JSON.stringify(call.body) : undefined,
      });
      const text = await resp.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text };
      }
      if (resp.ok) {
        if (key.id !== "env") {
          await supabase
            .from("manus_keys")
            .update({ last_used_at: new Date().toISOString(), last_error: null })
            .eq("id", key.id);
        }
        return { ok: true, data, key };
      }
      const message = String(data?.error?.message || data?.message || data?.error || text || "").slice(0, 300);
      const retryAfter = Number(resp.headers.get("retry-after") || "") || undefined;
      await markFailure(supabase, key, resp.status, message, retryAfter);
      last = { ok: false, status: resp.status, message };
      if (resp.status === 400) return last; // bad request — rotating won't help
    } catch (err) {
      const message = err instanceof Error ? err.message : "network_error";
      await markFailure(supabase, key, 500, message);
      last = { ok: false, status: 502, message };
    }
  }
  return last;
}

/** Conversation memory injected at the top of every new task prompt. */
async function loadMemory(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string | null,
): Promise<string> {
  const q = supabase
    .from("computer_memory")
    .select("summary")
    .eq("user_id", userId)
    .limit(1);
  const { data } = conversationId
    ? await q.eq("conversation_id", conversationId)
    : await q.is("conversation_id", null);
  return (data?.[0]?.summary as string | undefined)?.trim() || "";
}

async function saveMemory(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string | null,
  summary: string,
) {
  await supabase.from("computer_memory").upsert(
    {
      user_id: userId,
      conversation_id: conversationId,
      summary: summary.slice(0, 8000),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,conversation_id" },
  );
}

function normalizeStatus(raw: unknown): string {
  const s = String(raw ?? "").toLowerCase();
  if (["finished", "completed", "success", "succeeded", "done"].includes(s)) return "done";
  if (["failed", "error", "canceled", "cancelled", "stopped"].includes(s)) return "failed";
  if (["pending", "queued", "created"].includes(s)) return "pending";
  return s ? "running" : "running";
}

/** Pulls step/file info out of a provider payload without leaking its shape. */
function extractProgress(data: any): {
  status: string;
  progress: string | null;
  resultText: string | null;
  files: { name: string; url: string; type?: string }[];
  events: { title: string; detail?: string; url?: string }[];
} {
  const status = normalizeStatus(data?.status ?? data?.task_status ?? data?.state);
  const rawEvents: any[] = Array.isArray(data?.events)
    ? data.events
    : Array.isArray(data?.steps)
      ? data.steps
      : Array.isArray(data?.messages)
        ? data.messages
        : [];
  const events = rawEvents
    .map((e) => ({
      title: String(e?.title || e?.type || e?.action || e?.tool || "Step").slice(0, 160),
      detail: typeof e?.content === "string" ? e.content.slice(0, 800) : undefined,
      url: typeof e?.url === "string" ? e.url : undefined,
    }))
    .slice(-50);

  const rawFiles: any[] = Array.isArray(data?.attachments)
    ? data.attachments
    : Array.isArray(data?.files)
      ? data.files
      : Array.isArray(data?.outputs)
        ? data.outputs
        : [];
  const files = rawFiles
    .filter((f) => f?.url || f?.file_url || f?.download_url)
    .map((f) => ({
      name: String(f?.name || f?.filename || "file"),
      url: String(f?.url || f?.file_url || f?.download_url),
      type: typeof f?.content_type === "string" ? f.content_type : undefined,
    }));

  const resultText =
    (typeof data?.result === "string" && data.result) ||
    (typeof data?.output === "string" && data.output) ||
    (typeof data?.summary === "string" && data.summary) ||
    (typeof data?.final_answer === "string" && data.final_answer) ||
    null;

  const progress = events.length ? events[events.length - 1].title : null;
  return { status, progress, resultText, files, events };
}

export async function handleComputerAgent(payload: ComputerPayload | null): Promise<ComputerResult> {
  if (!payload?.action) return { status: 400, body: { error: "Missing action" } };
  const supabase = admin();
  const user = await authenticate(supabase, payload.token);
  if (!user) return { status: 401, body: { error: "unauthorized" } };

  switch (payload.action) {
    case "create": {
      const prompt = (payload.prompt ?? "").trim();
      if (!prompt) return { status: 400, body: { error: "Missing prompt" } };
      const conversationId = payload.conversation_id ?? null;
      const memory = await loadMemory(supabase, user.id, conversationId);

      const { data: inserted, error: insErr } = await supabase
        .from("computer_tasks")
        .insert({
          user_id: user.id,
          conversation_id: conversationId,
          message_id: payload.message_id ?? null,
          prompt,
          status: "pending",
        })
        .select("id")
        .single();
      if (insErr || !inserted) {
        return { status: 500, body: { error: insErr?.message || "insert_failed" } };
      }
      const taskId = inserted.id as string;

      // The upstream agent has no clock and no reporting contract of its own,
      // so both are prepended to every task.
      const nowIso = new Date().toISOString().slice(0, 10);
      const preamble =
        `Today's date is ${nowIso} (UTC). Treat it as authoritative and never present ` +
        `older material as today's news.\n` +
        `When you finish, return a complete self-contained report of the findings ` +
        `(facts, numbers, dates, sources) as the final answer — never leave the results ` +
        `only inside your intermediate steps.\n\n`;
      const fullPrompt = memory
        ? `${preamble}Context from earlier in this conversation:\n${memory}\n\n---\nTask:\n${prompt}`
        : `${preamble}Task:\n${prompt}`;

      const res = await callUpstream(supabase, {
        path: "/v1/tasks",
        method: "POST",
        body: {
          prompt: fullPrompt,
          mode: "quality",
          attachments: payload.attachments?.length ? payload.attachments : undefined,
        },
      });

      if (!res.ok) {
        const fail = res as UpstreamFail;
        const message =
          fail.status === 503
            ? "no_capacity"
            : fail.status === 429
              ? "rate_limited"
              : "provider_error";

        await supabase
          .from("computer_tasks")
          .update({ status: "failed", error: message, updated_at: new Date().toISOString() })
          .eq("id", taskId);
        return { status: 200, body: { task_id: taskId, status: "failed", error: message } };
      }

      const providerId = String(
        res.data?.task_id ?? res.data?.id ?? res.data?.data?.task_id ?? "",
      );
      await supabase
        .from("computer_tasks")
        .update({
          provider_task_id: providerId || null,
          key_id: res.key.id,
          status: "running",
          updated_at: new Date().toISOString(),
        })
        .eq("id", taskId);

      return { status: 200, body: { task_id: taskId, status: "running" } };
    }

    case "poll": {
      if (!payload.task_id) return { status: 400, body: { error: "Missing task_id" } };
      const { data: task } = await supabase
        .from("computer_tasks")
        .select("*")
        .eq("id", payload.task_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!task) return { status: 404, body: { error: "not_found" } };

      if (task.status === "done" || task.status === "failed" || !task.provider_task_id) {
        return { status: 200, body: { task: publicTask(task), events: await listEvents(supabase, task.id) } };
      }

      const res = await callUpstream(
        supabase,
        { path: `/v1/tasks/${task.provider_task_id}`, method: "GET" },
        task.key_id,
      );
      if (!res.ok) {
        return { status: 200, body: { task: publicTask(task), events: await listEvents(supabase, task.id) } };
      }

      const info = extractProgress(res.data);
      // Persist any new steps (dedupe on title+index count).
      const existing = await listEvents(supabase, task.id);
      if (info.events.length > existing.length) {
        const fresh = info.events.slice(existing.length).map((e) => ({
          task_id: task.id,
          user_id: user.id,
          kind: "step",
          title: e.title,
          detail: e.detail ?? null,
          url: e.url ?? null,
        }));
        if (fresh.length) await supabase.from("computer_events").insert(fresh);
      }

      const patch = {
        status: info.status,
        progress: info.progress,
        result_text: info.resultText ?? task.result_text,
        files: info.files.length ? info.files : task.files,
        updated_at: new Date().toISOString(),
      };
      await supabase.from("computer_tasks").update(patch).eq("id", task.id);

      if (info.status === "done") {
        const memory = await loadMemory(supabase, user.id, task.conversation_id);
        const line = `- ${task.prompt.slice(0, 200)} → ${(info.resultText ?? "completed").slice(0, 400)}`;
        await saveMemory(supabase, user.id, task.conversation_id, `${memory}\n${line}`.trim());
      }

      return {
        status: 200,
        body: {
          task: publicTask({ ...task, ...patch }),
          events: await listEvents(supabase, task.id),
        },
      };
    }

    case "stop": {
      if (!payload.task_id) return { status: 400, body: { error: "Missing task_id" } };
      const { data: task } = await supabase
        .from("computer_tasks")
        .select("id,provider_task_id,key_id")
        .eq("id", payload.task_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!task) return { status: 404, body: { error: "not_found" } };
      if (task.provider_task_id) {
        await callUpstream(
          supabase,
          { path: `/v1/tasks/${task.provider_task_id}/stop`, method: "POST", body: {} },
          task.key_id,
        );
      }
      await supabase
        .from("computer_tasks")
        .update({ status: "failed", error: "stopped", updated_at: new Date().toISOString() })
        .eq("id", task.id);
      return { status: 200, body: { ok: true } };
    }

    default:
      return { status: 400, body: { error: "Unknown action" } };
  }
}

function publicTask(task: any) {
  return {
    id: task.id,
    status: task.status,
    progress: task.progress ?? null,
    result_text: task.result_text ?? null,
    files: Array.isArray(task.files) ? task.files : [],
    error: task.error ?? null,
    prompt: task.prompt,
  };
}

async function listEvents(supabase: SupabaseClient, taskId: string) {
  const { data } = await supabase
    .from("computer_events")
    .select("id,title,detail,url,created_at")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });
  return data ?? [];
}
