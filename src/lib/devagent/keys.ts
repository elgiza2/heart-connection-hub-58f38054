/**
 * @doc Server-only Freestyle API key pool: selection, rotation and failure
 * accounting. Mirrors the `manus_keys` pattern so the same admin page can
 * manage both pools. Never import this from client code.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface FreestyleKeyRow {
  id: string;
  api_key: string;
  status: string;
  failure_count: number | null;
  cooldown_until: string | null;
  last_used_at: string | null;
  priority: number | null;
}

export function devAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase server credentials are not configured");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/** Active keys, highest priority then least-recently-used, skipping cooldowns. */
export async function availableFreestyleKeys(supabase: SupabaseClient): Promise<FreestyleKeyRow[]> {
  const { data } = await supabase
    .from("freestyle_keys")
    .select("id,api_key,status,failure_count,cooldown_until,last_used_at,priority")
    .eq("status", "active");

  // Shared pool added from the /k page (provider "f").
  const { data: pool } = await supabase
    .from("provider_api_keys")
    .select("id,api_key,status,failure_count,last_used_at")
    .eq("provider", "f")
    .eq("status", "active");

  const poolRows: FreestyleKeyRow[] = ((pool ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: `pool:${String(r.id)}`,
    api_key: String(r.api_key ?? ""),
    status: "active",
    failure_count: Number(r.failure_count ?? 0),
    cooldown_until: null,
    last_used_at: (r.last_used_at as string | null) ?? null,
    priority: 0,
  }));

  const now = Date.now();
  const rows = [...((data ?? []) as FreestyleKeyRow[]), ...poolRows]
    .filter((k) => !k.cooldown_until || new Date(k.cooldown_until).getTime() <= now)
    .sort((a, b) => {
      const pa = a.priority ?? 0;
      const pb = b.priority ?? 0;
      if (pa !== pb) return pb - pa;
      const ta = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
      const tb = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
      return ta - tb;
    });

  // Env-configured fallback key (no DB row) so the agent works before any key
  // is added from the admin page.
  const envKey = process.env.FREESTYLE_API_KEY;
  if (envKey) {
    rows.push({
      id: "env",
      api_key: envKey,
      status: "active",
      failure_count: 0,
      cooldown_until: null,
      last_used_at: null,
      priority: -1,
    });
  }
  return rows;
}

export async function markFreestyleFailure(
  supabase: SupabaseClient,
  key: FreestyleKeyRow,
  status: number,
  message: string,
  retryAfterSec?: number,
): Promise<void> {
  if (key.id === "env") return;

  if (key.id.startsWith("pool:")) {
    const patch: Record<string, unknown> = {
      failure_count: (key.failure_count ?? 0) + 1,
      last_error: `${status}: ${message}`.slice(0, 500),
    };
    if (status === 401 || status === 402 || status === 403) patch.status = "blocked";
    await supabase.from("provider_api_keys").update(patch).eq("id", key.id.slice(5));
    return;
  }

  const patch: Record<string, unknown> = {
    failure_count: (key.failure_count ?? 0) + 1,
    last_error: `${status}: ${message}`.slice(0, 500),
    updated_at: new Date().toISOString(),
  };
  if (status === 402 || status === 403) patch.status = "exhausted";
  else if (status === 401) patch.status = "disabled";
  else if (status === 429) {
    patch.cooldown_until = new Date(Date.now() + (retryAfterSec ?? 120) * 1000).toISOString();
  } else {
    patch.cooldown_until = new Date(Date.now() + 30_000).toISOString();
  }
  await supabase.from("freestyle_keys").update(patch).eq("id", key.id);
}

export async function markFreestyleSuccess(
  supabase: SupabaseClient,
  key: FreestyleKeyRow,
): Promise<void> {
  if (key.id === "env") return;

  if (key.id.startsWith("pool:")) {
    await supabase
      .from("provider_api_keys")
      .update({ last_used_at: new Date().toISOString(), failure_count: 0 })
      .eq("id", key.id.slice(5));
    return;
  }

  await supabase
    .from("freestyle_keys")
    .update({
      last_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      failure_count: 0,
    })
    .eq("id", key.id);
}
