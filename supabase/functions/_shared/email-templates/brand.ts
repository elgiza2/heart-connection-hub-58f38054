/** Megsy branded email shell.
 *
 *  Design language: full-bleed motion hero (animated GIF frame of the brand
 *  video — every real mail client strips <video>), a liquid-glass card faked
 *  with layered translucent fills + hairline highlights (backdrop-filter does
 *  not exist in email), Instrument Serif headline, chamfered white pill CTA
 *  and a full navigation footer.
 *
 *  The output is emitted as a single minified line: multi-line HTML gets
 *  quoted-printable soft-wrapped by SMTP and leaks "=20" artifacts into the
 *  rendered body (seen in Gmail).
 */

const SITE = "https://megsyai.com";
/** Animated frame loop of the brand video, served from Supabase Storage with a
 *  long-lived signed URL so it renders in every mail client immediately. */
const HERO_GIF =
  "https://ltgampdtawuefwwayncx.supabase.co/storage/v1/object/sign/email-assets/hero.gif?token=eyJraWQiOiJhM2JiNGUxMC1mZWQ4LTQ5YzgtOTYxOS1mYzUwOGM5OWFlZTAiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJlbWFpbC1hc3NldHMvaGVyby5naWYiLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzg3OTgwMDA1LCJleHAiOjIxMDMzNDAwMDV9.h66xE5ll93acc7xeC3e6ix4hoFUgu3KV-H8uDLcgPQY";

export interface BrandEmailInput {
  title: string;
  preheader?: string | null;
  bodyHtml?: string | null;
  bodyText?: string | null;
  code?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  footerNote?: string | null;
}

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const SANS = "ui-sans-serif,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "'Instrument Serif',Georgia,'Times New Roman',serif";

function textToHtml(text: string) {
  return text
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-family:${SANS};font-size:15px;line-height:1.7;color:rgba(255,255,255,0.66);">${esc(
          p.trim(),
        ).replace(/\n/g, "<br />")}</p>`,
    )
    .join("");
}

const FOOTER_LINKS: Array<[string, string]> = [
  ["Home", `${SITE}/`],
  ["Chat", `${SITE}/chat`],
  ["Pricing", `${SITE}/pricing`],
  ["Support", `${SITE}/settings`],
];

export function renderBrandEmail(input: BrandEmailInput): string {
  const body =
    input.bodyHtml && input.bodyHtml.trim() ? input.bodyHtml : textToHtml(input.bodyText || "");

  const codeBlock = input.code
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 26px;"><tr><td align="center" style="padding:18px 12px;border:1px solid rgba(255,255,255,0.16);border-radius:18px;background:#101012;"><div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:30px;letter-spacing:9px;color:#ffffff;font-weight:600;">${esc(
        input.code,
      )}</div></td></tr></table>`
    : "";

  const cta =
    input.ctaUrl && input.ctaLabel
      ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#ffffff;border-radius:999px;"><a href="${esc(
          input.ctaUrl,
        )}" style="display:inline-block;padding:13px 30px;font-family:${SANS};font-size:14px;font-weight:600;color:#000000;text-decoration:none;letter-spacing:0.01em;">${esc(
          input.ctaLabel,
        )}</a></td></tr></table>`
      : "";

  const footerNav = FOOTER_LINKS.map(
    ([label, href]) =>
      `<a href="${href}" style="font-family:${SANS};color:rgba(255,255,255,0.6);text-decoration:none;font-size:13px;padding:0 9px;">${label}</a>`,
  ).join(`<span style="color:rgba(255,255,255,0.2);font-size:12px;">|</span>`);

  const html = `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&display=swap" rel="stylesheet" />
<title>${esc(input.title)}</title></head>
<body style="margin:0;padding:0;background:#000000;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(
    input.preheader || input.title,
  )}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000000;padding:24px 12px 32px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#050505;border:1px solid rgba(255,255,255,0.10);border-radius:26px;overflow:hidden;">
<tr><td style="padding:0;line-height:0;background:#000000;">
<a href="${SITE}" style="display:block;text-decoration:none;"><img src="${HERO_GIF}" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;" /></a>
</td></tr>
<tr><td style="padding:0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0d;border-top:1px solid rgba(255,255,255,0.16);">
<tr><td style="height:1px;line-height:1px;font-size:0;background:rgba(255,255,255,0.22);">&nbsp;</td></tr>
<tr><td style="padding:22px 28px 6px;">
<span style="font-family:${SANS};color:#ffffff;font-size:17px;font-weight:600;letter-spacing:-0.02em;">Megsy</span>
<span style="font-family:${SANS};color:rgba(255,255,255,0.35);font-size:12px;">&nbsp;&nbsp;//&nbsp;secure message</span>
</td></tr>
<tr><td style="padding:10px 28px 34px;">
<h1 style="margin:0 0 14px;font-family:${SERIF};font-weight:400;color:#ffffff;font-size:30px;line-height:1.15;letter-spacing:-0.01em;">${esc(
    input.title,
  )}</h1>
${
  input.preheader
    ? `<p style="margin:0 0 18px;font-family:${SANS};font-size:15px;line-height:1.7;color:rgba(255,255,255,0.66);">${esc(
        input.preheader,
      )}</p>`
    : ""
}
${body}
${codeBlock}
${cta}
</td></tr>
</table>
</td></tr>
</table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
<tr><td align="center" style="padding:24px 16px 6px;line-height:2;">${footerNav}</td></tr>
<tr><td align="center" style="padding:2px 16px 0;">
<p style="margin:0 0 6px;font-family:${SANS};font-size:12px;line-height:1.7;color:rgba(255,255,255,0.4);">${esc(
    input.footerNote || "You are receiving this email because you have a Megsy account.",
  )}</p>
<p style="margin:0;font-family:${SANS};font-size:12px;color:rgba(255,255,255,0.3);">&copy; ${new Date().getFullYear()} Megsy &middot; <a href="${SITE}" style="color:rgba(255,255,255,0.5);text-decoration:none;">megsyai.com</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  // Collapse to one line so SMTP quoted-printable never injects "=20" soft breaks.
  return html.replace(/\n\s*/g, "");
}

/** Verification / OTP email. */
export function renderCodeEmail(code: string, purpose = "Verify your email") {
  return renderBrandEmail({
    title: purpose,
    preheader: "Use the code below to continue. It expires shortly.",
    code,
    footerNote: "If you did not request this code, you can safely ignore this email.",
  });
}
