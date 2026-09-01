/** @doc Server-only core for the Freestyle key pool on the /m admin page. Same password gate as the Manus pool. */
import { createClient } from "@supabase/supabase-js";
import { createHash, timingSafeEqual } from "node:crypto";

export type DevAdminAction = "login" | "list" | "add" | "update_status" | "delete";

export interface DevAdminPayload {
  action?: DevAdminAction;
  password?: string;
  api_key?: string;
  label?: string;
  notes?: string;
  id?: string;
  status?: string;
}

export interface DevAdminResult {
  status: number;
  body: Record<string, unknown>;
}

const VALID_STATUS = new Set(["active", "disabled", "exhausted"]);

function passwordMatches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 10) return "••••••";
  return `${key.slice(0, 5)}••••${key.slice(-4)}`;
}

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase server credentials are not configured");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function handleDevAdmin(
  payload: DevAdminPayload | null,
  expectedPassword: string | undefined,
): Promise<DevAdminResult> {
  if (!expectedPassword) {
    return { status: 500, body: { error: "M_ADMIN_PASSWORD is not configured" } };
  }
  if (!payload?.action) return { status: 400, body: { error: "Missing action" } };

  const provided = payload.password ?? "";
  if (!provided || !passwordMatches(provided, expectedPassword)) {
    await new Promise((r) => setTimeout(r, 400));
    return { status: 401, body: { error: "unauthorized" } };
  }

  if (payload.action === "login") return { status: 200, body: { ok: true } };

  const supabase = adminClient();

  switch (payload.action) {
    case "list": {
      const { data, error } = await supabase
        .from("freestyle_keys")
        .select(
          "id,label,status,failure_count,success_count,last_error,last_used_at,cooldown_until,notes,priority,created_at,api_key",
        )
        .order("created_at", { ascending: false });
      if (error) return { status: 500, body: { error: error.message } };
      const keys = (data ?? []).map((row) => ({
        ...row,
        api_key: maskKey(String((row as { api_key?: string }).api_key ?? "")),
      }));
      return { status: 200, body: { keys } };
    }

    case "add": {
      const apiKey = (payload.api_key ?? "").trim();
      if (!apiKey) return { status: 400, body: { error: "Missing api_key" } };
      const { error } = await supabase.from("freestyle_keys").insert({
        api_key: apiKey,
        label: payload.label?.trim() || null,
        notes: payload.notes?.trim() || null,
        status: "active",
      });
      if (error) return { status: 500, body: { error: error.message } };
      return { status: 200, body: { ok: true } };
    }

    case "update_status": {
      if (!payload.id || !payload.status) return { status: 400, body: { error: "Missing id/status" } };
      if (!VALID_STATUS.has(payload.status)) return { status: 400, body: { error: "Invalid status" } };
      const patch: Record<string, unknown> = {
        status: payload.status,
        updated_at: new Date().toISOString(),
      };
      if (payload.status === "active") {
        patch.failure_count = 0;
        patch.last_error = null;
        patch.cooldown_until = null;
      }
      const { error } = await supabase.from("freestyle_keys").update(patch).eq("id", payload.id);
      if (error) return { status: 500, body: { error: error.message } };
      return { status: 200, body: { ok: true } };
    }

    case "delete": {
      if (!payload.id) return { status: 400, body: { error: "Missing id" } };
      const { error } = await supabase.from("freestyle_keys").delete().eq("id", payload.id);
      if (error) return { status: 500, body: { error: error.message } };
      return { status: 200, body: { ok: true } };
    }

    default:
      return { status: 400, body: { error: "Unknown action" } };
  }
}
