/**
 * The agentic executor: the part that makes the kernel a *full* worker instead
 * of a browsing/research bot.
 *
 * It is a ReAct-style loop that runs server-side across cron ticks. Every
 * iteration the model picks ONE tool from the catalog below (coding, MCP,
 * integrations, browser delegation, artifacts, memory, asking the user) and the
 * observation is persisted, so a task can span hours and many ticks without
 * losing its train of thought.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { askJson } from "./llm.ts";
import { readFile, webSearch, writeFile } from "./tools.ts";

export type AgentToolName =
  | "web_search"
  | "run_code"
  | "mcp_call"
  | "list_mcp_tools"
  | "write_file"
  | "read_file"
  | "browser_task"
  | "list_integrations"
  | "call_registered_tool"
  | "remember"
  | "ask_user"
  | "finish";

export interface AgentAction {
  thought: string;
  tool: AgentToolName;
  input: Record<string, unknown>;
  say?: string | null;
}

export interface ToolOutcome {
  observation: string;
  artifact?: { name: string; url: string } | null;
}

const TOOL_CATALOG = [
  'web_search {"query":"..."} — look something up on the public web.',
  'run_code {"language":"javascript","code":"..."} — run real JavaScript/TypeScript in a sandbox and read stdout. Use it for data work, parsing, math, generating files, calling public HTTP APIs. End with console.log of the result.',
  'list_mcp_tools {} — list the tools exposed by the user\'s connected MCP servers.',
  'mcp_call {"server":"name","tool":"tool_name","arguments":{}} — call one of those MCP tools (integrations live here).',
  'write_file {"name":"report.md","content":"..."} — save an artifact the user can download. Use it to deliver code, docs, CSVs.',
  'read_file {"path":"..."} — read back an artifact you created.',
  'browser_task {"task":"..."} — hand a browser job (login, forms, clicking, scraping a UI) to the cloud browser.',
  'list_integrations {} — list the registered app/integration tools available to this user (media, documents, data, external APIs).',
  'call_registered_tool {"tool_key":"...","input":{}} — execute one of those registered tools for real.',
  'remember {"key":"...","value":"..."} — store a durable fact for future tasks.',
  'ask_user {"question":"...","sensitive":true|false} — STOP and ask. Required for CAPTCHA, OTP/2FA, credentials, payments, irreversible actions, or a genuinely ambiguous goal.',
  'finish {"summary":"what you actually accomplished, with evidence"} — only when the goal is really done.',
].join("\n");

const SYSTEM = [
  "You are a senior autonomous engineer/operator working on ONE task for a user.",
  "You act like a careful human: you use real tools, verify your own output, and never pretend something is done.",
  "You are NOT limited to research: you write and run code, wire up integrations through MCP, produce files, and drive a browser when a UI is involved.",
  "",
  "Available tools (JSON input each):",
  TOOL_CATALOG,
  "",
  'Reply with JSON only: {"thought":"one short sentence","say":"one short sentence for the user, their language","tool":"<tool>","input":{...}}',
  "Rules:",
  "- One tool per reply. Look at the observations already collected and never repeat an action that produced nothing new; change approach instead.",
  "- Prefer run_code over guessing. Verify results (re-read the file, re-run the check) before you call finish.",
  "- Never invent tool output, URLs or credentials. If you need something only the user has, call ask_user.",
].join("\n");

/** Asks the model for the next single action, given the transcript so far. */
export async function decideNextAction(
  supabase: SupabaseClient,
  args: {
    goal: string;
    memory: string;
    plan: string[];
    transcript: string[];
    extra?: string | null;
  },
): Promise<AgentAction | null> {
  const user = [
    `Task: ${args.goal}`,
    args.plan.length ? `Your plan:\n${args.plan.map((s, i) => `${i + 1}. ${s}`).join("\n")}` : "",
    args.memory,
    args.transcript.length
      ? `What has happened so far (oldest first):\n${args.transcript.slice(-40).join("\n")}`
      : "Nothing has been done yet.",
    args.extra ?? "",
    "What is the single next action?",
  ]
    .filter(Boolean)
    .join("\n\n");

  const parsed = await askJson<AgentAction>(supabase, SYSTEM, user);
  if (!parsed || typeof parsed.tool !== "string") return null;
  return {
    thought: String(parsed.thought ?? "").slice(0, 400),
    say: parsed.say ? String(parsed.say).slice(0, 240) : null,
    tool: parsed.tool as AgentToolName,
    input: (parsed.input && typeof parsed.input === "object" ? parsed.input : {}) as Record<
      string,
      unknown
    >,
  };
}

/* ------------------------------------------------------------------ run_code */

/**
 * Executes model-written JavaScript in an isolated Worker with no permissions
 * (no network, no env, no filesystem), capturing console output.
 */
