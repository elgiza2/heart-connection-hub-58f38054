/**
 * @doc Login identities the agent creates for the user.
 *
 * The agent never invents an address: it always signs up with the user's own
 * Megsy mailbox (`username@megsyai.com`), generates a clean strong password, and
 * saves the pair here so it shows up in Settings → Passwords and can be reused
 * the next time the same site comes up.
 */
import { supabase } from "@/integrations/supabase/client";
import { ensureMailbox } from "@/lib/mail/mailClient";

export interface AgentCredential {
  id: string;
  site: string;
  site_url: string | null;
  login_email: string;
  username: string | null;
  password: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGIT = "23456789";
const SYMBOL = "!@#$%*?-_";

/** A clean password: readable, no ambiguous glyphs, always mixed-class. */
export function generatePassword(length = 16): string {
  const all = UPPER + LOWER + DIGIT + SYMBOL;
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  const pick = (set: string, i: number) => set[bytes[i] % set.length];
  const chars = [pick(UPPER, 0), pick(LOWER, 1), pick(DIGIT, 2), pick(SYMBOL, 3)];
  for (let i = 4; i < length; i += 1) chars.push(pick(all, i));
  // Fisher–Yates with fresh randomness so the class prefix isn't predictable.
  const mix = new Uint32Array(chars.length);
  crypto.getRandomValues(mix);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = mix[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** Normalises "https://www.Site.com/signup" → "site.com". */
export function siteKey(input: string): string {
  const raw = String(input || "").trim().toLowerCase();
  if (!raw) return "unknown";
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return raw.slice(0, 80);
  }
}

/**
 * Returns the identity to sign up / sign in with for a site, creating and
 * persisting it on first use. Reusing the stored row is what makes the agent
 * able to come back to a site later without asking the user anything.
 */
export async function loginIdentityFor(
  site: string,
  opts: { url?: string | null; notes?: string | null } = {},
): Promise<{ email: string; password: string; site: string; reused: boolean }> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("سجّل الدخول أولاً");

  const key = siteKey(site);
  const { data: existing } = await supabase
    .from("agent_credentials")
    .select("*")
    .eq("user_id", userId)
    .eq("site", key)
    .maybeSingle();
  if (existing) {
    const row = existing as unknown as AgentCredential;
    return { email: row.login_email, password: row.password, site: key, reused: true };
  }

  const mailbox = await ensureMailbox();
  const password = generatePassword();
  await supabase.from("agent_credentials").insert({
    user_id: userId,
    site: key,
    site_url: opts.url ?? null,
    login_email: mailbox.address,
    username: mailbox.username,
    password,
    notes: opts.notes ?? null,
    created_by: "agent",
  } as never);
  return { email: mailbox.address, password, site: key, reused: false };
}

export async function listCredentials(): Promise<AgentCredential[]> {
  const { data } = await supabase
    .from("agent_credentials")
    .select("*")
    .order("updated_at", { ascending: false });
  return (data ?? []) as unknown as AgentCredential[];
}

export async function saveCredential(input: {
  id?: string;
  site: string;
  site_url?: string | null;
  login_email: string;
  password: string;
  notes?: string | null;
}): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("سجّل الدخول أولاً");
  const row = {
    user_id: userId,
    site: siteKey(input.site),
    site_url: input.site_url ?? null,
    login_email: input.login_email,
    password: input.password,
    notes: input.notes ?? null,
    created_by: "user",
  };
  if (input.id) {
    await supabase.from("agent_credentials").update(row as never).eq("id", input.id);
    return;
  }
  await supabase
    .from("agent_credentials")
    .upsert(row as never, { onConflict: "user_id,site" });
}

export async function deleteCredential(id: string): Promise<void> {
  await supabase.from("agent_credentials").delete().eq("id", id);
}
