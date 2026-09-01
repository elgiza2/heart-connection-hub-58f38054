/**
 * @doc Generic executor behind the 2026 tool catalog.
 *
 * A catalog entry is only an address; this file is what actually performs work.
 * Every entry resolves to one of a few real executors, so adding a provider to
 * the catalog needs no new runtime code:
 *
 *   http    -> authenticated REST/GraphQL call (key pulled from the user's
 *              connected services when the tool needs one)
 *   web     -> live search / page read through the reader proxy
 *   code    -> sandboxed JS in a throwaway Worker
 *   model   -> a model call (writing, reasoning, classification, extraction)
 *   file    -> the run workspace the user downloads at the end
 *   data    -> workspace/memory/human-in-the-loop primitives
 *   browser -> handed to the cloud browser (a real logged-in session)
 *
 * Every call is written to `agent_tool_invocations` so a run is auditable.
 */
import { supabase } from "@/integrations/supabase/client";
import { askModel } from "@/lib/agentkernel/llm";
import {
  fetchUrl,
  readFile,
  runCode,
  writeFile,
  type ToolContext,
  type ToolResult,
} from "@/lib/agentkernel/tools";
import { getCatalogTool, renderTools, searchCatalog, CATALOG_SIZE } from "./catalog";

export interface RunToolOptions {
  ctx: ToolContext;
  userId?: string | null;
  runId?: string | null;
  agentSlug?: string | null;
}

const MAX_OUT = 8_000;
const clip = (s: string) => (s.length > MAX_OUT ? `${s.slice(0, MAX_OUT)}\n…[truncated]` : s);

/** Looks up a stored key for a service (Settings > Connections). */
async function serviceKey(service: string): Promise<string | null> {
  const { data } = await supabase
    .from("api_keys")
    .select("api_key")
    .eq("service", service)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return (data as { api_key?: string } | null)?.api_key?.trim() || null;
}

async function httpCall(
  base: string,
  args: Record<string, any>,
  key: string | null,
): Promise<ToolResult> {
  const url = String(args.url ?? "") || `${base.replace(/\/$/, "")}/${String(args.path ?? "").replace(/^\//, "")}`;
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, output: "This tool needs an absolute url or a path plus its service base." };
  }
  const method = String(args.method ?? (args.body ? "POST" : "GET")).toUpperCase();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(args.headers && typeof args.headers === "object" ? args.headers : {}),
  };
  if (key && !headers.Authorization) headers.Authorization = `Bearer ${key}`;
  if (args.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  try {
    const resp = await fetch(url, {
      method,
      headers,
      body: args.body
        ? typeof args.body === "string"
          ? args.body
          : JSON.stringify(args.body)
        : undefined,
    });
    const text = await resp.text();
    return { ok: resp.ok, output: clip(`HTTP ${resp.status}\n${text}`) };
  } catch (error) {
    // CORS or network wall: the browser path is the fallback, not a dead end.
    return {
      ok: false,
      output: `Direct call failed (${
        error instanceof Error ? error.message : "network"
      }). Retry the same goal with the cloud browser or a server-side route.`,
    };
  }
}

async function webCall(op: string, args: Record<string, any>): Promise<ToolResult> {
  const query = String(args.query ?? args.q ?? args.topic ?? "").trim();
  if (op === "read_page" || args.url) return fetchUrl(String(args.url ?? query));
  if (!query) return { ok: false, output: "A query is required." };
  const engine =
    op === "news"
      ? `https://news.google.com/rss/search?q=${encodeURIComponent(query)}`
      : `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  return fetchUrl(engine);
}

async function modelCall(
  service: string,
  op: string,
  args: Record<string, any>,
): Promise<ToolResult> {
  const brief = String(args.prompt ?? args.text ?? args.goal ?? "").trim();
  if (!brief) return { ok: false, output: "A prompt is required." };
  const out = await askModel(
    `You are the ${service} tool performing the "${op}" operation. Return only the finished result, in the user's language, with no preamble.`,
    [{ role: "user", content: brief }],
  );
  return out
    ? { ok: true, output: clip(out) }
    : { ok: false, output: "The model returned nothing — retry with a shorter prompt." };
}

