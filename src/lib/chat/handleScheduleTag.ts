/** @doc Detects <SCHEDULE .../> tags in a streamed assistant reply, saves the
 *  schedule via the create-scheduled-message edge function, and requests push
 *  permission from the user. Returns the reply text with the tag stripped. */
import { supabase } from "@/integrations/supabase/client";
import { ensurePushSubscription } from "@/lib/push/subscribe";

const TAG_RE = /<SCHEDULE\b([^/>]*)\/?\s*>/i;

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(\w+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) out[m[1]] = m[3] ?? m[4] ?? "";
  return out;
}

export async function handleScheduleTag(text: string): Promise<string> {
  const match = text.match(TAG_RE);
  if (!match) return text;
  const attrs = parseAttrs(match[1] || "");
  const prompt = attrs.prompt;
  if (!prompt) return text.replace(TAG_RE, "").trim();

  const stripped = text.replace(TAG_RE, "").trim();

  // Fire-and-forget: save + request push permission, don't block UI.
  (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-scheduled-message`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
          },
          body: JSON.stringify({
            prompt,
            cron: attrs.cron || "0 10 * * *",
            title: attrs.title || null,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        },
      );
      await ensurePushSubscription();
    } catch {
      /* silent */
    }
  })();

  return stripped;
}
