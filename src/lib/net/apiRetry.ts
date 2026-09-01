/**
 * @doc Shared authenticated POST layer for internal API routes.
 * One place for: bearer token refresh on 401, bounded backoff on 5xx /
 * network errors, and human-readable Arabic error messages instead of the
 * raw "Request failed" string.
 */
import { supabase } from "@/integrations/supabase/client";

export const AUTH_ERROR = "سجّل الدخول أولاً لتشغيل مهام الكمبيوتر";
export const TRANSIENT_ERROR = "تعذّر الاتصال بالخادم مؤقتًا. حاول تاني بعد لحظة.";

async function getToken(forceRefresh = false): Promise<string | undefined> {
  if (forceRefresh) {
    const refreshed = await supabase.auth.refreshSession().catch(() => null);
    return refreshed?.data.session?.access_token;
  }
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POSTs a JSON body to an internal route with the Supabase access token in the
 * payload. Retries a 401 once after a forced session refresh, and 5xx /
 * network failures with exponential backoff (3 attempts total).
 */
export async function postJsonWithAuth<T = unknown>(
  url: string,
  body: Record<string, unknown>,
  opts: { attempts?: number } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;

  let token = await getToken();
  if (!token) token = await getToken(true);
  if (!token) throw new Error(AUTH_ERROR);

  let resp: Response | null = null;
  let refreshedOnce = false;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...body }),
      });
      if (resp.status === 401 && !refreshedOnce) {
        refreshedOnce = true;
        const fresh = await getToken(true);
        if (!fresh) throw new Error(AUTH_ERROR);
        token = fresh;
        continue;
      }
      if (resp.status >= 500 && attempt < attempts - 1) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      break;
    } catch (error) {
      if (error instanceof Error && error.message === AUTH_ERROR) throw error;
      if (attempt === attempts - 1) throw new Error(TRANSIENT_ERROR);
      await sleep(500 * (attempt + 1));
    }
  }
  if (!resp) throw new Error(TRANSIENT_ERROR);

  const raw = await resp.text().catch(() => "");
  let json: Record<string, unknown> = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    /* non-JSON body */
  }

  if (!resp.ok) {
    if (resp.status === 401) throw new Error(AUTH_ERROR);
    const serverMessage =
      (json?.["error"] as string) || (json?.["detail"] as string) || raw.slice(0, 200);
    const generic =
      !serverMessage ||
      /^(request|fetch) failed\.?$/i.test(serverMessage.trim()) ||
      /^not found$/i.test(serverMessage.trim()) ||
      /^<!doctype/i.test(serverMessage.trim());
    throw new Error(
      generic ? "خدمة الكمبيوتر مش متاحة دلوقتي. جرّب تاني بعد لحظة." : serverMessage,
    );
  }
  return json as T;
}
