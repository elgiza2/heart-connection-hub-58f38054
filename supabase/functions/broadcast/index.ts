/** @doc broadcast — admin-only, secret-protected broadcast mailer. */
/**
 * Megsy broadcast mailer (admin-only, secret protected).
 *
 * Actions (POST JSON { action, ... }, header x-broadcast-secret):
 *  - asset    → upload a base64 image to the private email-assets bucket and
 *               return a long-lived signed URL (used for the email hero).
 *  - preview  → render the campaign HTML for a language without sending.
 *  - campaign → send the campaign to a slice of users (offset/limit), honouring
 *               the email opt-out in notification_preferences.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendSmtp, smtpConfigured } from "../_shared/smtp.ts";
import { renderCleanEmail, toPlainText, type MailLang } from "../_shared/email-templates/campaign.ts";
import { campaignEmail } from "../_shared/email-templates/copy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-broadcast-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const HERO_DEFAULT = Deno.env.get("EMAIL_HERO_CAMPAIGN") || "";

/** Arabic-speaking audience detection. */
async function arabicUserIds(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!ids.length) return out;
  const { data: langs } = await admin
    .from("user_chat_settings")
    .select("user_id,preferred_language")
    .in("user_id", ids);
  for (const r of langs ?? []) {
    if (String((r as Record<string, unknown>).preferred_language || "").toLowerCase().startsWith("ar")) {
      out.add(String((r as Record<string, unknown>).user_id));
    }
  }
  try {
    const { data: kash } = await admin.from("kashier_orders").select("user_id").in("user_id", ids);
    for (const r of kash ?? []) out.add(String((r as Record<string, unknown>).user_id));
  } catch {
    /* table optional */
  }
  return out;
}

async function optedOut(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!ids.length) return out;
  const { data } = await admin
    .from("notification_preferences")
    .select("user_id,email_enabled")
    .in("user_id", ids);
  for (const r of data ?? []) {
    if ((r as Record<string, unknown>).email_enabled === false) {
      out.add(String((r as Record<string, unknown>).user_id));
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secret = Deno.env.get("BROADCAST_SECRET");
  if (!secret || req.headers.get("x-broadcast-secret") !== secret) {
    return json({ error: "unauthorized" }, 401);
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const action = String(payload.action || "");

  // ------------------------------------------------------------------ asset
  if (action === "asset") {
    const name = String(payload.name || "").replace(/[^a-zA-Z0-9._-]/g, "");
    const b64 = String(payload.data_base64 || "");
    if (!name || !b64) return json({ error: "name and data_base64 required" }, 400);
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bucket = "email-assets";
    await admin.storage.createBucket(bucket, { public: false }).catch(() => {});
    const up = await admin.storage
      .from(bucket)
      .upload(name, bytes, { contentType: String(payload.content_type || "image/jpeg"), upsert: true });
    if (up.error) return json({ error: up.error.message }, 500);
    const signed = await admin.storage.from(bucket).createSignedUrl(name, 60 * 60 * 24 * 3650);
    if (signed.error) return json({ error: signed.error.message }, 500);
    return json({ ok: true, url: signed.data.signedUrl });
  }

  const hero = String(payload.hero_url || HERO_DEFAULT);

  // ---------------------------------------------------------------- preview
  if (action === "preview") {
    const lang = (payload.lang === "ar" ? "ar" : "en") as MailLang;
    return new Response(renderCleanEmail(campaignEmail(lang, hero)), {
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // --------------------------------------------------------------- campaign
  if (action === "campaign") {
    if (!smtpConfigured()) return json({ error: "smtp not configured" }, 500);
    if (!hero) return json({ error: "hero_url required" }, 400);

    const page = Math.max(1, Number(payload.page || 1));
    const perPage = Math.min(100, Math.max(1, Number(payload.per_page || 50)));
    const dryRun = payload.dry_run === true;
    const testTo = payload.test_to ? String(payload.test_to) : null;

    const from = Deno.env.get("SMTP_USER")!;

    if (testTo) {
      const lang = (payload.lang === "ar" ? "ar" : "en") as MailLang;
      const input = campaignEmail(lang, hero);
      await sendSmtp({
        from,
        fromName: "Megsy",
        to: testTo,
        subject: lang === "ar" ? "ميغسي عاد — جرّب كل المميزات الآن" : "Megsy is back — everything in one place",
        text: toPlainText(input),
        html: renderCleanEmail(input),
      });
      return json({ ok: true, test_sent_to: testTo });
    }

    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return json({ error: error.message }, 500);
    const users = (data?.users ?? []).filter((u) => !!u.email);
    const ids = users.map((u) => u.id);
    const [arabic, skip] = await Promise.all([arabicUserIds(ids), optedOut(ids)]);

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const u of users) {
      if (skip.has(u.id)) {
        skipped++;
        continue;
      }
      const lang: MailLang = arabic.has(u.id) ? "ar" : "en";
      const input = campaignEmail(lang, hero);
      const subject =
        lang === "ar" ? "ميغسي عاد — جرّب كل المميزات الآن" : "Megsy is back — everything in one place";
      if (dryRun) {
        sent++;
        continue;
      }
      try {
        await sendSmtp({
          from,
          fromName: "Megsy",
          to: u.email!,
          subject,
          text: toPlainText(input),
          html: renderCleanEmail(input),
        });
        sent++;
      } catch (e) {
        failed++;
        if (errors.length < 5) errors.push(e instanceof Error ? e.message : String(e));
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    return json({
      ok: true,
      page,
      per_page: perPage,
      total_in_page: users.length,
      sent,
      skipped,
      failed,
      errors,
      has_more: users.length === perPage,
    });
  }

  return json({ error: "unknown action" }, 400);
});
