/** @doc Client for the Megsy internal mail system (username@megsyai.com). */
import { supabase } from "@/integrations/supabase/client";

export const MAIL_DOMAIN = "megsyai.com";

export type MailFolder = "inbox" | "sent" | "spam" | "trash" | "drafts";

export interface Mailbox {
  id: string;
  user_id: string;
  username: string;
  address: string;
  display_name: string | null;
  external_enabled: boolean;
  ai_enabled: boolean;
}

export interface MailMessage {
  id: string;
  folder: MailFolder;
  direction: "in" | "out";
  from_address: string;
  from_name: string | null;
  to_address: string;
  subject: string;
  body_text: string;
  body_html: string | null;
  snippet: string;
  is_read: boolean;
  is_starred: boolean;
  spam_score: number;
  origin: "user" | "ai" | "external" | "system";
  delivery_status: string;
  created_at: string;
}

async function invokeMail<T>(body: Record<string, unknown>): Promise<T> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("not authenticated");
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mail`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
    },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((payload as { error?: string }).error || `mail failed (${res.status})`);
  return payload as T;
}

/** Create the mailbox on first use and return it. */
export async function ensureMailbox(): Promise<Mailbox> {
  const { data, error } = await supabase.rpc("ensure_my_mailbox");
  if (!error && data) return (Array.isArray(data) ? data[0] : data) as Mailbox;
  const res = await invokeMail<{ mailbox: Mailbox }>({ action: "ensure" });
  return res.mailbox;
}

/** Pull new external mail from the Hostinger catch-all into the inbox. */
export async function pollInbox(): Promise<{ stored: number; skipped: number } | null> {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return null;
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mail-poll`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      },
      body: JSON.stringify({}),
    });
    if (!res.ok) return null;
    return (await res.json()) as { stored: number; skipped: number };
  } catch {
    return null;
  }
}

export async function listMail(folder: MailFolder, limit = 100): Promise<MailMessage[]> {

  const { data, error } = await supabase
    .from("mail_messages")
    .select("*")
    .eq("folder", folder)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as unknown as MailMessage[];
}

export async function unreadCount(): Promise<number> {
  const { count } = await supabase
    .from("mail_messages")
    .select("id", { count: "exact", head: true })
    .eq("folder", "inbox")
    .eq("is_read", false);
  return count || 0;
}

export async function markRead(id: string, read = true) {
  await supabase.from("mail_messages").update({ is_read: read }).eq("id", id);
}

export async function moveTo(id: string, folder: MailFolder) {
  await supabase.from("mail_messages").update({ folder }).eq("id", id);
}

export async function deleteForever(id: string) {
  await supabase.from("mail_messages").delete().eq("id", id);
}

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** "ai" marks messages the assistant sent on the user's behalf. */
  origin?: "user" | "ai";
}

export async function sendMail(input: SendMailInput) {
  return invokeMail<{ ok: boolean; status: string; delivered_to: string | null }>({
    action: "send",
    ...input,
  });
}

export function isInternalAddress(addr: string) {
  return addr.trim().toLowerCase().endsWith(`@${MAIL_DOMAIN}`);
}