async function dataCall(
  service: string,
  op: string,
  args: Record<string, any>,
  opts: RunToolOptions,
): Promise<ToolResult> {
  if (service === "memory" && op === "remember" && opts.userId) {
    const content = String(args.content ?? args.value ?? "");
    await supabase.from("agent_memory").insert({
      user_id: opts.userId,
      kind: "user_fact",
      key: String(args.key ?? (content.slice(0, 60) || "fact")),
      value: content,
      source_run_id: opts.runId ?? null,
    } as never);
    return { ok: true, output: "Saved to long-term memory." };
  }
  if (service === "memory" && (op === "recall" || op === "profile") && opts.userId) {
    const { data } = await supabase
      .from("agent_memory")
      .select("key, value")
      .eq("user_id", opts.userId)
      .order("updated_at", { ascending: false })
      .limit(20);
    const rows = (data ?? []) as { key: string; value: string }[];
    return {
      ok: true,
      output: rows.map((r) => `- ${r.key}: ${r.value}`).join("\n") || "No memories yet.",
    };
  }

  if (service === "human") {
    return {
      ok: true,
      output: "HUMAN_REQUIRED: stop this step and use the ask_user tool with a single clear question.",
    };
  }
  return {
    ok: true,
    output: `Handle "${service}.${op}" with sandbox.run_js (compute), sql.query (data) or files.write (output) — those executors are available now.`,
  };
}

/** Runs one catalog tool by id. */
export async function runCatalogTool(
  id: string,
  args: Record<string, any>,
  opts: RunToolOptions,
): Promise<ToolResult> {
  const tool = getCatalogTool(id);
  if (!tool) {
    return {
      ok: false,
      output: `Unknown tool "${id}". Closest matches:\n${renderTools(searchCatalog(id, 8))}`,
    };
  }

  const started = Date.now();
  let result: ToolResult;

  if (tool.kind === "code") {
    result = await runCode(String(args.code ?? args.script ?? ""));
  } else if (tool.kind === "web") {
    result = await webCall(tool.op, args);
  } else if (tool.kind === "model") {
    result = await modelCall(tool.service, tool.op, args);
  } else if (tool.kind === "file") {
    result =
      tool.op === "read" || tool.op.startsWith("read_")
        ? readFile(opts.ctx, String(args.path ?? ""))
        : writeFile(opts.ctx, String(args.path ?? "output.md"), String(args.content ?? ""));
  } else if (tool.kind === "http") {
    const key = tool.auth === "none" ? null : await serviceKey(tool.service);
    if (tool.auth !== "none" && !key) {
      result = {
        ok: false,
        output: `${tool.serviceName} is not connected yet. Either do the same job through the cloud browser with login_identity, or ask the user to connect it (emit <CONNECT type="api" app="${tool.service}" />).`,
      };
    } else {
      result = await httpCall(tool.base, args, key);
    }
  } else if (tool.kind === "browser") {
    result = {
      ok: true,
      output: `BROWSER_STEP: open ${tool.base || String(args.url ?? tool.serviceName)} and perform "${tool.op}". Use login_identity for any sign-in and check_mail for verification codes.`,
    };
  } else {
    result = await dataCall(tool.service, tool.op, args, opts);
  }

  if (opts.userId) {
    // Fire and forget: telemetry must never break the run.
    void supabase.from("agent_tool_invocations").insert({
      user_id: opts.userId,
      session_id: opts.runId ?? null,
      agent_slug: opts.agentSlug ?? null,
      tool_key: tool.id,
      input: args as never,
      output: { output: result.output.slice(0, 4_000) } as never,
      status: result.ok ? "ok" : "error",
      error: result.ok ? null : result.output.slice(0, 500),
      latency_ms: Date.now() - started,
    } as never);
  }

  return result;
}

/** `tool_search` implementation: plain-language need -> shortlist of tool ids. */
export function searchToolsFor(need: string, limit = 12): ToolResult {
  const hits = searchCatalog(need, limit);
  return {
    ok: true,
    output: `${hits.length} of ${CATALOG_SIZE} tools match "${need}":\n${renderTools(hits)}`,
  };
}
