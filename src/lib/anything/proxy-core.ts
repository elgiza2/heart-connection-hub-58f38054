/** @doc Shared server-side logic for proxying requests to the Anything.com API.
 *  Used by the Vite dev middleware (preview) and the Vercel serverless function
 *  (production). The API key is read from the server environment only. */

const API_BASE = "https://api.anything.com";
const ALLOWED_METHODS = new Set(["GET", "POST", "DELETE"]);

export interface ProxyPayload {
  path?: string;
  method?: string;
  query?: Record<string, unknown>;
  body?: unknown;
}

export interface ProxyResult {
  status: number;
  body: Record<string, unknown>;
}

export async function proxyAnythingRequest(
  payload: ProxyPayload | null,
  apiKey: string | undefined,
): Promise<ProxyResult> {
  if (!apiKey) {
    return { status: 500, body: { error: "ANYTHING_API_KEY is not configured" } };
  }
  if (!payload?.path) {
    return { status: 400, body: { error: "Missing 'path'" } };
  }

  const path = payload.path.startsWith("/") ? payload.path : `/${payload.path}`;
  if (!path.startsWith("/v0/api/") || path.includes("..")) {
    return { status: 400, body: { error: "Invalid path" } };
  }

  const method = (payload.method ?? "GET").toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    return { status: 405, body: { error: "Method not allowed" } };
  }

  const url = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(payload.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  const basic =
    typeof btoa === "function"
      ? btoa(`${apiKey}:`)
      : Buffer.from(`${apiKey}:`).toString("base64");

  const upstream = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: method === "GET" || payload.body === undefined ? undefined : JSON.stringify(payload.body),
  });

  const text = await upstream.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }

  if (!upstream.ok) {
    console.error(`Anything API ${method} ${path} failed [${upstream.status}]: ${text.slice(0, 500)}`);
    return {
      status: 200,
      body: { error: "Anything API request failed", status: upstream.status, details: parsed },
    };
  }

  return { status: 200, body: { status: upstream.status, data: parsed } };
}
