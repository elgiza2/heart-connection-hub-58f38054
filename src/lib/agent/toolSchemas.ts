/**
 * @doc Single source of truth for the agents' tool surface.
 *
 * Previously the coder's tools existed only inside a prose system prompt and
 * the chat agent's tools only inside a capabilities blurb, so the two drifted
 * apart and nothing could validate a tool call. These structured definitions
 * are used to (a) render the coder's protocol help, (b) validate parsed tool
 * calls, and (c) hand the backend a real JSON schema when it supports one.
 */

export interface ToolParam {
  name: string;
  type: "string";
  required: boolean;
  description: string;
}

export interface ToolSchema {
  name: string;
  description: string;
  params: ToolParam[];
  /** True when the tool changes the workspace (write/exec/delete). */
  mutates: boolean;
}

const p = (
  name: string,
  required: boolean,
  description: string,
): ToolParam => ({ name, type: "string", required, description });

/** Tools the Dev Agent coder may call. */
export const DEV_AGENT_TOOLS: ToolSchema[] = [
  {
    name: "write_file",
    description: "Write the COMPLETE final content of one project file (creates parent dirs).",
    params: [p("path", true, "Project-relative path"), p("content", true, "Full file content")],
    mutates: true,
  },
  {
    name: "read_file",
    description: "Read one project file. Only when you truly cannot write without it.",
    params: [p("path", true, "Project-relative path")],
    mutates: false,
  },
  {
    name: "delete_file",
    description: "Delete a project file or directory.",
    params: [p("path", true, "Project-relative path")],
    mutates: true,
  },
  {
    name: "list_dir",
    description: "List the entries of one project directory.",
    params: [p("path", false, "Directory, defaults to the project root")],
    mutates: false,
  },
  {
    name: "search_files",
    description:
      "Search the source tree for a regex (ripgrep/grep). Use this instead of reading many files.",
    params: [p("query", true, "Regex or literal to search for"), p("path", false, "Sub-tree to search, default src")],
    mutates: false,
  },
  {
    name: "git",
    description:
      "Read-only git inspection: status, diff, log. Never pushes, never rewrites history.",
    params: [p("command", true, "One of: status | diff | log")],
    mutates: false,
  },
  {
    name: "bash",
    description: "Run a shell command in the project VM (installs, scripts).",
    params: [p("command", true, "Shell command")],
    mutates: true,
  },
  {
    name: "typecheck",
    description: "Run the TypeScript compiler with no emit and report the errors.",
    params: [],
    mutates: false,
  },
  {
    name: "lint",
    description: "Run ESLint if the project configures it.",
    params: [],
    mutates: false,
  },
  {
    name: "run_tests",
    description: "Run the project's test suite if it has one (vitest/jest via npm test).",
    params: [],
    mutates: false,
  },
  {
    name: "build",
    description: "Run the production build. This is the verifier's ground truth.",
    params: [],
    mutates: false,
  },
  {
    name: "done",
    description: "Finish the current task.",
    params: [p("summary", false, "What changed")],
    mutates: false,
  },
];

export const DEV_AGENT_TOOL_NAMES = new Set(DEV_AGENT_TOOLS.map((t) => t.name));

/** Validates one parsed tool call against the schema. Returns an error string or null. */
export function validateToolCall(
  call: { tool?: string; path?: string; command?: string; content?: string; query?: string },
): string | null {
  if (!call.tool) return "missing tool name";
  const schema = DEV_AGENT_TOOLS.find((t) => t.name === call.tool);
  if (!schema) {
    return `unknown tool "${call.tool}" — valid tools: ${[...DEV_AGENT_TOOL_NAMES].join(", ")}`;
  }
  for (const param of schema.params) {
    if (!param.required) continue;
    const value = (call as Record<string, unknown>)[param.name];
    if (typeof value !== "string" || !value.trim()) {
      return `${schema.name} requires "${param.name}"`;
    }
  }
  return null;
}

/** JSON-schema style export for backends that support real function calling. */
export function toJsonSchemas(tools: ToolSchema[] = DEV_AGENT_TOOLS) {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties: Object.fromEntries(
          tool.params.map((param) => [param.name, { type: param.type, description: param.description }]),
        ),
        required: tool.params.filter((param) => param.required).map((param) => param.name),
      },
    },
  }));
}
