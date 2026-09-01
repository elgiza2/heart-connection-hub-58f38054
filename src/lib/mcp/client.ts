/** @doc Browser-side helper for the /api/mcp gateway.
 *  The browser never talks to tool servers directly, and never stores their
 *  credentials — it only sends its own Supabase access token.
 */
import { supabase } from "@/integrations/supabase/client";

export type McpToolInfo = {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
};

export type McpServer = {
  id: string;
  name: string;
  url: string;
  transport: string;
  state: "pending" | "connected" | "error" | "needs_auth" | string;
  enabled: boolean;
  tool_names: string[] | null;
  tools: McpToolInfo[] | null;
  capabilities: Record<string, unknown> | null;
  auth_mode: string;
  protocol_version: string;
  last_error: string | null;
  last_probed_at: string | null;
  needs_auth?: boolean;
  has_credentials?: boolean;
};

export type McpApproval = { connection_id: string; tool_name: string; scope: string };

export type McpGatewayResponse = {
  ok?: boolean;
  error?: string;
  servers?: McpServer[];
  approvals?: McpApproval[];
  tools?: McpToolInfo[];
  authorize_url?: string;
  needs_approval?: boolean;
  needs_auth?: boolean;
  text?: string;
  isError?: boolean;
  result?: unknown;
  [key: string]: unknown;
};

export async function mcpGateway(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<McpGatewayResponse> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in to manage tool servers");

  const res = await fetch("/api/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      action,
      token,
      origin: typeof window !== "undefined" ? window.location.origin : undefined,
      ...payload,
    }),
  });
  const body = (await res.json().catch(() => null)) as McpGatewayResponse | null;
  if (!body) throw new Error("Tool server request failed");
  if (!res.ok && body.error) throw new Error(body.error);
  return body;
}

export const listMcpServers = () => mcpGateway("list");
export const probeMcpServer = (id: string) => mcpGateway("probe", { id });
export const authorizeMcpServer = (id: string) => mcpGateway("authorize", { id });
export const removeMcpServer = (id: string) => mcpGateway("remove", { id });
export const updateMcpServer = (id: string, patch: Record<string, unknown>) =>
  mcpGateway("update", { id, ...patch });
export const addMcpServer = (input: { name?: string; url: string; headers?: Record<string, string> }) =>
  mcpGateway("add", input);
export const callMcpTool = (id: string, tool: string, args: Record<string, unknown> = {}) =>
  mcpGateway("call_tool", { id, tool, arguments: args });
export const approveMcpTool = (id: string, tool: string, scope: "once" | "always" = "always") =>
  mcpGateway("approve_tool", { id, tool, scope });
export const revokeMcpTool = (id: string, tool: string) => mcpGateway("revoke_tool", { id, tool });
export const listMcpTools = () => mcpGateway("tools");
export const completeMcpOAuth = (state: string, code: string) =>
  mcpGateway("oauth_callback", { state, code });
