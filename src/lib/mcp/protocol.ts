/** @doc MCP client implementing the 2026-07-28 spec (Streamable HTTP, no sessions).
 *
 *  Server-side only: it is imported by the /api/mcp gateway, never by browser code.
 *  Key spec points implemented here:
 *   - Streamable HTTP with a single POST per message.
 *   - No protocol-level sessions (the `Mcp-Session-Id` header is gone).
 *   - `MCP-Protocol-Version` header on every request, with negotiation fallback
 *     to older revisions when a server rejects the newest one.
 *   - `Accept: application/json, text/event-stream` (servers reply 406 without it).
 *   - Cursor pagination for `tools/list`.
 *   - OAuth 2.1 discovery (WWW-Authenticate -> protected resource metadata ->
 *     authorization server metadata), dynamic client registration and PKCE.
 */

export const LATEST_PROTOCOL_VERSION = "2026-07-28";
export const FALLBACK_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];

export type McpToolAnnotations = {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

export type McpTool = {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: McpToolAnnotations;
};

export type McpContent = { type: string; text?: string; [k: string]: unknown };

export type McpToolResult = {
  content?: McpContent[];
  structuredContent?: unknown;
  isError?: boolean;
};

export class McpAuthRequiredError extends Error {
  wwwAuthenticate: string | null;
  constructor(message: string, wwwAuthenticate: string | null) {
    super(message);
    this.name = "McpAuthRequiredError";
    this.wwwAuthenticate = wwwAuthenticate;
  }
}

export class McpProtocolError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "McpProtocolError";
    this.status = status;
  }
}

function assertHttpsUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new McpProtocolError("Invalid server URL");
  }
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !isLocal) {
    throw new McpProtocolError("Only https endpoints are allowed");
  }
  return url;
}

/** Extract a single JSON-RPC response from either a JSON body or an SSE stream. */
function parseRpcBody(contentType: string, body: string, id: number | string) {
  if (contentType.includes("text/event-stream")) {
    const messages: any[] = [];
    for (const line of body.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        messages.push(JSON.parse(payload));
      } catch {
        /* ignore keep-alive / partial frames */
      }
    }
    const match = messages.find((m) => m && m.id === id) ?? messages[messages.length - 1];
    if (!match) throw new McpProtocolError("Empty response stream");
    return match;
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new McpProtocolError(`Malformed response: ${body.slice(0, 200)}`);
  }
}

export type McpClientOptions = {
  headers?: Record<string, string>;
  accessToken?: string | null;
  protocolVersion?: string;
  timeoutMs?: number;
};

export class McpClient {
  readonly url: URL;
  protocolVersion: string;
  serverInfo: { name?: string; title?: string; version?: string } | null = null;
  capabilities: Record<string, unknown> = {};

  private headers: Record<string, string>;
  private accessToken: string | null;
  private timeoutMs: number;
  private nextId = 1;
  private initialized = false;

