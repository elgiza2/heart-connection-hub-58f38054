/** @doc device-bridge — pairing + command queue for the local Megsy desktop agent. */
/**
 * The desktop bridge is a small program the user installs on their own PC. It
 * never receives the account password: it pairs once with a short code, gets a
 * device token, and from then on only polls for commands the user (or the
 * agent, with the user's permission settings) queued for that one device.
 *
 * Every request from the bridge is authenticated with `device_id` + `token`,
 * checked against a SHA-256 hash stored on the row — the plaintext token only
 * ever exists on the user's machine.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/** Capability gate: which permission toggle each command kind needs. */
const CAPABILITY_OF: Record<string, string> = {
  shell: "shell",
  powershell: "shell",
  read_file: "files",
  write_file: "files",
  list_dir: "files",
  delete_file: "files",
  screenshot: "screen",
  mouse: "input",
  click: "input",
  type: "input",
  hotkey: "input",
  browser_open: "browser",
  browser_run: "browser",
  sysinfo: "shell",
};

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Auto-approval decision for a queued command, per the user's chosen mode. */
function autoApproves(
  device: { permission_mode: string; allowlist: unknown },
  kind: string,
  payload: Record<string, unknown>,
): boolean {
  if (device.permission_mode === "auto") return true;
  if (device.permission_mode !== "allowlist") return false;
  // Allowlist mode: read-only kinds run freely, plus any command whose text
  // starts with an entry the user explicitly allowed.
  if (["read_file", "list_dir", "screenshot", "sysinfo"].includes(kind)) return true;
  const list = Array.isArray(device.allowlist) ? device.allowlist.map(String) : [];
  const text = String(payload.command ?? payload.path ?? payload.url ?? "");
  return list.some((entry) => entry.length > 1 && text.trim().startsWith(entry.trim()));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ error: "invalid_json" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const action = String(body.action ?? "");

  // ---------------------------------------------------------------- pairing
  if (action === "pair") {
    const code = String(body.code ?? "").trim().toUpperCase();
    if (code.length < 6) return json({ error: "invalid_code" }, 400);

    const { data: device } = await admin
      .from("local_devices")
      .select("id, user_id, pair_expires_at, name")
      .eq("pair_code", code)
      .maybeSingle();

    if (!device) return json({ error: "code_not_found" }, 404);
    if (device.pair_expires_at && new Date(device.pair_expires_at) < new Date()) {
      return json({ error: "code_expired" }, 410);
    }

    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    await admin
      .from("local_devices")
      .update({
        token_hash: await sha256(token),
        pair_code: null,
        pair_expires_at: null,
        status: "online",
        hostname: body.hostname ? String(body.hostname) : null,
        agent_version: body.agent_version ? String(body.agent_version) : null,
        os: body.os ? String(body.os) : "windows",
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", device.id);

    return json({ device_id: device.id, token, name: device.name });
  }

  // ------------------------------------------------------- device auth gate
  const deviceId = String(body.device_id ?? "");
  const token = String(body.token ?? "");
  if (!deviceId || !token) return json({ error: "unauthorized" }, 401);

  const { data: device } = await admin
    .from("local_devices")
    .select("id, user_id, token_hash, capabilities, permission_mode, allowlist, work_dir")
    .eq("id", deviceId)
    .maybeSingle();

  if (!device?.token_hash || device.token_hash !== (await sha256(token))) {
    return json({ error: "unauthorized" }, 401);
  }

  const caps = (device.capabilities ?? {}) as Record<string, boolean>;

  // ------------------------------------------------------------------ poll
  if (action === "poll") {
    await admin
      .from("local_devices")
      .update({ status: "online", last_seen_at: new Date().toISOString() })
      .eq("id", device.id);

    const { data: rows } = await admin
      .from("local_device_commands")
      .select("id, kind, payload, status")
      .eq("device_id", device.id)
      .in("status", ["pending", "approved"])
      .order("created_at", { ascending: true })
      .limit(5);

    const ready: Array<{ id: string; kind: string; payload: Record<string, unknown> }> = [];

    for (const row of rows ?? []) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      const needed = CAPABILITY_OF[row.kind];

      // The permission toggles live server-side so a stale bridge build can
      // never widen what the user allowed.
      if (!needed || caps[needed] !== true) {
        await admin
          .from("local_device_commands")
          .update({ status: "denied", error: `capability_disabled:${needed ?? row.kind}` })
          .eq("id", row.id);
        continue;
      }

      if (row.status === "pending" && !autoApproves(device, row.kind, payload)) continue;

      await admin.from("local_device_commands").update({ status: "running" }).eq("id", row.id);
      ready.push({ id: row.id, kind: row.kind, payload });
    }

    return json({
      commands: ready,
      work_dir: device.work_dir,
      capabilities: caps,
      permission_mode: device.permission_mode,
    });
  }

  // ---------------------------------------------------------------- report
  if (action === "report") {
    const commandId = String(body.command_id ?? "");
    if (!commandId) return json({ error: "missing_command_id" }, 400);
    const failed = Boolean(body.error);
    await admin
      .from("local_device_commands")
      .update({
        status: failed ? "failed" : "done",
        result: (body.result ?? null) as Record<string, unknown> | null,
        error: failed ? String(body.error) : null,
      })
      .eq("id", commandId)
      .eq("device_id", device.id);
    return json({ ok: true });
  }

  // ------------------------------------------------------------- disconnect
  if (action === "offline") {
    await admin.from("local_devices").update({ status: "offline" }).eq("id", device.id);
    return json({ ok: true });
  }

  return json({ error: "unknown_action" }, 400);
});
