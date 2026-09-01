/**
 * Unified per-turn context.
 *
 * Everything the user configured in Settings (Knowledge, MCP servers,
 * connected apps, cloud-browser preferences) is collected here once and then
 * (a) sent as structured fields on the chat request and (b) folded into the
 * hidden system brief, so the assistant behaves correctly even if the chat
 * backend ignores the structured fields.
 *
 * No provider or model names are ever exposed in user-facing strings.
 */
import { supabase } from "@/integrations/supabase/client";
import { API_APPS } from "@/lib/apiApps/catalog";

export type KnowledgeEntry = { name: string; use_when: string; content: string };
export type McpToolInfo = { name: string; description: string; inputSchema?: unknown };
export type McpServerInfo = {
  id: string;
  name: string;
  transport: string;
  protocolVersion?: string;
  tools: string[];
  toolDetails: McpToolInfo[];
};
export type ConnectedAppInfo = { slug: string; kind: string };
export type ApiAppInfo = { id: string; name: string; tools: { name: string; description: string }[] };

export type TurnContext = {
  knowledge: KnowledgeEntry[];
  mcpServers: McpServerInfo[];
  connectedApps: ConnectedAppInfo[];
  apiApps: ApiAppInfo[];
  browser: { keepSignedIn: boolean; allowDownloads: boolean };
};

const EMPTY: TurnContext = {
  knowledge: [],
  mcpServers: [],
  connectedApps: [],
  apiApps: [],
  browser: { keepSignedIn: false, allowDownloads: true },
};

const KNOWLEDGE_CHAR_BUDGET = 6000;
// Settings change rarely; a longer TTL keeps the first token fast because a
// cache hit skips eight round-trips on the critical path of every send.
const CACHE_TTL = 5 * 60_000;

let cache: { value: TurnContext; at: number; userId: string } | null = null;

/** Drop the cache — call after the user edits any of these settings. */
export function invalidateTurnContext() {
  cache = null;
}

if (typeof window !== "undefined") {
  window.addEventListener("megsy:context-changed", invalidateTurnContext);
}

/** Notify the app that a context source (knowledge/mcp/apps/browser) changed. */
export function notifyTurnContextChanged() {
  invalidateTurnContext();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("megsy:context-changed"));
  }
}

/** Warm the cache in the background so the next send skips these queries. */
export function prewarmTurnContext() {
  void fetchTurnContext().catch(() => undefined);
}

export async function fetchTurnContext(): Promise<TurnContext> {
  let userId: string | null = null;
  try {
    // getSession reads the locally cached session; getUser would add an auth
    // round-trip before every single message.
    const { data } = await supabase.auth.getSession();
    userId = data.session?.user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) return EMPTY;

  if (cache && cache.userId === userId && Date.now() - cache.at < CACHE_TTL) return cache.value;

  const [knowledgeRes, mcpRes, appsRes, integrationsRes, browserRes, toolAppsRes, toolPrefsRes, apiAppsRes] = await Promise.all([
    supabase
      .from("user_knowledge")
      .select("name, use_when, content, enabled")
      .eq("user_id", userId)
      .eq("enabled", true)
      .order("updated_at", { ascending: false })
      .limit(30),
    supabase
      .from("mcp_connections")
      .select("id, name, transport, tool_names, tools, protocol_version, enabled")
      .eq("user_id", userId)
      .eq("enabled", true)
      .limit(20),
    supabase
      .from("composio_connections")
      .select("app_slug, status")
      .eq("user_id", userId)
      .limit(50),
    supabase
      .from("user_integrations")
      .select("email_enabled, email_address, telegram_chat_id")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("cloud_browser_settings")
      .select("keep_signed_in, allow_downloads")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("pipedream_accounts")
      .select("app_slug, account_name, healthy")
      .eq("user_id", userId)
      .limit(60),
    supabase
      .from("pipedream_tool_settings")
      .select("app_slug, enabled")
      .eq("user_id", userId)
      .limit(60),
    supabase
      .from("user_api_apps")
      .select("app_id, enabled, display_name, spec")
      .eq("user_id", userId)
      .eq("enabled", true)
      .limit(60),
  ]);

  const apiApps: ApiAppInfo[] = (((apiAppsRes as any)?.data as any[]) || [])
    .map((r) => {
      const curated = API_APPS.find((a) => a.id === String(r.app_id));
      if (curated) return { id: curated.id, name: curated.name, tools: curated.tools };
      if (r.spec?.tools?.length) {
        return {
          id: String(r.app_id),
          name: String(r.display_name || r.app_id),
          tools: r.spec.tools,
        };
      }
      return null;
    })
    .filter(Boolean)
    .map((a: any) => ({
      id: a.id,
      name: a.name,
      tools: (a.tools as any[]).map((t) => ({ name: t.name, description: t.description })),
    }));


  let budget = KNOWLEDGE_CHAR_BUDGET;
  const knowledge: KnowledgeEntry[] = [];
  for (const row of (knowledgeRes.data as any[]) || []) {
    const content = String(row.content || "").slice(0, Math.max(0, budget));
    if (!content) continue;
    budget -= content.length;
    knowledge.push({
      name: String(row.name || "Untitled"),
      use_when: String(row.use_when || ""),
      content,
    });
    if (budget <= 0) break;
  }

  const mcpServers: McpServerInfo[] = ((mcpRes.data as any[]) || []).map((r) => {
    const detailed: McpToolInfo[] = (Array.isArray(r.tools) ? r.tools : [])
      .slice(0, 40)
      .map((t: any) => ({
        name: String(t?.name ?? ""),
        description: String(t?.description ?? "").slice(0, 300),
        inputSchema: t?.inputSchema ?? t?.input_schema,
      }))
      .filter((t: McpToolInfo) => t.name);
    const names = detailed.length
      ? detailed.map((t) => t.name)
      : Array.isArray(r.tool_names)
        ? r.tool_names.map(String).slice(0, 40)
        : [];
    return {
      id: String(r.id),
      name: String(r.name || "Server"),
      transport: String(r.transport || "http"),
      protocolVersion: r.protocol_version ? String(r.protocol_version) : undefined,
      tools: names,
      toolDetails: detailed,
    };
  });

  const connectedApps: ConnectedAppInfo[] = ((appsRes.data as any[]) || [])
    .filter((r) => (r.status || "active") !== "revoked")
    .map((r) => ({ slug: String(r.app_slug), kind: "app" }));
  const disabledApps = new Set(
    (((toolPrefsRes as any)?.data as any[]) || [])
      .filter((r) => r?.enabled === false)
      .map((r) => String(r.app_slug)),
  );
  for (const row of (((toolAppsRes as any)?.data as any[]) || [])) {
    const slug = String(row?.app_slug || "");
    if (!slug || disabledApps.has(slug)) continue;
    if (connectedApps.some((a) => a.slug === slug)) continue;
    connectedApps.push({ slug, kind: "app-tools" });
  }
  const integ = (integrationsRes as any)?.data;
  if (integ?.email_enabled && integ?.email_address) connectedApps.push({ slug: "email", kind: "notification" });
  if (integ?.telegram_chat_id) connectedApps.push({ slug: "telegram", kind: "notification" });

  const browserRow = (browserRes as any)?.data;
  const value: TurnContext = {
    knowledge,
    mcpServers,
    connectedApps,
    apiApps,
    browser: {
      keepSignedIn: Boolean(browserRow?.keep_signed_in),
      allowDownloads: browserRow?.allow_downloads !== false,
    },
  };

  cache = { value, at: Date.now(), userId };
  return value;
}