  constructor(url: string, options: McpClientOptions = {}) {
    this.url = assertHttpsUrl(url);
    this.headers = options.headers ?? {};
    this.accessToken = options.accessToken ?? null;
    this.protocolVersion = options.protocolVersion || LATEST_PROTOCOL_VERSION;
    this.timeoutMs = options.timeoutMs ?? 45_000;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      // Required by the Streamable HTTP transport; servers reply 406 without it.
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": this.protocolVersion,
      ...this.headers,
    };
    if (this.accessToken) headers["Authorization"] = `Bearer ${this.accessToken}`;
    return headers;
  }

  private async send(method: string, params?: unknown, isNotification = false) {
    const id = this.nextId++;
    const payload: Record<string, unknown> = { jsonrpc: "2.0", method };
    if (params !== undefined) payload.params = params;
    if (!isNotification) payload.id = id;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(this.url.toString(), {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(payload),
        // Never chase redirects: the target could be an unvetted host.
        redirect: "error",
        signal: controller.signal,
      });
    } catch (err) {
      throw new McpProtocolError(
        (err as Error)?.name === "AbortError" ? "Server timed out" : `Request failed: ${(err as Error).message}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401 || response.status === 403) {
      throw new McpAuthRequiredError(
        "The server requires authorization",
        response.headers.get("www-authenticate"),
      );
    }

    if (isNotification) {
      // 202 Accepted is the expected reply for notifications.
      if (!response.ok && response.status !== 202) {
        throw new McpProtocolError(`Notification rejected (${response.status})`, response.status);
      }
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();

    if (!response.ok) {
      // Surface the JSON-RPC error when the server sent one alongside the status.
      try {
        const parsed = parseRpcBody(contentType, text, id);
        if (parsed?.error?.message) {
          throw new McpProtocolError(parsed.error.message, response.status);
        }
      } catch (err) {
        if (err instanceof McpProtocolError && err.status) throw err;
      }
      throw new McpProtocolError(`Server returned ${response.status}`, response.status);
    }

    const parsed = parseRpcBody(contentType, text, id);
    if (parsed?.error) {
      throw new McpProtocolError(parsed.error.message || "Tool server error", response.status);
    }
    return parsed?.result ?? null;
  }

  /** Handshake, negotiating down the protocol version when needed. */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    const versions = [this.protocolVersion, ...FALLBACK_PROTOCOL_VERSIONS.filter((v) => v !== this.protocolVersion)];
    let lastError: unknown = null;

    for (const version of versions) {
      this.protocolVersion = version;
      try {
        const result: any = await this.send("initialize", {
          protocolVersion: version,
          capabilities: { elicitation: {} },
          clientInfo: { name: "megsy", title: "Megsy", version: "2.0.0" },
        });
        this.serverInfo = result?.serverInfo ?? null;
        this.capabilities = result?.capabilities ?? {};
        if (result?.protocolVersion && typeof result.protocolVersion === "string") {
          this.protocolVersion = result.protocolVersion;
        }
        await this.send("notifications/initialized", {}, true).catch(() => null);
        this.initialized = true;
        return;
      } catch (err) {
        if (err instanceof McpAuthRequiredError) throw err;
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new McpProtocolError("Handshake failed");
  }

  /** All tools, following `nextCursor` pagination. */
  async listTools(): Promise<McpTool[]> {
    await this.initialize();
    const tools: McpTool[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const result: any = await this.send("tools/list", cursor ? { cursor } : {});
      for (const tool of result?.tools ?? []) {
        if (!tool?.name) continue;
        tools.push({
          name: String(tool.name),
          title: tool.title ? String(tool.title) : undefined,
          description: tool.description ? String(tool.description) : undefined,
          inputSchema: tool.inputSchema ?? undefined,
          outputSchema: tool.outputSchema ?? undefined,
          annotations: tool.annotations ?? undefined,
        });
      }
      cursor = result?.nextCursor ? String(result.nextCursor) : undefined;
      if (!cursor) break;
    }
    return tools;
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpToolResult> {
    await this.initialize();
    const result: any = await this.send("tools/call", { name, arguments: args });
    return {
      content: Array.isArray(result?.content) ? result.content : [],
      structuredContent: result?.structuredContent,
      isError: Boolean(result?.isError),
    };
  }
}

/* ------------------------------------------------------------------ */
/* OAuth 2.1                                                           */
/* ------------------------------------------------------------------ */

export type AuthServerMetadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  code_challenge_methods_supported?: string[];
};

function resourceMetadataUrlFrom(wwwAuthenticate: string | null, serverUrl: URL): string[] {
  const candidates: string[] = [];
  const match = wwwAuthenticate?.match(/resource_metadata="([^"]+)"/i);
  if (match?.[1]) candidates.push(match[1]);
  candidates.push(new URL("/.well-known/oauth-protected-resource", serverUrl).toString());
  return candidates;
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, redirect: "error" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Resolve the authorization server for an MCP endpoint. */
export async function discoverAuthServer(
  serverUrl: string,
  wwwAuthenticate: string | null,
): Promise<AuthServerMetadata> {
  const target = assertHttpsUrl(serverUrl);
  let issuers: string[] = [];

  for (const candidate of resourceMetadataUrlFrom(wwwAuthenticate, target)) {
    const doc = await fetchJson(candidate);
    if (doc?.authorization_servers?.length) {
      issuers = doc.authorization_servers.map(String);
      break;
    }
  }
  if (!issuers.length) issuers = [target.origin];

  for (const issuer of issuers) {
    const base = issuer.replace(/\/$/, "");
    const docs = [
      `${base}/.well-known/oauth-authorization-server`,
      `${base}/.well-known/openid-configuration`,
    ];
    for (const docUrl of docs) {
      const doc = await fetchJson(docUrl);
      if (doc?.authorization_endpoint && doc?.token_endpoint) {
        return {
          issuer: String(doc.issuer ?? base),
          authorization_endpoint: String(doc.authorization_endpoint),
          token_endpoint: String(doc.token_endpoint),
          registration_endpoint: doc.registration_endpoint ? String(doc.registration_endpoint) : undefined,
          scopes_supported: Array.isArray(doc.scopes_supported) ? doc.scopes_supported.map(String) : undefined,
          code_challenge_methods_supported: Array.isArray(doc.code_challenge_methods_supported)
            ? doc.code_challenge_methods_supported.map(String)
            : undefined,
        };
      }
    }
  }
  throw new McpProtocolError("Could not discover the sign-in service for this server");
}

/** Dynamic client registration (RFC 7591). Returns null when unsupported. */
export async function registerOAuthClient(
  metadata: AuthServerMetadata,
  redirectUri: string,
): Promise<{ client_id: string; client_secret?: string } | null> {
  if (!metadata.registration_endpoint) return null;
  try {
    const res = await fetch(metadata.registration_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      redirect: "error",
      body: JSON.stringify({
        client_name: "Megsy",
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
    });
    if (!res.ok) return null;
    const doc = await res.json();
    if (!doc?.client_id) return null;
    return { client_id: String(doc.client_id), client_secret: doc.client_secret ? String(doc.client_secret) : undefined };
  } catch {
    return null;
  }
}

function base64Url(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken(length = 48): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomToken(64);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

export function buildAuthorizeUrl(input: {
  metadata: AuthServerMetadata;
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
  resource: string;
  scopes?: string[];
}): string {
  const url = new URL(input.metadata.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  // RFC 8707 — bind the token to this MCP resource.
  url.searchParams.set("resource", input.resource);
  const scopes = input.scopes ?? input.metadata.scopes_supported;
  if (scopes?.length) url.searchParams.set("scope", scopes.join(" "));
  return url.toString();
}

export type TokenSet = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  scope?: string;
  token_type?: string;
};

async function tokenRequest(endpoint: string, body: URLSearchParams, clientSecret?: string): Promise<TokenSet> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  if (clientSecret) {
    headers["Authorization"] = `Basic ${btoa(`${body.get("client_id")}:${clientSecret}`)}`;
  }
  const res = await fetch(endpoint, { method: "POST", headers, body, redirect: "error" });
  const doc = await res.json().catch(() => null);
  if (!res.ok || !doc?.access_token) {
    throw new McpProtocolError(doc?.error_description || doc?.error || `Sign-in failed (${res.status})`);
  }
  return {
    access_token: String(doc.access_token),
    refresh_token: doc.refresh_token ? String(doc.refresh_token) : undefined,
    expires_at: doc.expires_in ? Date.now() + Number(doc.expires_in) * 1000 : undefined,
    scope: doc.scope ? String(doc.scope) : undefined,
    token_type: doc.token_type ? String(doc.token_type) : "Bearer",
  };
}

export function exchangeAuthorizationCode(input: {
  metadata: AuthServerMetadata;
  clientId: string;
  clientSecret?: string;
  code: string;
  redirectUri: string;
  verifier: string;
  resource: string;
}): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.clientId,
    code_verifier: input.verifier,
    resource: input.resource,
  });
  return tokenRequest(input.metadata.token_endpoint, body, input.clientSecret);
}

export function refreshAccessToken(input: {
  metadata: AuthServerMetadata;
  clientId: string;
  clientSecret?: string;
  refreshToken: string;
  resource: string;
}): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
    client_id: input.clientId,
    resource: input.resource,
  });
  return tokenRequest(input.metadata.token_endpoint, body, input.clientSecret);
}
