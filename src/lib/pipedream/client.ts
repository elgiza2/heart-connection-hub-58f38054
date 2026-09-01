/** @doc Browser helper for the connected-apps tool gateway (backend function).
 *  The browser never holds provider credentials — only its own session token.
 */
import { supabase } from "@/integrations/supabase/client";

export type AppTool = {
  key: string;
  app: string;
  name: string;
  description: string;
  version?: string;
};

export type ConnectedToolApp = {
  app: string;
  account_id: string;
  account_name: string | null;
  healthy: boolean;
  enabled: boolean;
};

type GatewayResponse = {
  ok?: boolean;
  error?: string;
  configured?: boolean;
  apps?: ConnectedToolApp[];
  tools?: AppTool[];
  result?: unknown;
  [key: string]: unknown;
};

async function gateway(action: string, payload: Record<string, unknown> = {}): Promise<GatewayResponse> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in to use app tools");
  const { data: res, error } = await supabase.functions.invoke<GatewayResponse>("anything-api", {
    body: { kind: "tools", action, token, ...payload },
  });
  if (error && !res) throw new Error(error.message || "App tools request failed");
  const body = res ?? null;
  if (!body) throw new Error("App tools request failed");
  if (body.ok === false && body.error) throw new Error(body.error);
  return body;
}

export const listToolApps = () => gateway("list");
export const listAppTools = (app: string) => gateway("actions", { app });
export const configureAppTool = (
  app: string,
  tool: string,
  configured_props: Record<string, unknown> = {},
  prop_name?: string,
  query?: string,
) => gateway("props", { app, tool, configured_props, prop_name, query });
export const runAppTool = (app: string, tool: string, configured_props: Record<string, unknown> = {}) =>
  gateway("run", { app, tool, configured_props });
export const setAppToolsEnabled = (app: string, enabled: boolean) =>
  gateway("set_enabled", { app, enabled });
