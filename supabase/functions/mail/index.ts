/** @doc mail — Megsy internal mail service (send, list, mailbox provisioning). */
/**
 * Megsy internal mail service.
 *
 * Actions (POST JSON { action, ... }):
 *  - ensure          → make sure the caller has a mailbox, return it
 *  - send            → deliver a message (internal @megsyai.com = instant,
 *                      external = queued until an outbound provider is wired)
 *  - inbound         → webhook for an inbound provider (Cloudflare Email
 *                      Routing worker / Resend inbound). Requires the
 *                      MAIL_INBOUND_SECRET header.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendSmtp, smtpConfigured } from "../_shared/smtp.ts";
import { renderBrandEmail } from "../_shared/email-templates/brand.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-mail-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAIL_DOMAIN = "megsyai.com";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SPAM_WORDS = [
  "viagra",
  "lottery",
  "winner",
  "crypto giveaway",
  "free money",
  "wire transfer",
  "bitcoin doubler",
  "inheritance",
  "click here now",
  "nigerian prince",
  "verify your account immediately",
  "casino",
  "porn",
  "sex chat",
];

/** Crude but predictable spam heuristic (0-100). */
function scoreSpam(subject: string, body: string, from: string): number {
  const text = `${subject} ${body}`.toLowerCase();
  let score = 0;
  for (const w of SPAM_WORDS) if (text.includes(w)) score += 25;
  const links = (text.match(/https?:\/\//g) || []).length;
  if (links > 6) score += 20;
  if (/[A-Z]{12,}/.test(subject)) score += 10;
  if (!from.includes("@")) score += 30;
  if (subject.trim() === "" && body.trim().length < 12) score += 15;
  return Math.min(100, score);
}

function snippetOf(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 160);
}

function isInternal(addr: string) {
  return addr.trim().toLowerCase().endsWith(`@${MAIL_DOMAIN}`);
}

async function boxByAddress(address: string) {
  const { data } = await admin
    .from("mailboxes")
    .select("*")
    .eq("address", address.trim().toLowerCase())
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const action = String(payload.action || "");

  // ---------------------------------------------------------------- inbound
  if (action === "inbound") {
    const secret = Deno.env.get("MAIL_INBOUND_SECRET");
    if (!secret || req.headers.get("x-mail-secret") !== secret) {
      return json({ error: "unauthorized" }, 401);
    }
    const to = String(payload.to || "").toLowerCase();
    const from = String(payload.from || "").toLowerCase();
    const subject = String(payload.subject || "");
    const text = String(payload.text || "");
    const html = payload.html ? String(payload.html) : null;
    const box = await boxByAddress(to);
    if (!box) return json({ error: "unknown recipient", to }, 404);
    if (box.external_enabled === false) return json({ ok: true, dropped: true });

    const spam = scoreSpam(subject, text, from);
    const { error } = await admin.from("mail_messages").insert({
      mailbox_id: box.id,
      user_id: box.user_id,
      folder: spam >= 50 ? "spam" : "inbox",
      direction: "in",
      from_address: from,
      from_name: payload.from_name ? String(payload.from_name) : null,
      to_address: to,
      subject,
      body_text: text,
      body_html: html,
      snippet: snippetOf(text || subject),
      spam_score: spam,
      origin: "external",
      external_message_id: payload.message_id ? String(payload.message_id) : null,
    });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, spam_score: spam });
  }

  // -------------------------------------------------------- authed actions
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return json({ error: "unauthorized" }, 401);

  const { data: ensured, error: ensureErr } = await admin.rpc("ensure_mailbox", {
    _user_id: user.id,
    _hint: user.email ?? null,
  });
  if (ensureErr) return json({ error: ensureErr.message }, 500);
  const box = (Array.isArray(ensured) ? ensured[0] : ensured) as Record<string, unknown>;

  if (action === "ensure") return json({ mailbox: box });

  if (action === "send") {
    const to = String(payload.to || "")
      .trim()
      .toLowerCase();
    const subject = String(payload.subject || "").slice(0, 300);
    const text = String(payload.text || "").slice(0, 50_000);
    const rawHtml = payload.html ? String(payload.html).slice(0, 200_000) : null;
    const origin = payload.origin === "ai" ? "ai" : "user";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json({ error: "invalid recipient" }, 400);
    if (!subject && !text) return json({ error: "empty message" }, 400);

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentSendCount, error: countError } = await admin
      .from("mail_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("direction", "out")
      .gte("created_at", oneHourAgo);
    if (countError) return json({ error: "unable to verify send limit" }, 503);
    if ((recentSendCount ?? 0) >= 30) {
      return json({ error: "hourly send limit reached", retry_after: 3600 }, 429);
    }

    // Every outgoing email wears the Megsy brand shell (unless a caller sends
    // a full HTML document of its own).
    const code = payload.code ? String(payload.code).slice(0, 12) : null;
    const isFullDoc = !!rawHtml && /<html[\s>]/i.test(rawHtml);
    const html = isFullDoc
      ? rawHtml
      : renderBrandEmail({
          title: subject || "Megsy",
          bodyHtml: rawHtml,
          bodyText: text,
          code,
          ctaLabel: payload.cta_label ? String(payload.cta_label) : null,
          ctaUrl: payload.cta_url ? String(payload.cta_url) : null,
        });

    const internal = isInternal(to);
    let status: string = internal ? "delivered" : "queued";
    let deliveredTo: string | null = null;

    if (internal) {
      const target = await boxByAddress(to);
      if (!target) return json({ error: "no such Megsy mailbox", to }, 404);
      const spam = scoreSpam(subject, text, String(box.address));
      const { error } = await admin.from("mail_messages").insert({
        mailbox_id: target.id,
        user_id: target.user_id,
        folder: spam >= 50 ? "spam" : "inbox",
        direction: "in",
        from_address: box.address,
        from_name: box.display_name ?? null,
        to_address: to,
        subject,
        body_text: text,
        body_html: html,
        snippet: snippetOf(text || subject),
        spam_score: spam,
        origin,
      });
      if (error) return json({ error: error.message }, 500);
      deliveredTo = String(target.address);
    } else if (smtpConfigured()) {
      // External delivery through Hostinger SMTP. Some providers refuse a
      // From that differs from the authenticated mailbox, so fall back to it.
      try {
        await sendSmtp({
          from: String(box.address),
          fromName: (box.display_name as string | null) ?? null,
          to,
          subject,
          text,
          html,
          replyTo: String(box.address),
        });
        status = "sent";
      } catch (_e) {
        try {
          await sendSmtp({
            from: Deno.env.get("SMTP_USER")!,
            fromName: String(box.address),
            to,
            subject,
            text,
            html,
            replyTo: String(box.address),
          });
          status = "sent";
        } catch (e2) {
          status = "failed";
          return json({ error: e2 instanceof Error ? e2.message : "smtp failed" }, 502);
        }
      }
    } else {
      status = "queued";
    }

    const { data: sent, error: sentErr } = await admin
      .from("mail_messages")
      .insert({
        mailbox_id: box.id,
        user_id: user.id,
        folder: "sent",
        direction: "out",
        from_address: box.address,
        from_name: box.display_name ?? null,
        to_address: to,
        subject,
        body_text: text,
        body_html: html,
        snippet: snippetOf(text || subject),
        is_read: true,
        origin,
        delivery_status: status,
      })
      .select()
      .single();
    if (sentErr) return json({ error: sentErr.message }, 500);

    return json({ ok: true, message: sent, delivered_to: deliveredTo, status });
  }

  return json({ error: "unknown action" }, 400);
});
