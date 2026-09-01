/** @doc Repairs common fatal mistakes in AI-generated project code before preview/publish (UMD self-shadowing, stray markdown fences, missing semicolon-safe globals). */
import type { ProjectFile } from "@/lib/extractProjectFiles";

/** Libraries commonly loaded from a CDN as a global UMD bundle. */
const UMD_GLOBALS = ["supabase", "gsap", "THREE", "Chart", "confetti", "anime", "Swiper", "L", "axios", "dayjs"];

function fixUmdSelfShadowing(code: string): string {
  let out = code;
  for (const g of UMD_GLOBALS) {
    // `const supabase = supabase.createClient(...)` -> TDZ ReferenceError at runtime.
    const re = new RegExp(`\\b(const|let|var)\\s+${g}\\s*=\\s*${g}\\s*\\.`, "g");
    out = out.replace(re, (_m, kw) => `${kw} ${g} = window.${g}.`);
  }
  return out;
}

/** Strip markdown fences that leaked into a code file. */
function stripStrayFences(code: string): string {
  const trimmed = code.trimStart();
  if (!trimmed.startsWith("```")) return code;
  return code
    .replace(/^\s*```[a-zA-Z0-9._/-]*\s*\n/, "")
    .replace(/\n?```\s*$/, "");
}

/** Remove a leading "// filepath: x" comment some models emit as the first line. */
function stripPathComment(code: string): string {
  return code.replace(/^\s*(?:\/\/|#)\s*(?:filepath|file|path)\s*:\s*\S+\s*\n/i, "");
}

const CODE_EXT = /\.(js|jsx|ts|tsx|mjs|cjs)$/i;
const TEXTY_EXT = /\.(js|jsx|ts|tsx|mjs|cjs|html|css|json|md)$/i;

/**
 * Apply safe, purely-textual repairs. Never throws; returns a new array with
 * the same paths so callers can merge it straight back into project state.
 */
export function autoFixProjectFiles(files: ProjectFile[]): ProjectFile[] {
  return files.map((f) => {
    let content = f.content ?? "";
    try {
      if (TEXTY_EXT.test(f.path)) {
        content = stripStrayFences(content);
        content = stripPathComment(content);
      }
      if (CODE_EXT.test(f.path) || /\.html?$/i.test(f.path)) {
        content = fixUmdSelfShadowing(content);
      }
    } catch {
      return f;
    }
    return content === f.content ? f : { ...f, content };
  });
}
