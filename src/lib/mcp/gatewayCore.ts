/** @doc Server-side MCP gateway (used by /api/mcp and its dev-server twin).
 *
 *  It is the only place that talks to remote MCP servers: the browser never
 *  holds tool-server credentials. Every action is authenticated with the
 *  caller's Supabase access token and scoped to their own rows.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
} from "../api/supabaseServerConfig";
import {
  McpAuthRequiredError,
  McpClient,
  LATEST_PROTOCOL_VERSION,
  buildAuthorizeUrl,
  discoverAuthServer,
  exchangeAuthorizationCode,
  pkcePair,
  randomToken,
  refreshAccessToken,
  registerOAuthClient,
  type AuthServerMetadata,
  type McpTool,
  type TokenSet,
} from "./protocol";

export type GatewayAction =
  | "list"
  | "add"
  | "update"
  | "remove"
  | "probe"
  | "authorize"
  | "oauth_callback"
  | "call_tool"
  | "approve_tool"
  | "revoke_tool"
  | "tools";

export interface GatewayPayload {
  action: GatewayAction;
  token?: string;
  id?: string;
  name?: string;
  url?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  tool?: string;
  arguments?: Record<string, unknown>;
  scope?: "once" | "always";
  state?: string;
  code?: string;
  origin?: string;
}

type Result = { status: number; body: Record<string, unknown> };

const ok = (body: Record<string, unknown> = {}): Result => ({ status: 200, body: { ok: true, ...body } });
const fail = (status: number, error: string): Result => ({ status, body: { ok: false, error } });

/** Server client. Prefers the service key; falls back to the anon key scoped to
 *  the caller's JWT (RLS keeps every row owner-scoped anyway), so the gateway
 *  keeps working on deployments where the service key was never configured. */
