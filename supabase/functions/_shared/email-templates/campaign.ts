/** Clean Megsy email shell (light, image-led) used for the product campaign
 *  and for the new signup / welcome email.
 *
 *  Rules that keep it rendering everywhere:
 *   - tables only, inline styles, no <video>, no backdrop-filter
 *   - single hero <img> (hosted, absolute URL)
 *   - output collapsed to one line so SMTP quoted-printable never leaks "=20"
 */

const SITE = "https://megsyai.com";
const SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export type MailLang = "en" | "ar";

export interface CleanEmailInput {
  lang: MailLang;
  heroUrl: string;
  heroAlt?: string;
  title: string;
  intro: string;
  /** Feature rows: [emoji-free label, description] */
  bullets?: Array<[string, string]>;
  note?: string | null;
  ctaLabel: string;
  ctaUrl: string;
  footerNote?: string | null;
}

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const STRINGS = {
  en: {
    unsub: "Manage email preferences",
    why: "You are receiving this email because you have a Megsy account.",
    rights: "All rights reserved.",
  },
  ar: {
    unsub: "إدارة تفضيلات البريد",
    why: "وصلتك هذه الرسالة لأن لديك حساب على ميغسي.",
    rights: "جميع الحقوق محفوظة.",
  },
} as const;

export function renderCleanEmail(input: CleanEmailInput): string {
  const rtl = input.lang === "ar";
  const dir = rtl ? "rtl" : "ltr";
  const align = rtl ? "right" : "left";
  const s = STRINGS[input.lang];

  const bullets = (input.bullets ?? [])
    .map(
      ([label, desc]) =>
        `<tr><td style="padding:0 0 14px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:14px 16px;background:#f6f7f9;border-radius:14px;"><div style="font-family:${SANS};font-size:15px;font-weight:600;color:#0b0b0d;line-height:1.4;">${esc(
          label,
        )}</div><div style="font-family:${SANS};font-size:14px;color:#5c6068;line-height:1.65;margin-top:4px;">${esc(
          desc,
        )}</div></td></tr></table></td></tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html dir="${dir}" lang="${input.lang}"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${esc(
    input.title,
  )}</title></head>
<body style="margin:0;padding:0;background:#eef1f5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(input.intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5;padding:26px 12px 34px;" dir="${dir}">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 2px 10px rgba(16,24,40,0.06);">
<tr><td style="padding:0;line-height:0;">
<a href="${SITE}" style="display:block;text-decoration:none;"><img src="${esc(
    input.heroUrl,
  )}" width="600" alt="${esc(
    input.heroAlt || "Megsy",
  )}" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;" /></a>
</td></tr>
<tr><td align="${align}" style="padding:28px 28px 4px;" dir="${dir}">
<h1 style="margin:0 0 12px;font-family:${SANS};font-weight:700;color:#0b0b0d;font-size:26px;line-height:1.3;letter-spacing:-0.02em;">${esc(
    input.title,
  )}</h1>
<p style="margin:0 0 20px;font-family:${SANS};font-size:15.5px;line-height:1.8;color:#4a4f57;">${esc(
    input.intro,
  )}</p>
</td></tr>
${
  bullets
    ? `<tr><td align="${align}" style="padding:0 28px;" dir="${dir}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${bullets}</table></td></tr>`
    : ""
}
${
  input.note
    ? `<tr><td align="${align}" style="padding:6px 28px 0;" dir="${dir}"><p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.75;color:#4a4f57;">${esc(
        input.note,
      )}</p></td></tr>`
    : ""
}
<tr><td align="center" style="padding:24px 28px 30px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#0a63f6;border-radius:999px;"><a href="${esc(
    input.ctaUrl,
  )}" style="display:inline-block;padding:14px 34px;font-family:${SANS};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${esc(
    input.ctaLabel,
  )}</a></td></tr></table>
</td></tr>
</table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
<tr><td align="center" style="padding:18px 16px 0;">
<p style="margin:0 0 6px;font-family:${SANS};font-size:12.5px;line-height:1.7;color:#7a8089;">${esc(
    input.footerNote || s.why,
  )}</p>
<p style="margin:0 0 6px;font-family:${SANS};font-size:12.5px;"><a href="${SITE}/settings/notifications" style="color:#0a63f6;text-decoration:none;">${
    s.unsub
  }</a></p>
<p style="margin:0;font-family:${SANS};font-size:12px;color:#9aa0a8;">&copy; ${new Date().getFullYear()} Megsy &middot; ${
    s.rights
  }</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  return html.replace(/\n\s*/g, "");
}

export function toPlainText(input: CleanEmailInput): string {
  const lines = [input.title, "", input.intro, ""];
  for (const [label, desc] of input.bullets ?? []) lines.push(`- ${label}: ${desc}`);
  if (input.note) lines.push("", input.note);
  lines.push("", `${input.ctaLabel}: ${input.ctaUrl}`);
  lines.push("", `${SITE}/settings/notifications`);
  return lines.join("\n");
}
