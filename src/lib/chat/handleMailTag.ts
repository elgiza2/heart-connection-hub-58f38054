/** @doc Detects <MEGSY_MAIL .../> tags in a streamed assistant reply and acts on
 *  them through the Megsy Mail system: the assistant can send mail from the
 *  user's own username@megsyai.com address (site sign-ups, follow-ups) and can
 *  read the latest inbox messages (e.g. confirmation codes).
 *
 *  Supported tags:
 *    <MEGSY_MAIL action="send" to="x@y.com" subject="..." body="..." />
 *    <MEGSY_MAIL action="inbox" limit="5" />
 *    <MEGSY_MAIL action="address" />
 */
import { ensureMailbox, listMail, sendMail } from "@/lib/mail/mailClient";

const TAG_RE = /<MEGSY_MAIL\b([^>]*?)\/?\s*>/gi;

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(\w+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) out[m[1]] = m[3] ?? m[4] ?? "";
  return out;
}

function decode(s: string) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\\n/g, "\n");
}

/** Runs every mail tag found and returns { text, results } for the UI. */
export async function handleMailTag(
  text: string,
): Promise<{ text: string; notes: string[] }> {
  const matches = [...text.matchAll(TAG_RE)];
  if (matches.length === 0) return { text, notes: [] };

  const stripped = text.replace(TAG_RE, "").trim();
  const notes: string[] = [];

  for (const match of matches) {
    const a = parseAttrs(match[1] || "");
    const action = (a.action || "send").toLowerCase();
    try {
      if (action === "address") {
        const box = await ensureMailbox();
        notes.push(`📬 ${box.address}`);
      } else if (action === "inbox") {
        const limit = Math.min(10, Math.max(1, Number(a.limit) || 5));
        await ensureMailbox();
        const msgs = (await listMail("inbox", limit)).slice(0, limit);
        notes.push(
          msgs.length === 0
            ? "📭 Inbox is empty."
            : msgs
                .map((m) => `📩 ${m.from_address} — ${m.subject || "(no subject)"}: ${m.snippet}`)
                .join("\n"),
        );
      } else if (action === "send") {
        const to = decode(a.to || "");
        if (!to) continue;
        const res = await sendMail({
          to,
          subject: decode(a.subject || ""),
          text: decode(a.body || a.text || ""),
          origin: "ai",
        });
        notes.push(
          res.status === "queued"
            ? `📤 Queued to ${to} (external delivery pending domain setup).`
            : `📤 Sent to ${to}.`,
        );
      }
    } catch (e) {
      notes.push(`⚠️ Mail: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { text: stripped, notes };
}