export async function runCode(code: string, timeoutMs = 60_000): Promise<string> {
  const source = `
    const chunks = [];
    const write = (...parts) => chunks.push(parts.map((p) => {
      try { return typeof p === "string" ? p : JSON.stringify(p); } catch { return String(p); }
    }).join(" "));
    console.log = write; console.info = write; console.warn = write; console.error = write;
    (async () => {
      try {
        const result = await (async () => { ${code}\n })();
        if (result !== undefined) write(result);
        self.postMessage({ ok: true, out: chunks.join("\\n") });
      } catch (error) {
        self.postMessage({ ok: false, out: chunks.join("\\n"), error: String(error && error.message || error) });
      }
    })();
  `;
  const url = URL.createObjectURL(new Blob([source], { type: "application/javascript" }));
  let worker: Worker | null = null;
  try {
    worker = new Worker(url, {
      type: "module",
      // deno-lint-ignore no-explicit-any
      deno: { permissions: "none" } as any,
    } as WorkerOptions);
  } catch (error) {
    URL.revokeObjectURL(url);
    return `sandbox unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }

  const activeWorker = worker;
  try {
    return await new Promise<string>((resolve) => {
      const done = (text: string) => resolve(text.slice(0, 6000) || "(no output)");
      const timer = setTimeout(() => done("timed out before producing output"), timeoutMs);
      activeWorker.onmessage = (event: MessageEvent) => {
        clearTimeout(timer);
        const data = event.data as { ok?: boolean; out?: string; error?: string };
        done(data?.ok ? String(data.out ?? "") : `error: ${data?.error ?? "unknown"}\n${data?.out ?? ""}`);
      };
      activeWorker.onerror = (event: ErrorEvent) => {
        clearTimeout(timer);
        done(`error: ${event.message}`);
      };
    });
  } finally {
    activeWorker.terminate();
    URL.revokeObjectURL(url);
  }
}

/* ----------------------------------------------------------------------- MCP */

interface McpRow {
  id: string;
  name: string;
  url: string;
  auth_headers: Record<string, string> | null;
  tools: unknown;
  tool_names: string[] | null;
  enabled: boolean;
}

async function mcpServers(supabase: SupabaseClient, userId: string): Promise<McpRow[]> {
  const { data } = await supabase
    .from("mcp_connections")
    .select("id,name,url,auth_headers,tools,tool_names,enabled")
    .eq("user_id", userId)
    .eq("enabled", true);
  return (data ?? []) as McpRow[];
}

export async function listMcpTools(supabase: SupabaseClient, userId: string): Promise<string> {
  const servers = await mcpServers(supabase, userId);
  if (!servers.length) return "No MCP servers are connected for this user.";
  return servers
    .map((server) => {
      const names = Array.isArray(server.tool_names) && server.tool_names.length
        ? server.tool_names
        : Array.isArray(server.tools)
          ? (server.tools as { name?: string }[]).map((tool) => tool?.name ?? "")
          : [];
      return `- ${server.name}: ${names.filter(Boolean).slice(0, 40).join(", ") || "(no tools cached)"}`;
    })
    .join("\n");
}

/** Streamable-HTTP JSON-RPC call against a connected MCP server. */
export async function callMcpTool(
  supabase: SupabaseClient,
  userId: string,
  args: { server: string; tool: string; arguments?: Record<string, unknown> },
): Promise<string> {
  const servers = await mcpServers(supabase, userId);
  const target =
    servers.find((server) => server.name?.toLowerCase() === String(args.server).toLowerCase()) ??
    (servers.length === 1 ? servers[0] : null);
  if (!target) return `Unknown MCP server "${args.server}". Call list_mcp_tools first.`;

  try {
    const response = await fetch(target.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(target.auth_headers ?? {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method: "tools/call",
        params: { name: args.tool, arguments: args.arguments ?? {} },
      }),
    });
    const text = await response.text();
    if (!response.ok) return `MCP ${target.name} HTTP ${response.status}: ${text.slice(0, 500)}`;
    const payload = text.includes("data:")
      ? text
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("")
      : text;
    const parsed = JSON.parse(payload) as {
      result?: { content?: { type?: string; text?: string }[]; isError?: boolean };
      error?: { message?: string };
    };
    if (parsed.error) return `MCP error: ${parsed.error.message ?? "unknown"}`;
    const content = (parsed.result?.content ?? [])
      .map((part) => part?.text ?? "")
      .filter(Boolean)
      .join("\n");
    try {
      await supabase.from("mcp_call_log").insert({
        connection_id: target.id,
        user_id: userId,
        tool_name: args.tool,
        arguments: args.arguments ?? {},
        status: parsed.result?.isError ? "error" : "ok",
      });
    } catch {
      /* logging is best-effort */
    }
    return (content || payload).slice(0, 6000);
  } catch (error) {
    return `MCP call failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/* ------------------------------------------------- registered tools registry */

interface RegistryRow {
  tool_key: string;
  edge_function: string | null;
  description: string | null;
  category: string | null;
  is_active: boolean | null;
  input_schema: unknown;
}

async function registryRows(supabase: SupabaseClient): Promise<RegistryRow[]> {
  const { data } = await supabase
    .from("agent_tools_registry")
    .select("tool_key,edge_function,description,category,is_active,input_schema")
    .eq("is_active", true)
    .limit(120);
  return (data ?? []) as RegistryRow[];
}

/** The catalog the model reads before it decides to use an integration. */
export async function listRegisteredTools(supabase: SupabaseClient): Promise<string> {
  const rows = await registryRows(supabase);
  if (!rows.length) return "No registered integration tools are available.";
  return rows
    .map((row) => {
      const schema = row.input_schema && typeof row.input_schema === "object"
        ? Object.keys(row.input_schema as Record<string, unknown>).slice(0, 10).join(", ")
        : "";
      return `- ${row.tool_key}${row.category ? ` [${row.category}]` : ""}: ${
        row.description ?? "no description"
      }${schema ? ` (input: ${schema})` : ""}`;
    })
    .join("\n")
    .slice(0, 6000);
}

/**
 * Executes a registry-declared tool through its own edge function, using the
 * service role of this worker. The tool must exist and be enabled — arbitrary
 * function names from the model are never invoked.
 */
export async function callRegisteredTool(
  supabase: SupabaseClient,
  userId: string,
  args: { toolKey: string; payload: Record<string, unknown> },
): Promise<string> {
  const rows = await registryRows(supabase);
  const target = rows.find((row) => row.tool_key === args.toolKey);
  if (!target) return `Unknown tool "${args.toolKey}". Call list_integrations first.`;
  const fn = String(target.edge_function ?? "anything-api").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!fn) return `Tool "${args.toolKey}" has no runnable endpoint.`;

  const base = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !key) return "Tool runtime is not configured.";
  const started = Date.now();
  try {
    const response = await fetch(`${base}/functions/v1/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, apikey: key },
      body: JSON.stringify({ tool_key: args.toolKey, user_id: userId, input: args.payload }),
    });
    const text = (await response.text()).slice(0, 6000);
    await supabase
      .from("agent_tool_invocations")
      .insert({
        user_id: userId,
        tool_key: args.toolKey,
        input: args.payload,
        output: { raw: text.slice(0, 2000) },
        status: response.ok ? "ok" : "error",
        latency_ms: Date.now() - started,
      })
      .then(() => null, () => null);
    return response.ok ? text || "(no output)" : `tool failed HTTP ${response.status}: ${text}`;
  } catch (error) {
    return `tool failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/* ------------------------------------------------------------------- runTool */

/**
 * Runs one tool and returns what the agent gets to see next tick.
 * `browser_task`, `ask_user` and `finish` are control-flow tools handled by the
 * kernel, not here.
 */
export async function runTool(
  supabase: SupabaseClient,
  ctx: { runId: string; userId: string },
  action: AgentAction,
): Promise<ToolOutcome> {
  const input = action.input ?? {};
  switch (action.tool) {
    case "web_search":
      return { observation: (await webSearch(supabase, String(input.query ?? ""))) || "no results" };

    case "run_code": {
      const code = String(input.code ?? "");
      if (!code.trim()) return { observation: "no code provided" };
      return { observation: await runCode(code) };
    }

    case "list_mcp_tools":
      return { observation: await listMcpTools(supabase, ctx.userId) };

    case "list_integrations":
      return { observation: await listRegisteredTools(supabase) };

    case "call_registered_tool":
      return {
        observation: await callRegisteredTool(supabase, ctx.userId, {
          toolKey: String(input.tool_key ?? ""),
          payload: (input.input as Record<string, unknown>) ?? {},
        }),
      };

    case "mcp_call":
      return {
        observation: await callMcpTool(supabase, ctx.userId, {
          server: String(input.server ?? ""),
          tool: String(input.tool ?? ""),
          arguments: (input.arguments as Record<string, unknown>) ?? {},
        }),
      };

    case "write_file": {
      const artifact = await writeFile(
        supabase,
        ctx.runId,
        String(input.name ?? "artifact.txt"),
        String(input.content ?? ""),
      );
      return artifact
        ? { observation: `saved ${artifact.name} -> ${artifact.url}`, artifact }
        : { observation: "could not save the file" };
    }

    case "read_file": {
      const path = String(input.path ?? "");
      const ownedPrefix = `agent-runs/${ctx.runId}/`;
      if (!path.startsWith(ownedPrefix)) {
        return { observation: "رفضت قراءة ملف خارج مساحة هذه المهمة" };
      }
      const text = await readFile(supabase, path);
      return { observation: text ? text.slice(0, 6000) : "file not found or empty" };
    }

    default:
      return { observation: `unsupported tool ${action.tool}` };
  }
}
