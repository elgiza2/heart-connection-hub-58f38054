/**
 * Build a friendly assistant message describing the generated document.
 * Primary path: ask the AI (via the docs-ready-message edge function) to
 * write a 2–4 sentence summary in the user's exact language/dialect, grounded
 * in the actual document. Fallback: a minimal localized template.
 */
import { supabase } from "@/integrations/supabase/client";

export function summarizeDocHtml(html: string, docType?: string): string {
  try {
    const stripped = html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ");
    const headings: string[] = [];
    const re = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) && headings.length < 6) {
      const t = m[1]
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (t && !headings.includes(t)) headings.push(t);
    }
    const text = stripped
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const words = text ? text.split(/\s+/).length : 0;
    const parts: string[] = [];
    if (docType) parts.push(docType.replace(/[-_]/g, " "));
    if (words > 0) parts.push(`~${words} words`);
    if (headings.length > 0) parts.push(`sections: ${headings.slice(0, 5).join(", ")}`);
    return parts.join(" · ");
  } catch {
    return "";
  }
}

function localFallback(title: string, _prompt: string): string {
  return `I prepared **"${title}"** for you. Open the preview to see the full version.`;
}

/**
 * Synchronous template (kept for back-compat). Prefer `buildDocReadyMessageAI`.
 */
export function buildDocReadyMessage(
  title: string,
  _html?: string,
  _docType?: string,
  _withDownload = true,
  prompt = "",
): string {
  return localFallback(title, prompt);
}

/**
 * AI-generated, language-matched ready message. Always prefer this when the
 * original user prompt is available.
 */
export async function buildDocReadyMessageAI(args: {
  title: string;
  html?: string;
  docType?: string;
  prompt: string;
}): Promise<string> {
  const { title, html = "", docType = "", prompt } = args;
  try {
    const { data, error } = await supabase.functions.invoke("docs-generate", {
      body: { action: "ready-message", title, html, docType, prompt },
    });
    if (error) throw error;
    const message = String((data as { message?: string } | null)?.message ?? "").trim();
    if (message) return message;
  } catch {
    /* fall through */
  }
  return localFallback(title, prompt);
}