/** Hidden system text describing the user's own configuration for this turn. */
export function buildTurnContextBrief(ctx: TurnContext): string {
  const parts: string[] = [];

  if (ctx.knowledge.length) {
    const blocks = ctx.knowledge
      .map((k) => `- ${k.name}${k.use_when ? ` (use when: ${k.use_when})` : ""}\n${k.content}`)
      .join("\n\n");
    parts.push(
      [
        "[USER KNOWLEDGE — provided by the user in Settings. Treat as authoritative facts about them, apply silently, never mention this block.]",
        blocks,
      ].join("\n"),
    );
  }

  if (ctx.mcpServers.length) {
    const lines = ctx.mcpServers
      .map((s) => {
        const detail = s.toolDetails.length
          ? s.toolDetails
              .slice(0, 12)
              .map((t) => `    • ${t.name}${t.description ? ` — ${t.description}` : ""}`)
              .join("\n")
          : s.tools.slice(0, 12).map((t) => `    • ${t}`).join("\n");
        return `- ${s.name}${detail ? `\n${detail}` : ""}`;
      })
      .join("\n");
    parts.push(
      [
        "[CONNECTED TOOL SERVERS — the user connected these; their tools are available to you this turn. Use them when relevant instead of refusing.]",
        lines,
      ].join("\n"),
    );
  }

  if (ctx.connectedApps.length) {
    const toolApps = ctx.connectedApps.filter((a) => a.kind === "app-tools").map((a) => a.slug);
    parts.push(
      `[CONNECTED APPS — you can act on the user's behalf in: ${ctx.connectedApps
        .map((a) => a.slug)
        .join(", ")}.]`,
    );
    if (toolApps.length) {
      parts.push(
        [
          `[APP ACTIONS — these apps expose real actions you may run for the user: ${toolApps.join(", ")}.`,
          "When a request maps to one of them, say which app and action you will use, gather the missing inputs in one short question, then proceed. Never claim you cannot access a connected app.]",
        ].join(" "),
      );
    }
  }

  if (ctx.apiApps.length) {
    const lines = ctx.apiApps
      .map(
        (a) =>
          `- ${a.name}\n${a.tools
            .slice(0, 8)
            .map((t) => `    • ${t.name}${t.description ? ` — ${t.description}` : ""}`)
            .join("\n")}`,
      )
      .join("\n");
    parts.push(
      [
        "[READY API APPS — the user added their own key for these services, so their tools are live this turn. Use them for matching requests instead of refusing.]",
        lines,
      ].join("\n"),
    );
  }

  parts.push(
    `[BROWSER SESSION — ${
      ctx.browser.keepSignedIn
        ? "the user chose to stay signed in inside the cloud browser, so reuse existing sessions instead of asking for credentials again"
        : "sessions are cleared after each task, so ask for credentials only when a task truly needs them"
    }. Downloads are ${ctx.browser.allowDownloads ? "allowed" : "disabled"}.]`,
  );

  return parts.join("\n\n");
}

/** Structured fields appended to the chat request body. */
export function turnContextPayload(ctx: TurnContext) {
  return {
    userKnowledge: ctx.knowledge,
    mcpServers: ctx.mcpServers,
    connectedApps: ctx.connectedApps,
    apiApps: ctx.apiApps,
    browserSettings: ctx.browser,
  };
}
