/** @doc Local desktop bridge — pair a user PC and queue commands for it. */
import { supabase } from "@/integrations/supabase/client";

export type BridgeCapability = "shell" | "files" | "screen" | "input" | "browser";
export type PermissionMode = "ask" | "allowlist" | "auto";

export interface LocalDevice {
  id: string;
  name: string;
  os: string;
  hostname: string | null;
  status: string;
  pair_code: string | null;
  pair_expires_at: string | null;
  capabilities: Record<BridgeCapability, boolean>;
  permission_mode: PermissionMode;
  allowlist: string[];
  work_dir: string | null;
  last_seen_at: string | null;
  agent_version: string | null;
}

export interface LocalCommand {
  id: string;
  device_id: string;
  kind: string;
  payload: Record<string, unknown>;
  summary: string | null;
  status: string;
  result: Record<string, unknown> | null;
  error: string | null;
  origin: string;
  created_at: string;
}

const DEFAULT_CAPS: Record<BridgeCapability, boolean> = {
  shell: false,
  files: false,
  screen: false,
  input: false,
  browser: false,
};

/** A device is only considered live when its last poll landed within 90s. */
export function isOnline(device: LocalDevice): boolean {
  if (!device.last_seen_at) return false;
  return Date.now() - new Date(device.last_seen_at).getTime() < 90_000;
}

function normalize(row: Record<string, unknown>): LocalDevice {
  return {
    ...(row as unknown as LocalDevice),
    capabilities: { ...DEFAULT_CAPS, ...((row.capabilities ?? {}) as Record<BridgeCapability, boolean>) },
    allowlist: Array.isArray(row.allowlist) ? (row.allowlist as string[]).map(String) : [],
  };
}

export async function listDevices(): Promise<LocalDevice[]> {
  const { data, error } = await supabase
    .from("local_devices")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => normalize(row as Record<string, unknown>));
}

/** Unambiguous alphabet: no O/0/I/1 so a user can retype the code by hand. */
function pairCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

/** Creates a device slot with a 15-minute pairing code for the bridge to claim. */
export async function createDevice(name: string): Promise<LocalDevice> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("سجّل الدخول أولاً لربط جهازك.");

  const { data, error } = await supabase
    .from("local_devices")
    .insert({
      user_id: userId,
      name: name.trim() || "My PC",
      pair_code: pairCode(),
      pair_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      status: "unpaired",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return normalize(data as Record<string, unknown>);
}

export async function regeneratePairCode(deviceId: string): Promise<string> {
  const code = pairCode();
  const { error } = await supabase
    .from("local_devices")
    .update({
      pair_code: code,
      pair_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      token_hash: null,
      status: "unpaired",
    })
    .eq("id", deviceId);
  if (error) throw new Error(error.message);
  return code;
}

export async function updateDevice(
  deviceId: string,
  patch: Partial<Pick<LocalDevice, "name" | "capabilities" | "permission_mode" | "allowlist" | "work_dir">>,
): Promise<void> {
  const { error } = await supabase.from("local_devices").update(patch).eq("id", deviceId);
  if (error) throw new Error(error.message);
}

export async function deleteDevice(deviceId: string): Promise<void> {
  const { error } = await supabase.from("local_devices").delete().eq("id", deviceId);
  if (error) throw new Error(error.message);
}

export async function listCommands(deviceId: string, limit = 40): Promise<LocalCommand[]> {
  const { data, error } = await supabase
    .from("local_device_commands")
    .select("*")
    .eq("device_id", deviceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as LocalCommand[];
}

/** Queues a command; the bridge only picks it up once permissions allow it. */
export async function queueCommand(input: {
  deviceId: string;
  kind: string;
  payload: Record<string, unknown>;
  summary?: string;
  origin?: "user" | "agent";
}): Promise<LocalCommand> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("سجّل الدخول أولاً.");

  const { data, error } = await supabase
    .from("local_device_commands")
    .insert({
      device_id: input.deviceId,
      user_id: userId,
      kind: input.kind,
      payload: input.payload as never,
      summary: input.summary ?? null,
      origin: input.origin ?? "user",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as LocalCommand;
}

export async function decideCommand(commandId: string, approve: boolean): Promise<void> {
  const { error } = await supabase
    .from("local_device_commands")
    .update(approve ? { status: "approved" } : { status: "denied", error: "rejected_by_user" })
    .eq("id", commandId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);
}

/**
 * Waits for a queued command to settle. Used by the chat agent so a tool call
 * returns the real output of the user's machine instead of a fire-and-forget.
 */
export async function waitForCommand(commandId: string, timeoutMs = 180_000): Promise<LocalCommand> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await supabase
      .from("local_device_commands")
      .select("*")
      .eq("id", commandId)
      .maybeSingle();
    const row = data as unknown as LocalCommand | null;
    if (row && ["done", "failed", "denied"].includes(row.status)) return row;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("انتهت المدة قبل أن يرد الجهاز. تأكد إن برنامج الجسر شغال.");
}

/** Convenience wrapper: queue + wait, for a single agent tool round-trip. */
export async function runOnDevice(input: {
  deviceId: string;
  kind: string;
  payload: Record<string, unknown>;
  summary?: string;
  timeoutMs?: number;
}): Promise<LocalCommand> {
  const queued = await queueCommand({ ...input, origin: "agent" });
  return waitForCommand(queued.id, input.timeoutMs);
}
