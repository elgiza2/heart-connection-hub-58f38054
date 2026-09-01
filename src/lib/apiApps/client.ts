/** @doc Browser helper for ready-made API apps (bring your own key).
 *
 *  Keys live in `user_api_apps` (per account, RLS protected) and requests are
 *  executed server-side so the key never leaves the backend at call time.
 */
import { supabase } from "@/integrations/supabase/client";
import { notifyTurnContextChanged } from "@/lib/chat/turnContext";

export type ApiAppRow = {
  id: string;
  app_id: string;
  key_hint: string;
  enabled: boolean;
  display_name?: string | null;
  logo_url?: string | null;
  spec?: any;
};

export async function listApiApps(): Promise<ApiAppRow[]> {
  const { data, error } = await supabase
    .from("user_api_apps")
    .select("id, app_id, key_hint, enabled, display_name, logo_url, spec")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as ApiAppRow[]) ?? [];
}

/** Save several named credentials (each service asks for its own fields). */
export async function saveApiAppCredentials(
  appId: string,
  values: Record<string, string>,
  extra?: { name?: string; logo?: string; spec?: unknown },
): Promise<void> {
  const entries = Object.entries(values)
    .map(([name, value]) => [name, value.trim()] as const)
    .filter(([, value]) => value.length > 0);
  if (entries.length === 0) throw new Error("Fill in the credentials");
  const last = entries[entries.length - 1][1];
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Sign in to add credentials");
  const { error } = await supabase.from("user_api_apps").upsert(
    {
      user_id: uid,
      app_id: appId,
      key_value: JSON.stringify(Object.fromEntries(entries)),
      key_hint: `••••${last.slice(-4)}`,
      enabled: true,
      display_name: extra?.name ?? null,
      logo_url: extra?.logo ?? null,
      spec: (extra?.spec ?? null) as any,
    },
    { onConflict: "user_id,app_id" },
  );
  if (error) throw new Error(error.message);
  notifyTurnContextChanged();
}

export async function saveApiAppKey(
  appId: string,
  key: string,
  extra?: { name?: string; logo?: string; spec?: unknown },
): Promise<void> {
  const trimmed = key.trim();
  if (trimmed.length < 6) throw new Error("Enter a valid key");
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Sign in to add a key");
  const { error } = await supabase.from("user_api_apps").upsert(
    {
      user_id: uid,
      app_id: appId,
      key_value: trimmed,
      key_hint: `••••${trimmed.slice(-4)}`,
      enabled: true,
      display_name: extra?.name ?? null,
      logo_url: extra?.logo ?? null,
      spec: (extra?.spec ?? null) as any,
    },
    { onConflict: "user_id,app_id" },
  );
  if (error) throw new Error(error.message);
  notifyTurnContextChanged();
}


export async function removeApiApp(appId: string): Promise<void> {
  const { error } = await supabase.from("user_api_apps").delete().eq("app_id", appId);
  if (error) throw new Error(error.message);
  notifyTurnContextChanged();
}

export async function setApiAppEnabled(appId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.from("user_api_apps").update({ enabled }).eq("app_id", appId);
  if (error) throw new Error(error.message);
  notifyTurnContextChanged();
}

/** Run one endpoint of a connected API app through the backend. */
export async function runApiTool(
  appId: string,
  tool: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  const { findApiAppAsync } = await import("./catalog");
  const app = await findApiAppAsync(appId);
  const spec = app?.tools.find((t) => t.name === tool);
  if (!app || !spec) throw new Error("Unknown action");
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error("Sign in to run this action");
  const { data, error } = await supabase.functions.invoke<any>("anything-api", {
    body: {
      kind: "api_app",
      action: "run",
      token,
      app: appId,
      tool,
      params,
      spec: {
        baseUrl: app.baseUrl,
        auth: app.auth ?? null,
        authTemplate: app.authTemplate ?? null,
        basic: app.basic ?? false,
        tool: spec,
      },
    },
  });
  if (error && !data) throw new Error(error.message || "Request failed");
  if (data?.ok === false) throw new Error(data?.error || "Request failed");
  return data?.result;
}

