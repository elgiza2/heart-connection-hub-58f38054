import { supabase } from "@/integrations/supabase/client";
import type { Integration } from "@/lib/integrationsData";

export type IntegrationMeta = Record<string, any>;

export interface IntegrationConnectionSnapshot {
  connectedApps: Record<string, boolean>;
  appMeta: Record<string, IntegrationMeta>;
  providerWarning?: string | null;
}

const accountSlug = (account: any) =>
  account?.app_slug ?? account?.app?.name_slug ?? account?.app?.slug ?? account?.appSlug;

export async function requireSignedInUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Please sign in first");
  return data.user;
}

export async function loadIntegrationConnections(
  catalog: Integration[],
): Promise<IntegrationConnectionSnapshot> {
  const user = await requireSignedInUser();
  const needsPipedream = catalog.some((integration) => integration.type === "pipedream" && integration.pipedreamSlug);
  const needsGithub = catalog.some((integration) => integration.type === "oauth" && integration.app === "github");
  const needsLocalIntegrations = catalog.some((integration) => integration.app === "email" || integration.app === "telegram");
  const needsComposio = catalog.some((integration) => integration.type !== "pipedream" && integration.type !== "oauth" && integration.app !== "email" && integration.app !== "telegram");
  const [pd, gh, userIntegrations, composio] = await Promise.allSettled([
    needsPipedream
      ? supabase.functions.invoke("pipedream-connect", { body: { action: "list_accounts" } })
      : Promise.resolve({ data: null, error: null }),
    needsGithub
      ? supabase.functions.invoke("github-push", { body: { action: "status" } })
      : Promise.resolve({ data: null, error: null }),
    needsLocalIntegrations
      ? supabase
      .from("user_integrations")
      .select("email_enabled,email_address,telegram_chat_id,telegram_username")
      .eq("user_id", user.id)
      .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    needsComposio
      ? supabase.from("composio_connections").select("app_slug,status,connected_account_id").eq("user_id", user.id)
      : Promise.resolve({ data: null, error: null }),
  ]);

  const connectedApps: Record<string, boolean> = {};
  const appMeta: Record<string, IntegrationMeta> = {};

  if (gh.status === "fulfilled" && !gh.value.error && gh.value.data?.connected) {
    connectedApps.github = true;
    appMeta.github = gh.value.data.account ?? { account_name: gh.value.data.account_name };
  }

  const pdData = pd.status === "fulfilled" && !pd.value.error ? pd.value.data : null;
  const pdAccounts = Array.isArray(pdData?.accounts) ? pdData.accounts : [];
  const slugs = new Map<string, any>();
  for (const account of pdAccounts) {
    const slug = accountSlug(account);
    if (slug) slugs.set(String(slug), account);
  }

  const composioRows =
    composio.status === "fulfilled" && !composio.value.error && Array.isArray(composio.value.data)
      ? composio.value.data
      : [];
  for (const row of composioRows) {
    if (row?.app_slug && row.status !== "disconnected") {
      connectedApps[row.app_slug] = true;
      appMeta[row.app_slug] = row;
    }
  }

  for (const integration of catalog) {
    if (integration.type !== "pipedream" || !integration.pipedreamSlug) continue;
    const account = slugs.get(integration.pipedreamSlug);
    if (account) {
      connectedApps[integration.app] = true;
      appMeta[integration.app] = account;
    }
  }

  if (userIntegrations.status === "fulfilled" && !userIntegrations.value.error && userIntegrations.value.data) {
    const row = userIntegrations.value.data;
    if (row.email_enabled || row.email_address) {
      connectedApps.email = true;
      appMeta.email = row;
    }
    if (row.telegram_chat_id || row.telegram_username) {
      connectedApps.telegram = true;
      appMeta.telegram = row;
    }
  }

  return { connectedApps, appMeta, providerWarning: pdData?.provider_warning ?? null };
}

