/** @doc Detects when a Coder-generated project needs GitHub or Supabase, so the UI can offer connect cards even if the backend never emits an `integration` event. */
import type { ProjectFile } from "@/lib/extractProjectFiles";

export type IntegrationKind = "github" | "supabase";
export interface DetectedIntegration {
  kind: IntegrationKind;
  reason: string;
}

const SUPABASE_FILE_HINTS: Array<[RegExp, string]> = [
  [/@supabase\/supabase-js/i, "The project imports the Supabase client"],
  [/createClient\s*\(\s*['"`]https:\/\/[a-z0-9-]+\.supabase\.co/i, "The project initialises a Supabase project URL"],
  [/YOUR_(?:PROJECT|SUPABASE)[A-Z_]*\.supabase\.co|YOUR_ANON_KEY|SUPABASE_ANON_KEY|VITE_SUPABASE_URL/i, "The project expects Supabase credentials"],
  [/supabase\.(auth|from|storage|functions)\b/i, "The project calls the Supabase API"],
];

const SUPABASE_PROMPT_HINTS =
  /(supabase|قاعدة بيانات|قاعده بيانات|تسجيل دخول|مصادقة|auth(entication)?\b|database|backend|sign\s?up|login)/i;

const GITHUB_PROMPT_HINTS =
  /(github|جيت ?هب|جيثهب|repo(sitory)?\b|مستودع|push (it|the (code|project))|ارفع (المشروع|الكود)|commit)/i;

/**
 * Inspect the user prompt and the produced files and return the integrations
 * the project realistically needs. Never returns duplicates.
 */
export function detectRequiredIntegrations(
  prompt: string,
  files: ProjectFile[],
): DetectedIntegration[] {
  const out: DetectedIntegration[] = [];
  const p = prompt || "";

  let supabaseReason: string | null = null;
  for (const f of files) {
    for (const [re, reason] of SUPABASE_FILE_HINTS) {
      if (re.test(f.content)) {
        supabaseReason = `${reason} (${f.path})`;
        break;
      }
    }
    if (supabaseReason) break;
  }
  if (!supabaseReason && SUPABASE_PROMPT_HINTS.test(p) && /supabase/i.test(p)) {
    supabaseReason = "Your request needs a Supabase backend";
  }
  if (supabaseReason) out.push({ kind: "supabase", reason: supabaseReason });

  if (GITHUB_PROMPT_HINTS.test(p)) {
    out.push({ kind: "github", reason: "You asked to publish this project to GitHub" });
  }

  return out;
}

/** True when the generated code still contains Supabase credential placeholders. */
export function hasSupabasePlaceholders(files: ProjectFile[]): boolean {
  return files.some((f) =>
    /YOUR_(?:PROJECT|SUPABASE|ANON)[A-Z_]*|<your-supabase-url>|your-anon-key/i.test(f.content),
  );
}
