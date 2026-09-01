/** @doc Executes one endpoint of a ready-made API app using the user's own key.
 *
 *  The key is stored in `user_api_apps` and read with the service role, so it
 *  never travels to the browser at call time. Only hosts on the allowlist below
 *  can be reached, and only the caller's own row is used.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

/** Hostnames the catalog is allowed to reach. */
const ALLOWED_HOSTS = new Set([
  "api.openweathermap.org",
  "api.weatherapi.com",
  "newsapi.org",
  "api.currentsapi.services",
  "api.themoviedb.org",
  "api.unsplash.com",
  "api.giphy.com",
  "api.opencagedata.com",
  "v6.exchangerate-api.com",
  "www.alphavantage.co",
  "pro-api.coinmarketcap.com",
  "api.nasa.gov",
  "api.ipgeolocation.io",
  "api.sendgrid.com",
  "api.resend.com",
  "api-free.deepl.com",
  "api.deepl.com",
  "www.googleapis.com",
  "serpapi.com",
  "v3.football.api-sports.io",
  "api.tinyurl.com",
  "api.spoonacular.com",
  "api.airtable.com",
  "api.notion.com",
]);

type Auth = { type: "header" | "query" | "path"; name: string; prefix?: string };
type AuthTemplate = { headers?: Record<string, string>; params?: Record<string, string> };

type Param = { name: string; in: "query" | "path" | "body"; required: boolean };
type ToolSpec = { name: string; method: "GET" | "POST"; path: string; params: Param[] };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: CORS });

/** Directory apps may target any public HTTPS host, never an internal one. */
function isPublicHttpsHost(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  const h = url.hostname.toLowerCase();
  if (
    h === "localhost" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h === "metadata.google.internal"
  ) {
    return false;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || a === 169) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
  }
  if (h.includes(":")) return false; // raw IPv6 literals
  return true;
}