function db(userToken?: string): SupabaseClient {
  if (SUPABASE_SERVICE_ROLE_KEY) {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  if (!userToken) throw new Error("Not signed in");
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${userToken}` } },
  });
}

function redirectUri(origin?: string): string {
  const base = (origin || process.env.PUBLIC_SITE_URL || "https://megsyai.com").replace(/\/$/, "");
  return `${base}/mcp-callback`;
}

/** Row shape we care about; extra columns are ignored. */
type ConnectionRow = {
  id: string;
  user_id: string;
  name: string;
  url: string;
  transport: string;
  state: string;
  enabled: boolean;
  tool_names: string[] | null;
  tools: McpTool[] | null;
  capabilities: Record<string, unknown> | null;
  auth_headers: Record<string, string> | null;
  auth_mode: string;
  oauth: Record<string, any> | null;
  protocol_version: string;
  last_error: string | null;
};

const PUBLIC_COLUMNS =
  "id, name, url, transport, state, enabled, tool_names, tools, capabilities, auth_mode, protocol_version, last_error, last_probed_at, created_at";

function sanitize(row: any) {
  const { oauth, auth_headers, ...rest } = row ?? {};
  return {
    ...rest,
    needs_auth: row?.state === "needs_auth",
    has_credentials: Boolean(oauth?.tokens?.access_token) || Object.keys(auth_headers ?? {}).length > 0,
  };
}

async function requireUser(supabase: SupabaseClient, token?: string) {
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error || !data.user ? null : data.user;
}

async function loadRow(supabase: SupabaseClient, userId: string, id?: string): Promise<ConnectionRow | null> {
  if (!id) return null;
  const { data } = await supabase
    .from("mcp_connections")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as ConnectionRow) ?? null;
}

/** Fresh access token for a row, refreshing when it is close to expiry. */
async function accessTokenFor(supabase: SupabaseClient, row: ConnectionRow): Promise<string | null> {
  const oauth = row.oauth ?? {};
  const tokens: TokenSet | undefined = oauth.tokens;
  if (!tokens?.access_token) return null;
  const stillValid = !tokens.expires_at || tokens.expires_at - Date.now() > 60_000;
  if (stillValid) return tokens.access_token;
  if (!tokens.refresh_token || !oauth.metadata?.token_endpoint) return tokens.access_token;

  try {
    const next = await refreshAccessToken({
      metadata: oauth.metadata as AuthServerMetadata,
      clientId: String(oauth.client_id),
      clientSecret: oauth.client_secret ? String(oauth.client_secret) : undefined,
      refreshToken: tokens.refresh_token,
      resource: row.url,
    });
    const merged = { ...tokens, ...next, refresh_token: next.refresh_token ?? tokens.refresh_token };
    await supabase
      .from("mcp_connections")
      .update({ oauth: { ...oauth, tokens: merged } })
      .eq("id", row.id);
    return merged.access_token;
  } catch {
    return tokens.access_token;
  }
}

async function clientFor(supabase: SupabaseClient, row: ConnectionRow): Promise<McpClient> {
  const accessToken = await accessTokenFor(supabase, row);
  return new McpClient(row.url, {
    headers: row.auth_headers ?? {},
    accessToken,
    protocolVersion: row.protocol_version || LATEST_PROTOCOL_VERSION,
  });
}

/** Handshake + tools/list, persisting the result (or the auth requirement). */
async function probeRow(supabase: SupabaseClient, row: ConnectionRow, origin?: string): Promise<Result> {
  try {
    const client = await clientFor(supabase, row);
    const tools = await client.listTools();
    await supabase
      .from("mcp_connections")
      .update({
        state: "connected",
        tools,
        tool_names: tools.map((t) => t.name),
        capabilities: client.capabilities ?? {},
        protocol_version: client.protocolVersion,
        last_error: null,
        last_probed_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return ok({ tools, protocol_version: client.protocolVersion, server: client.serverInfo });
  } catch (err) {
    if (err instanceof McpAuthRequiredError) {
      await supabase
        .from("mcp_connections")
        .update({
          state: "needs_auth",
          auth_mode: "oauth",
          last_error: null,
          last_probed_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      return await startAuthorization(supabase, row, err.wwwAuthenticate, origin);
    }
    const message = err instanceof Error ? err.message : "Connection failed";
    await supabase
      .from("mcp_connections")
      .update({ state: "error", last_error: message, last_probed_at: new Date().toISOString() })
      .eq("id", row.id);
    return ok({ state: "error", error: message, tools: [] });
  }
}

/** Discover the auth server, register a client and return the consent URL. */
async function startAuthorization(
  supabase: SupabaseClient,
  row: ConnectionRow,
  wwwAuthenticate: string | null,
  origin?: string,
): Promise<Result> {
  const uri = redirectUri(origin);
  const metadata = await discoverAuthServer(row.url, wwwAuthenticate);
  const existing = row.oauth ?? {};
  let clientId: string | undefined = existing.client_id;
  let clientSecret: string | undefined = existing.client_secret;

  if (!clientId) {
    const registered = await registerOAuthClient(metadata, uri);
    if (!registered) {
      return ok({
        state: "needs_auth",
        error: "This server requires a token. Add it as a header instead.",
      });
    }
    clientId = registered.client_id;
    clientSecret = registered.client_secret;
  }

  const { verifier, challenge } = await pkcePair();
  const state = randomToken(32);

  await supabase.from("mcp_oauth_states").insert({
    state,
    user_id: row.user_id,
    connection_id: row.id,
    code_verifier: verifier,
    metadata: { metadata, client_id: clientId, client_secret: clientSecret, redirect_uri: uri },
  });

  await supabase
    .from("mcp_connections")
    .update({
      auth_mode: "oauth",
      oauth: { ...existing, metadata, client_id: clientId, client_secret: clientSecret },
    })
    .eq("id", row.id);

  return ok({
    state: "needs_auth",
    authorize_url: buildAuthorizeUrl({
      metadata,
      clientId,
      redirectUri: uri,
      state,
      challenge,
      resource: row.url,
    }),
  });
}

function textOf(result: { content?: { type: string; text?: string }[]; structuredContent?: unknown }): string {
  const text = (result.content ?? [])
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text!)
    .join("\n")
    .trim();
  if (text) return text;
  if (result.structuredContent !== undefined) return JSON.stringify(result.structuredContent);
  return "";
}

export async function handleMcpGateway(payload: GatewayPayload | null): Promise<Result> {
  if (!payload?.action) return fail(400, "Missing action");
  let supabase: SupabaseClient;
  try {
    supabase = db(payload.token);
  } catch {
    return fail(401, "Not signed in");
  }


  const user = await requireUser(supabase, payload.token);
  if (!user) return fail(401, "Not signed in");
  const userId = user.id;

  switch (payload.action) {
    case "list": {
      const { data, error } = await supabase
        .from("mcp_connections")
        .select(PUBLIC_COLUMNS + ", auth_headers, oauth")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) return fail(400, error.message);
      const { data: approvals } = await supabase
        .from("mcp_tool_approvals")
        .select("connection_id, tool_name, scope")
        .eq("user_id", userId);
      return ok({ servers: (data ?? []).map(sanitize), approvals: approvals ?? [] });
    }

    case "add": {
      const url = String(payload.url ?? "").trim();
      if (!url) return fail(400, "Server URL is required");
      const { data, error } = await supabase
        .from("mcp_connections")
        .insert({
          user_id: userId,
          name: String(payload.name ?? "").trim() || new URL(url).hostname,
          url,
          transport: "streamable-http",
          state: "pending",
          enabled: payload.enabled !== false,
          auth_headers: payload.headers ?? {},
          auth_mode: Object.keys(payload.headers ?? {}).length ? "headers" : "none",
          protocol_version: LATEST_PROTOCOL_VERSION,
        })
        .select("*")
        .single();
      if (error) return fail(400, error.message);
      const probe = await probeRow(supabase, data as ConnectionRow, payload.origin);
      return ok({ id: (data as any).id, ...probe.body });
    }

    case "update": {
      const row = await loadRow(supabase, userId, payload.id);
      if (!row) return fail(404, "Server not found");
      const patch: Record<string, unknown> = {};
      if (payload.name !== undefined) patch.name = String(payload.name);
      if (payload.enabled !== undefined) patch.enabled = Boolean(payload.enabled);
      if (payload.headers !== undefined) {
        patch.auth_headers = payload.headers;
        if (Object.keys(payload.headers).length && row.auth_mode !== "oauth") patch.auth_mode = "headers";
      }
      const { error } = await supabase.from("mcp_connections").update(patch).eq("id", row.id);
      if (error) return fail(400, error.message);
      return ok();
    }

    case "remove": {
      const row = await loadRow(supabase, userId, payload.id);
      if (!row) return fail(404, "Server not found");
      await supabase.from("mcp_connections").delete().eq("id", row.id);
      return ok();
    }

    case "probe": {
      const row = await loadRow(supabase, userId, payload.id);
      if (!row) return fail(404, "Server not found");
      return await probeRow(supabase, row, payload.origin);
    }

    case "authorize": {
      const row = await loadRow(supabase, userId, payload.id);
      if (!row) return fail(404, "Server not found");
      try {
        return await startAuthorization(supabase, row, null, payload.origin);
      } catch (err) {
        return fail(400, err instanceof Error ? err.message : "Could not start sign-in");
      }
    }

    case "oauth_callback": {
      const state = String(payload.state ?? "");
      const code = String(payload.code ?? "");
      if (!state || !code) return fail(400, "Missing authorization result");
      const { data: stateRow } = await supabase
        .from("mcp_oauth_states")
        .select("*")
        .eq("state", state)
        .eq("user_id", userId)
        .maybeSingle();
      if (!stateRow) return fail(400, "This sign-in request expired");
      await supabase.from("mcp_oauth_states").delete().eq("state", state);

      const row = await loadRow(supabase, userId, (stateRow as any).connection_id);
      if (!row) return fail(404, "Server not found");
      const meta = (stateRow as any).metadata ?? {};
      try {
        const tokens = await exchangeAuthorizationCode({
          metadata: meta.metadata as AuthServerMetadata,
          clientId: String(meta.client_id),
          clientSecret: meta.client_secret ? String(meta.client_secret) : undefined,
          code,
          redirectUri: String(meta.redirect_uri ?? redirectUri(payload.origin)),
          verifier: String((stateRow as any).code_verifier),
          resource: row.url,
        });
        await supabase
          .from("mcp_connections")
          .update({ oauth: { ...(row.oauth ?? {}), ...meta, tokens }, auth_mode: "oauth", state: "pending" })
          .eq("id", row.id);
        const refreshed = await loadRow(supabase, userId, row.id);
        const probe = await probeRow(supabase, refreshed!, payload.origin);
        return ok({ id: row.id, name: row.name, ...probe.body });
      } catch (err) {
        return fail(400, err instanceof Error ? err.message : "Sign-in failed");
      }
    }

    case "approve_tool": {
      const row = await loadRow(supabase, userId, payload.id);
      if (!row || !payload.tool) return fail(400, "Server and tool are required");
      const { error } = await supabase.from("mcp_tool_approvals").upsert(
        {
          user_id: userId,
          connection_id: row.id,
          tool_name: String(payload.tool),
          scope: payload.scope === "once" ? "once" : "always",
        },
        { onConflict: "connection_id,tool_name" },
      );
      if (error) return fail(400, error.message);
      return ok();
    }

    case "revoke_tool": {
      const row = await loadRow(supabase, userId, payload.id);
      if (!row || !payload.tool) return fail(400, "Server and tool are required");
      await supabase
        .from("mcp_tool_approvals")
        .delete()
        .eq("connection_id", row.id)
        .eq("tool_name", String(payload.tool));
      return ok();
    }

    case "tools": {
      const { data } = await supabase
        .from("mcp_connections")
        .select("id, name, tools, state")
        .eq("user_id", userId)
        .eq("enabled", true);
      const servers = (data ?? [])
        .filter((r: any) => r.state === "connected")
        .map((r: any) => ({
          id: String(r.id),
          name: String(r.name),
          tools: (Array.isArray(r.tools) ? r.tools : []) as McpTool[],
        }));
      return ok({ servers });
    }

    case "call_tool": {
      const row = await loadRow(supabase, userId, payload.id);
      if (!row) return fail(404, "Server not found");
      const toolName = String(payload.tool ?? "").trim();
      if (!toolName) return fail(400, "Tool name is required");
      if (!row.enabled) return fail(400, "This server is turned off");

      const tool = (row.tools ?? []).find((t) => t.name === toolName);
      const readOnly = Boolean(tool?.annotations?.readOnlyHint);
      if (!readOnly) {
        const { data: approval } = await supabase
          .from("mcp_tool_approvals")
          .select("scope")
          .eq("connection_id", row.id)
          .eq("tool_name", toolName)
          .maybeSingle();
        if (!approval) {
          return {
            status: 200,
            body: {
              ok: false,
              needs_approval: true,
              tool: toolName,
              server: row.name,
              description: tool?.description ?? null,
              destructive: Boolean(tool?.annotations?.destructiveHint),
            },
          };
        }
        if ((approval as any).scope === "once") {
          await supabase
            .from("mcp_tool_approvals")
            .delete()
            .eq("connection_id", row.id)
            .eq("tool_name", toolName);
        }
      }

      const started = Date.now();
      try {
        const client = await clientFor(supabase, row);
        const result = await client.callTool(toolName, payload.arguments ?? {});
        await supabase.from("mcp_call_log").insert({
          user_id: userId,
          connection_id: row.id,
          server_name: row.name,
          tool_name: toolName,
          status: result.isError ? "error" : "ok",
          duration_ms: Date.now() - started,
          error: result.isError ? textOf(result).slice(0, 500) : null,
        });
        return ok({ result, text: textOf(result), isError: Boolean(result.isError) });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Tool call failed";
        await supabase.from("mcp_call_log").insert({
          user_id: userId,
          connection_id: row.id,
          server_name: row.name,
          tool_name: toolName,
          status: "error",
          duration_ms: Date.now() - started,
          error: message.slice(0, 500),
        });
        if (err instanceof McpAuthRequiredError) {
          await supabase.from("mcp_connections").update({ state: "needs_auth" }).eq("id", row.id);
          return { status: 200, body: { ok: false, needs_auth: true, error: "Sign in to this server again" } };
        }
        return fail(400, message);
      }
    }

    default:
      return fail(400, "Unknown action");
  }
}