export async function startIntegrationConnection(integration: Integration) {
  await requireSignedInUser();
  if (integration.type === "oauth" && integration.app === "github") {
    const { data, error } = await supabase.functions.invoke("oauth-github-connect", {
      body: { action: "start", redirect_to: window.location.href, redirect_origin: window.location.origin },
    });
    if (data?.configured === false) {
      throw new Error(`${integration.name} is not configured on the backend yet`);
    }
    if (data?.connected) {
      return { mode: "local" as const };
    }
    if (error || data?.error || !data?.authorize_url) {
      throw new Error(data?.error || error?.message || `${integration.name} OAuth is not configured`);
    }
    const popup = window.open(data.authorize_url, `${integration.app}-oauth`, "popup,width=720,height=820");
    if (!popup) throw new Error("Popup blocked. Allow popups and try again.");
    return { mode: "oauth" as const, popup };
  }

  if (integration.type === "pipedream" && integration.pipedreamSlug) {
    // Prefer the tool runtime's own link session so connected apps can run actions.
    let linkUrl: string | null = null;
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (token) {
      const { data: viaTools } = await supabase.functions.invoke<{
        ok?: boolean;
        connect_link_url?: string;
      }>("anything-api", {
        body: {
          kind: "tools",
          action: "connect",
          token,
          redirect_origin: window.location.origin,
        },
      });
      if (viaTools?.connect_link_url) linkUrl = viaTools.connect_link_url;
    }

    if (!linkUrl) {
      const { data, error } = await supabase.functions.invoke("pipedream-connect", {
        body: { action: "create_token", redirect_origin: window.location.origin },
      });
      if (data?.configured === false) {
        throw new Error("App connections are not configured on the backend yet");
      }
      if (error || data?.error || !data?.connect_link_url) {
        throw new Error(data?.error || error?.message || "App connections are not configured");
      }
      linkUrl = data.connect_link_url as string;
    }

    const url = new URL(linkUrl);
    url.searchParams.set("app", integration.pipedreamSlug);
    const popup = window.open(
      url.toString(),
      "pipedream-connect",
      "popup,width=720,height=820",
    );
    if (!popup) throw new Error("Popup blocked. Allow popups and try again.");
    return { mode: "pipedream" as const, popup };
  }


  if (integration.app === "email") {
    const user = await requireSignedInUser();
    const { error } = await supabase.from("user_integrations").upsert(
      { user_id: user.id, email_enabled: true, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    if (error) throw error;
    return { mode: "local" as const };
  }

  throw new Error(`${integration.name} has no available backend connector yet`);
}

export async function disconnectIntegration(integration: Integration) {
  await requireSignedInUser();
  if (integration.type === "oauth" && integration.app === "github") {
    const { data, error } = await supabase.functions.invoke("github-push", { body: { action: "disconnect" } });
    if (error || data?.error) throw new Error(data?.error || error?.message || "GitHub disconnect failed");
    return;
  }
  if (integration.type === "pipedream" && integration.pipedreamSlug) {
    const { data, error } = await supabase.functions.invoke("pipedream-connect", {
      body: { action: "disconnect", app_slug: integration.pipedreamSlug },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message || "Disconnect failed");
    return;
  }
  if (integration.app === "email") {
    const user = await requireSignedInUser();
    const { error } = await supabase
      .from("user_integrations")
      .update({ email_enabled: false, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);
    if (error) throw error;
  }
}

/**
 * Polls the backend after opening an OAuth popup. `refresh` must return
 * `true` once the integration is confirmed connected. After the popup posts
 * a success message (or closes), we keep polling for a short window so
 * providers like Pipedream have time to make the newly-linked account
 * queryable — otherwise the UI would flip back to "Connect".
 */
export async function waitForConnectionRefresh(
  refresh: () => Promise<boolean>,
  popup?: Window | null,
) {
  let signalled = false;
  let lastMessage: string | null = null;
  const onMessage = (event: MessageEvent) => {
    const payload = event.data;
    if (!payload || typeof payload !== "object") return;
    if (!["github-oauth", "supabase-oauth", "pipedream-oauth"].includes(String(payload.type))) return;
    if (payload.ok === false) lastMessage = String(payload.message ?? "Connection failed");
    signalled = true;
  };
  window.addEventListener("message", onMessage);
  try {
    // Phase 1: wait for popup to signal (message or closed). Up to 3 min.
    for (let attempt = 0; attempt < 72; attempt += 1) {
      await new Promise((r) => window.setTimeout(r, 2500));
      if (lastMessage) throw new Error(lastMessage);
      const ok = await refresh().catch(() => false);
      if (ok) return;
      if (signalled || popup?.closed) break;
    }
    if (lastMessage) throw new Error(lastMessage);
    // Phase 2: popup closed / posted success — poll harder for provider sync.
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((r) => window.setTimeout(r, 1500));
      const ok = await refresh().catch(() => false);
      if (ok) return;
    }
  } finally {
    window.removeEventListener("message", onMessage);
  }
}