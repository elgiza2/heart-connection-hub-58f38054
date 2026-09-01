/**
 * @doc Server-only entry core for the Dev Agent (/api/dev-agent).
 *
 * Actions:
 *  - start   : classify the request, create/reuse a project, create a run
 *  - step    : advance one bounded slice (the client polls this)
 *  - status  : read run + events + project without doing work
 *  - stop    : cancel a run
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { advanceDevRun, classify, wantsDeploy } from "./agentLoop";

export interface DevAgentPayload {
  action?: "start" | "step" | "status" | "stop";
  token?: string;
  prompt?: string;
  conversation_id?: string | null;
  message_id?: string | null;
  project_id?: string | null;
  run_id?: string;
}

export interface DevAgentResult {
  status: number;
  body: Record<string, unknown>;
}

function db(token?: string): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Megsy Supabase is not configured");
  return createClient(url, key, {
    auth: { persistSession: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });
}

async function currentUser(supabase: SupabaseClient, token?: string) {
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error || !data.user ? null : data.user;
}

async function loadRun(supabase: SupabaseClient, userId: string, runId?: string) {
  if (!runId) return null;
  const { data } = await supabase
    .from("dev_runs")
    .select("*")
    .eq("id", runId)
    .eq("user_id", userId)
    .maybeSingle();
  return data as Record<string, any> | null;
}

async function runState(supabase: SupabaseClient, run: Record<string, any>) {
  const [{ data: events }, { data: tasks }, { data: project }] = await Promise.all([
    supabase
      .from("dev_events")
      .select("type,title,payload,created_at")
      .eq("run_id", run.id)
      .order("created_at", { ascending: true })
      .limit(200),
    supabase
      .from("dev_tasks")
      .select("position,title,status")
      .eq("run_id", run.id)
      .order("position", { ascending: true }),
    run.project_id
      ? supabase
          .from("dev_projects")
          .select("id,name,preview_url,deploy_url,screenshot_url,repo_id,github_repo,head_commit,deployed_commit")
          .eq("id", run.project_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return { run, events: events ?? [], tasks: tasks ?? [], project: project ?? null };
}

export async function handleDevAgent(payload: DevAgentPayload | null): Promise<DevAgentResult> {
  const supabase = db(payload?.token);
  const user = await currentUser(supabase, payload?.token);
  if (!user) return { status: 401, body: { error: "Sign in required" } };

  switch (payload?.action) {
    case "start": {
      const prompt = (payload.prompt ?? "").trim();
      if (!prompt) return { status: 400, body: { error: "Empty prompt" } };

      const routed = await classify(payload.token!, prompt);
      const allowDeploy = routed.intent === "deploy" || wantsDeploy(prompt);

      // Reuse the project already attached to this conversation so edits keep
      // the same VM, repo and history instead of rebuilding from scratch.
      let projectId = payload.project_id ?? null;
      if (!projectId && payload.conversation_id) {
        const { data } = await supabase
          .from("dev_projects")
          .select("id")
          .eq("user_id", user.id)
          .eq("conversation_id", payload.conversation_id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        projectId = (data as { id?: string } | null)?.id ?? null;
      }
      if (!projectId || routed.intent === "create") {
        if (!projectId) {
          const { data, error } = await supabase
            .from("dev_projects")
            .insert({
              user_id: user.id,
              conversation_id: payload.conversation_id ?? null,
              name: routed.title,
              template: routed.githubUrl ? "github" : "vite-react18-ts",
              status: "active",
            })
            .select("id")
            .single();
          if (error) return { status: 500, body: { error: error.message } };
          projectId = (data as { id: string }).id;
        }
      }

      const { data: run, error: runErr } = await supabase
        .from("dev_runs")
        .insert({
          user_id: user.id,
          project_id: projectId,
          conversation_id: payload.conversation_id ?? null,
          message_id: payload.message_id ?? null,
          intent: routed.intent,
          prompt,
          status: "queued",
          allow_deploy: allowDeploy,
          metadata: routed.githubUrl ? { github_url: routed.githubUrl } : null,
        })
        .select("*")
        .single();
      if (runErr) return { status: 500, body: { error: runErr.message } };

      return {
        status: 200,
        body: {
          ok: true,
          run,
          intent: routed.intent,
          allow_deploy: allowDeploy,
          project_id: projectId,
        },
      };
    }

    case "step": {
      const run = await loadRun(supabase, user.id, payload.run_id);
      if (!run) return { status: 404, body: { error: "Unknown run" } };
      if (["done", "error", "canceled"].includes(run.status)) {
        return { status: 200, body: { ok: true, finished: true, ...(await runState(supabase, run)) } };
      }
      let finished = false;
      try {
        finished = await advanceDevRun(supabase, run as any, payload.token!);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await supabase
          .from("dev_runs")
          .update({ status: "error", error: msg.slice(0, 500), finished_at: new Date().toISOString() })
          .eq("id", run.id);
        await supabase.from("dev_events").insert({
          run_id: run.id,
          user_id: user.id,
          type: "error",
          title: msg.slice(0, 300),
        });
        finished = true;
      }
      const fresh = (await loadRun(supabase, user.id, run.id)) ?? run;
      return { status: 200, body: { ok: true, finished, ...(await runState(supabase, fresh)) } };
    }

    case "status": {
      const run = await loadRun(supabase, user.id, payload.run_id);
      if (!run) return { status: 404, body: { error: "Unknown run" } };
      return {
        status: 200,
        body: {
          ok: true,
          finished: ["done", "error", "canceled"].includes(run.status),
          ...(await runState(supabase, run)),
        },
      };
    }

    case "stop": {
      const run = await loadRun(supabase, user.id, payload.run_id);
      if (!run) return { status: 404, body: { error: "Unknown run" } };
      await supabase
        .from("dev_runs")
        .update({ status: "canceled", finished_at: new Date().toISOString() })
        .eq("id", run.id);
      return { status: 200, body: { ok: true } };
    }

    default:
      return { status: 400, body: { error: "Unknown action" } };
  }
}
