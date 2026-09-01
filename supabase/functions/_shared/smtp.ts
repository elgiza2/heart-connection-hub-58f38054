/** Outbound mail via Hostinger SMTP (implicit TLS, port 465). */
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

export interface SendArgs {
  from: string;
  fromName?: string | null;
  to: string;
  subject: string;
  text: string;
  html?: string | null;
  replyTo?: string | null;
}

export function smtpConfigured() {
  return Boolean(
    Deno.env.get("SMTP_HOST") && Deno.env.get("SMTP_USER") && Deno.env.get("SMTP_PASS"),
  );
}

export async function sendSmtp(args: SendArgs): Promise<void> {
  const host = Deno.env.get("SMTP_HOST")!;
  const port = Number(Deno.env.get("SMTP_PORT") ?? "465");
  const user = Deno.env.get("SMTP_USER")!;
  const pass = Deno.env.get("SMTP_PASS")!;

  const client = new SMTPClient({
    connection: { hostname: host, port, tls: port === 465, auth: { username: user, password: pass } },
  });

  try {
    await client.send({
      from: args.fromName ? `${args.fromName} <${args.from}>` : args.from,
      to: args.to,
      replyTo: args.replyTo ?? args.from,
      subject: args.subject || "(no subject)",
      content: args.text || " ",
      html: args.html ?? undefined,
    });
  } finally {
    // denomailer's close() may return void (not a promise) depending on the
    // connection state — awaiting `.catch` on it threw and masked a successful send.
    try {
      await client.close();
    } catch {
      /* connection already torn down */
    }
  }
}
