/**
 * Real activity events.
 *
 * Every meaningful operation the kernel performs writes ONE structured row here
 * at the moment it happens. The chat UI renders these rows verbatim — it never
 * invents, rotates or times out a status. There is no synthetic activity in this
 * file: `summary` is always derived from the real tool and its real arguments.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type AgentEventType =
  | "TASK_STARTED"
  | "PLANNING_STARTED"
  | "PLAN_UPDATED"
  | "TOOL_STARTED"
  | "TOOL_PROGRESS"
  | "TOOL_COMPLETED"
  | "TOOL_FAILED"
  | "OBSERVATION_STARTED"
  | "RECOVERY_STARTED"
  | "REPLANNING_STARTED"
  | "VERIFICATION_STARTED"
  | "VERIFICATION_PASSED"
  | "VERIFICATION_FAILED"
  | "WAITING_FOR_USER"
  | "TASK_RESUMED"
  | "TASK_CHECKPOINTED"
  | "TASK_COMPLETED"
  | "TASK_FAILED"
  | "TASK_CANCELLED";

/** How a failure must be handled. Drives retry vs. re-strategy vs. stop. */
export type FailureClass =
  | "transient"
  | "recoverable"
  | "tool_failure"
  | "logical"
  | "authorization"
  | "human_required"
  | "unsafe"
  | "terminal";

export interface ActivityEvent {
  event_type: AgentEventType;
  /** Real tool key currently executing, e.g. browser | code | files | mcp | search. */
  tool?: string | null;
  /** Raw action identifier (the kernel tool name). */
  action?: string | null;
  status?: string | null;
  /** Human sentence describing the real current operation. */
  summary: string;
  /** Only set when a real, measurable fraction exists. Never time-based. */
  progress?: number | null;
  step_id?: string | null;
  metadata?: Record<string, unknown> | null;
  detail?: string | null;
  /** Legacy `type` column value kept for the existing trace UI. */
  legacyType?: string;
}

const SECRETY = /(password|passwd|secret|token|api[_-]?key|authorization|bearer|cookie|otp|credential)/i;

/** Removes anything that looks like a credential before it is persisted. */
export function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 4) return "…";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 600 ? `${value.slice(0, 600)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redactDeep(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRETY.test(key) ? "[redacted]" : redactDeep(val, depth + 1);
    }
    return out;
  }
  return String(value);
}

/** Maps a kernel tool name onto the icon family the chat already renders. */
export function toolFamily(tool?: string | null): string {
  switch (tool) {
    case "browser_task":
      return "browser";
    case "run_code":
      return "code";
    case "write_file":
    case "read_file":
      return "files";
    case "mcp_call":
    case "list_mcp_tools":
      return "mcp";
    case "web_search":
      return "search";
    case "remember":
      return "memory";
    case "ask_user":
      return "question";
    case "call_registered_tool":
      return "integration";
    default:
      return tool ? String(tool) : "agent";
  }
}

function short(value: unknown, max = 120): string {
  const text = typeof value === "string" ? value : value === undefined ? "" : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Builds the user-facing sentence from the REAL action. No fixed message list:
 * the concrete target (url, file, query, server, tool) is always part of it.
 */
export function describeAction(tool: string, input: Record<string, unknown>): string {
  const i = input ?? {};
  switch (tool) {
    case "web_search":
      return `Searching the web for "${short(i.query, 80)}"`;
    case "run_code":
      return `Running code in the sandbox (${String(i.language ?? "javascript")})`;
    case "list_mcp_tools":
      return "Listing the tools of the connected MCP servers";
    case "mcp_call":
      return `Calling ${short(i.tool, 60)} on the MCP server ${short(i.server, 40)}`;
    case "call_registered_tool":
      return `Executing the ${short(i.tool_key, 60)} integration`;
    case "write_file":
      return `Writing the file ${short(i.name, 80)}`;
    case "read_file":
      return `Reading back ${short(i.path, 80)}`;
    case "browser_task":
      return `Working in the browser: ${short(i.task, 100)}`;
    case "remember":
      return `Saving "${short(i.key, 60)}" for future tasks`;
    case "ask_user":
      return `Waiting for your answer: ${short(i.question, 100)}`;
    case "finish":
      return "Verifying the result against the objective";
    default:
      return `Executing ${tool}`;
  }
}

/** Classifies a raw failure text so the kernel knows how to react. */
export function classifyFailure(text: string): FailureClass {
  const t = (text || "").toLowerCase();
  if (/timed? ?out|timeout|econnreset|network|fetch failed|temporar|503|502|504|rate limit|429/.test(t)) {
    return "transient";
  }
  if (/captcha|2fa|otp|verification code|human/.test(t)) return "human_required";
  if (/401|403|unauthor|forbidden|invalid api key|permission denied|not signed in/.test(t)) {
    return "authorization";
  }
  if (/refused|blocked for safety|unsafe|destructive/.test(t)) return "unsafe";
  if (/selector|element not found|not visible|unexpected page|no such element|404|not found/.test(t)) {
    return "recoverable";
  }
  if (/sandbox unavailable|tool failed|unsupported tool|mcp call failed|http 5\d\d/.test(t)) {
    return "tool_failure";
  }
  if (/no results|empty|nothing/.test(t)) return "logical";
  return "recoverable";
}

const LEGACY_BY_TYPE: Record<AgentEventType, string> = {
  TASK_STARTED: "status",
  PLANNING_STARTED: "status",
  PLAN_UPDATED: "plan",
  TOOL_STARTED: "act",
  TOOL_PROGRESS: "log",
  TOOL_COMPLETED: "observation",
  TOOL_FAILED: "observation",
  OBSERVATION_STARTED: "observation",
  RECOVERY_STARTED: "log",
  REPLANNING_STARTED: "plan",
  VERIFICATION_STARTED: "status",
  VERIFICATION_PASSED: "review",
  VERIFICATION_FAILED: "review",
  WAITING_FOR_USER: "approval",
  TASK_RESUMED: "status",
  TASK_CHECKPOINTED: "log",
  TASK_COMPLETED: "status",
  TASK_FAILED: "error",
  TASK_CANCELLED: "status",
};

/**
 * Persists one real activity event and mirrors its sentence onto the run row so
 * a reconnecting client sees the current operation immediately.
 */
export async function emitActivity(
  supabase: SupabaseClient,
  runId: string,
  event: ActivityEvent,
): Promise<void> {
  const summary = String(event.summary ?? "").slice(0, 400);
  const row = {
    run_id: runId,
    type: event.legacyType ?? LEGACY_BY_TYPE[event.event_type] ?? "log",
    title: summary,
    detail: event.detail ? String(event.detail).slice(0, 8000) : null,
    event_type: event.event_type,
    step_id: event.step_id ?? null,
    tool: event.tool ? toolFamily(event.tool) : null,
    action: event.action ?? null,
    status: event.status ?? null,
    summary,
    progress: typeof event.progress === "number" ? event.progress : null,
    metadata: (event.metadata ? redactDeep(event.metadata) : null) as Record<string, unknown> | null,
  };
  await supabase.from("long_run_events").insert(row);

  const patch: Record<string, unknown> = {
    status_text: summary,
    last_heartbeat_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (event.event_type === "TOOL_STARTED") patch.last_tool_at = new Date().toISOString();
  await supabase.from("long_runs").update(patch).eq("id", runId);
}
