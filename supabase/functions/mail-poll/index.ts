/** @doc mail-poll — IMAP poller fanning catch-all mail into user mailboxes. */
/**
 * Polls the Hostinger catch-all mailbox over IMAP and fans each message out to
 * the matching Megsy mailbox (`username@megsyai.com`) in `mail_messages`.
 *
 * Call it from a cron or manually: POST {} with the x-mail-secret header
 * (MAIL_INBOUND_SECRET) or a service-role Authorization header.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ImapClient, parseMail } from "../_shared/imap.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-mail-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const SPAM_WORDS = [
  "viagra", "lottery", "winner", "crypto giveaway", "free money", "wire transfer",
  "bitcoin doubler", "inheritance", "click here now", "nigerian prince", "casino",
];

function scoreSpam(subject: string, body: string, from: string): number {
  const text = `${subject} ${body}`.toLowerCase();
  let score = 0;
  for (const w of SPAM_WORDS) if (text.includes(w)) score += 25;
  const links = (text.match(/https?:\/\//g) || []).length;
  if (links > 6) score += 20;
  if (/[A-Z]{12,}/.test(subject)) score += 10;
  if (!from.includes("@")) score += 30;
  return Math.min(100, score);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secret = Deno.env.get("MAIL_INBOUND_SECRET");
  const auth = req.headers.get("Authorization") || "";
  const okSecret = secret && req.headers.get("x-mail-secret") === secret;
  const okService = auth.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "\u0000");
  let okUser = false;
  if (!okSecret && !okService && auth.startsWith("Bearer ")) {
    const { data } = await admin.auth.getUser(auth.replace("Bearer ", ""));
    okUser = Boolean(data?.user);
  }
  if (!okSecret && !okService && !okUser) return json({ error: "unauthorized" }, 401);


  const host = Deno.env.get("IMAP_HOST");
  const user = Deno.env.get("IMAP_USER");
  const pass = Deno.env.get("IMAP_PASS");
  if (!host || !user || !pass) return json({ error: "imap not configured" }, 400);

  const client = new ImapClient({
    host,
    port: Number(Deno.env.get("IMAP_PORT") ?? "993"),
    user,
    pass,
  });

  let stored = 0;
  let skipped = 0;
  try {
    await client.connect();
    await client.login();
    await client.selectInbox();
    const seqs = (await client.searchUnseen()).slice(-40);

    for (const seq of seqs) {
      let mail;
      try {
        mail = parseMail(await client.fetchRaw(seq));
      } catch {
        skipped++;
        continue;
      }

      const { data: box } = await admin
        .from("mailboxes")
        .select("*")
        .eq("address", mail.to)
        .maybeSingle();

      if (!box || box.external_enabled === false) {
        skipped++;
        await client.markSeen(seq).catch(() => {});
        continue;
      }

      if (mail.messageId) {
        const { data: dupe } = await admin
          .from("mail_messages")
          .select("id")
          .eq("external_message_id", mail.messageId)
          .maybeSingle();
        if (dupe) {
          skipped++;
          await client.markSeen(seq).catch(() => {});
          continue;
        }
      }

      const spam = scoreSpam(mail.subject, mail.text, mail.from);
      const { error } = await admin.from("mail_messages").insert({
        mailbox_id: box.id,
        user_id: box.user_id,
        folder: spam >= 50 ? "spam" : "inbox",
        direction: "in",
        from_address: mail.from,
        from_name: mail.fromName,
        to_address: mail.to,
        subject: mail.subject,
        body_text: mail.text,
        body_html: mail.html,
        snippet: (mail.text || mail.subject).replace(/\s+/g, " ").trim().slice(0, 160),
        spam_score: spam,
        origin: "external",
        external_message_id: mail.messageId,
      });
      if (error) {
        skipped++;
        continue;
      }
      stored++;
      await client.markSeen(seq).catch(() => {});
    }
  } catch (e) {
    await client.logout();
    return json({ error: e instanceof Error ? e.message : "imap error" }, 500);
  }
  await client.logout();

  return json({ ok: true, stored, skipped });
});