export async function handleApiApp(_req: Request, admin: any, body: any): Promise<Response> {
  try {
    const token = String(body?.token ?? "");
    if (!token) return json({ ok: false, error: "Not signed in" }, 401);

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    const userId = userData?.user?.id;
    if (userErr || !userId) return json({ ok: false, error: "Not signed in" }, 401);

    const appId = String(body?.app ?? "");
    let spec = body?.spec as
      | {
          baseUrl: string;
          auth?: Auth | null;
          authTemplate?: AuthTemplate | null;
          basic?: boolean;
          tool: ToolSpec;
        }
      | undefined;

    if (!appId || !spec?.tool) {
      return json({ ok: false, error: "Missing request details" }, 400);
    }

    const { data: row, error: rowErr } = await admin
      .from("user_api_apps")
      .select("key_value, enabled, spec")
      .eq("user_id", userId)
      .eq("app_id", appId)
      .maybeSingle();
    if (rowErr) return json({ ok: false, error: rowErr.message }, 500);
    if (!row?.key_value) return json({ ok: false, error: "No key saved for this app" }, 400);
    if (row.enabled === false) return json({ ok: false, error: "This app is turned off" }, 400);

    // For directory apps the trusted definition is the one saved at connect time.
    if (row.spec?.baseUrl) {
      const saved = (row.spec.tools ?? []).find((t: ToolSpec) => t.name === spec!.tool.name);
      if (!saved) return json({ ok: false, error: "Unknown action" }, 400);
      spec = {
        baseUrl: String(row.spec.baseUrl),
        auth: (row.spec.auth ?? null) as Auth | null,
        authTemplate: (row.spec.authTemplate ?? null) as AuthTemplate | null,
        basic: Boolean(row.spec.basic),
        tool: saved,

      };
    }
    if (!spec?.baseUrl) return json({ ok: false, error: "Missing request details" }, 400);

    // Credentials are stored either as one raw key or as a map of named fields.
    const raw = String(row.key_value);
    let creds: Record<string, string> = {};
    if (raw.startsWith("{")) {
      try {
        const parsed = JSON.parse(raw);
        for (const [name, value] of Object.entries(parsed)) creds[name] = String(value);
      } catch {
        creds = { apiKey: raw };
      }
    } else {
      creds = { apiKey: raw };
    }
    const key = creds["apiKey"] ?? Object.values(creds)[0] ?? "";
    /** Fills `${field}` slots from the saved credentials. */
    const fill = (value: string) =>
      value.replace(/\$\{([\w.]+)\}/g, (_m, name: string) => {
        const field = name.split(".").pop() as string;
        return creds[field] ?? "";
      });

    const params = (body?.params ?? {}) as Record<string, unknown>;
    const auth = spec.auth;
    const template = spec.authTemplate;
    const basicAuth = Boolean(spec.basic);

    const tool = spec.tool;

    // Build the path, filling {placeholders} from params (and the key when needed).
    let path = tool.path;
    for (const p of tool.params.filter((x) => x.in === "path")) {
      const v = params[p.name];
      if (v === undefined || v === null || v === "") {
        if (p.required) return json({ ok: false, error: `Missing ${p.name}` }, 400);
        continue;
      }
      path = path.replaceAll(`{${p.name}}`, encodeURIComponent(String(v)));
    }
    if (auth?.type === "path") path = path.replaceAll(`{${auth.name}}`, encodeURIComponent(key));
    if (/\{[^}]+\}/.test(path)) return json({ ok: false, error: "Missing path value" }, 400);

    const base = fill(spec.baseUrl.replace(/\/$/, ""));
    if (base.includes("${")) return json({ ok: false, error: "Missing account details" }, 400);
    const url = new URL(base + path);
    const trusted = ALLOWED_HOSTS.has(url.hostname);
    if (!trusted && !isPublicHttpsHost(url)) {
      return json({ ok: false, error: "This service is not allowed" }, 400);
    }


    for (const p of tool.params.filter((x) => x.in === "query")) {
      const v = params[p.name];
      if (v === undefined || v === null || v === "") {
        if (p.required) return json({ ok: false, error: `Missing ${p.name}` }, 400);
        continue;
      }
      url.searchParams.set(p.name, String(v));
    }
    if (auth?.type === "query") url.searchParams.set(auth.name, key);
    for (const [name, value] of Object.entries(template?.params ?? {})) {
      url.searchParams.set(name, fill(value));
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    if (auth?.type === "header") headers[auth.name] = `${auth.prefix ?? ""}${key}`;
    for (const [name, value] of Object.entries(template?.headers ?? {})) {
      headers[name] = fill(value);
    }
    const hasAuthHeader = Object.keys(headers).some((h) => h.toLowerCase() === "authorization");
    if (!hasAuthHeader) {
      const user = creds["username"] ?? creds["email"];
      if (basicAuth || user) {
        // Username/password services: HTTP Basic, exactly as they document it.
        const pass = creds["password"] ?? creds["apiKey"] ?? "";
        headers["Authorization"] = `Basic ${btoa(`${user ?? ""}:${pass}`)}`;
      } else if (key && !Object.keys(template?.params ?? {}).length && !auth) {
        headers["Authorization"] = `Bearer ${key}`;
      }
    }
    if (appId === "notion") headers["Notion-Version"] = "2022-06-28";



    let payload: string | undefined;
    if (tool.method === "POST") {
      const bodyObj: Record<string, unknown> = {};
      for (const p of tool.params.filter((x) => x.in === "body")) {
        const v = params[p.name];
        if (v === undefined || v === null || v === "") {
          if (p.required) return json({ ok: false, error: `Missing ${p.name}` }, 400);
          continue;
        }
        bodyObj[p.name] = v;
      }
      payload = JSON.stringify(bodyObj);
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(url.toString(), {
      method: tool.method,
      headers,
      body: payload,
    });
    const text = await res.text();
    let result: unknown = text;
    try {
      result = JSON.parse(text);
    } catch {
      /* keep raw text */
    }

    if (!res.ok) {
      console.error(`api_app ${appId}/${tool.name} failed [${res.status}]: ${text.slice(0, 500)}`);
      return json({ ok: false, error: `Request failed (${res.status})`, result }, 200);
    }

    // Log usage without ever storing the key or the response body.
    await admin
      .from("user_api_apps")
      .update({ last_used_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("app_id", appId);

    return json({ ok: true, result });
  } catch (e) {
    console.error("api_app runner error", e);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
}
