import { supabase } from "@/integrations/supabase/client";

type InvokeOptions = Parameters<typeof supabase.functions.invoke>[1];

const transientError = (message: string) => /failed to send|network|fetch|timeout/i.test(message);

// Supabase JS wraps non-2xx responses into a FunctionsHttpError whose default
// `.message` is the unhelpful "Edge Function returned a non-2xx status code".
// The real body is on `error.context` (a Response). Pull the actual server
// message out so the caller sees something actionable.
async function extractRealError(error: any): Promise<Error> {
  try {
    const ctx = error?.context;
    if (ctx && typeof ctx.text === "function") {
      const text = await ctx.clone().text();
      if (text) {
        try {
          const parsed = JSON.parse(text);
          const msg = parsed?.error || parsed?.message || text;
          const status = ctx.status ? ` (${ctx.status})` : "";
          return new Error(`${typeof msg === "string" ? msg : JSON.stringify(msg)}${status}`);
        } catch {
          const status = ctx.status ? ` (${ctx.status})` : "";
          return new Error(`${text}${status}`);
        }
      }
    }
  } catch {}
  return error instanceof Error ? error : new Error(String(error?.message || error));
}

export async function invokeFunction<T = any>(
  name: string,
  options?: InvokeOptions,
  retries = 1,
): Promise<{ data: T; error: Error | null }> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const { data, error } = await supabase.functions.invoke<T>(name, options);
    if (!error) return { data: data as T, error: null };

    lastError = error;
    const message = (error as any)?.message || "Request failed";
    if (!transientError(message) || attempt === retries) break;
    await new Promise((resolve) => setTimeout(resolve, 450 * (attempt + 1)));
  }

  const realError = await extractRealError(lastError);
  return { data: null as T, error: realError };
}
