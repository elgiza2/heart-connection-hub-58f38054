/**
 * Sanitize an error message before showing it to the user.
 * Removes/replaces any provider names so users never see the names of
 * upstream AI/infrastructure providers in error toasts.
 *
 * Use this in every user-facing error toast or banner.
 */

const PROVIDER_PATTERNS: Array<{ re: RegExp; replace: string }> = [
  // Model identifiers like "fal-ai/flux-pro/v1.1-ultra" → "model"
  { re: /\bfal[-_.]ai\/[\w\-./]+/gi, replace: "model" },
  { re: /\bfal[-_.]ai\b/gi, replace: "provider" },
  { re: /\bfal\.run\b/gi, replace: "provider" },
  { re: /\bopenai\b/gi, replace: "provider" },
  { re: /\banthropic\b/gi, replace: "provider" },
  { re: /\bclaude(?:-\d+(?:\.\d+)?(?:-\w+)?)?\b/gi, replace: "model" },
  { re: /\bgpt-?\d[\w.\-]*\b/gi, replace: "model" },
  { re: /\bo\d-(?:mini|preview|pro)\b/gi, replace: "model" },
  { re: /\breplicate\.com\b/gi, replace: "provider" },
  { re: /\breplicate\b/gi, replace: "provider" },
  { re: /\belevenlabs\b/gi, replace: "provider" },
  { re: /\bstability\.ai\b/gi, replace: "provider" },
  { re: /\bstability\b/gi, replace: "provider" },
  { re: /\bgroq\b/gi, replace: "provider" },
  { re: /\bgemini[\w.\-]*/gi, replace: "model" },
  { re: /\bdeepseek[\w.\-]*/gi, replace: "model" },
  { re: /\bkimi[\w.\-]*/gi, replace: "model" },
  { re: /\bmidjourney\b/gi, replace: "provider" },
  { re: /\brunway(?:ml)?\b/gi, replace: "provider" },
  { re: /\bluma(?:labs)?\b/gi, replace: "model" },
  { re: /\bveo[-\d]*\b/gi, replace: "model" },
  { re: /\bkling[\w.\-]*\b/gi, replace: "model" },
  { re: /\bpika[\w.\-]*\b/gi, replace: "model" },
  { re: /\bseedance[\w.\-]*\b/gi, replace: "model" },
  { re: /\bseedream[\w.\-]*\b/gi, replace: "model" },
  { re: /\bhailuo[\w.\-]*\b/gi, replace: "model" },
  { re: /\bhunyuan[\w.\-]*\b/gi, replace: "model" },
  { re: /\bnano[- ]banana[\w.\-]*\b/gi, replace: "model" },
  { re: /\bflux[\w./\-]*\b/gi, replace: "model" },
  { re: /\bideogram[\w.\-]*\b/gi, replace: "model" },
  { re: /\brecraft[\w.\-]*\b/gi, replace: "model" },
  { re: /\bqwen[\w.\-]*\b/gi, replace: "model" },
  { re: /\bbytedance[\w.\-]*\b/gi, replace: "provider" },
  { re: /\bminimax[\w.\-]*\b/gi, replace: "provider" },
  // URLs to provider domains
  {
    re: /https?:\/\/[\w.-]*(?:fal|openai|anthropic|replicate|stability|groq|elevenlabs|runway|midjourney|luma|bytedance|minimax)[\w./?#=&-]*/gi,
    replace: "[link]",
  },
];

export function sanitizeErrorMessage(input: unknown, fallback = "Something went wrong"): string {
  let msg: string;
  if (input instanceof Error) msg = input.message || fallback;
  else if (typeof input === "string") msg = input;
  else if (input && typeof input === "object" && "message" in (input as any))
    msg = String((input as any).message || fallback);
  else msg = fallback;

  if (!msg) return fallback;

  let out = msg;
  for (const { re, replace } of PROVIDER_PATTERNS) out = out.replace(re, replace);

  // Collapse any "provider provider", "model model" duplicates from chained replacements
  out = out.replace(/\b(provider|model)(\s+\1)+\b/gi, "$1");
  // Trim residual artifacts
  out = out.replace(/\s{2,}/g, " ").trim();

  return out || fallback;
}
