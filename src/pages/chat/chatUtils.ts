// Pure utilities extracted from ChatPage.tsx for reduced bundle/HMR cost.
// No React state or side effects — safe to memoize and tree-shake.

// Tool names that must never surface as raw text/JSON in the chat body.
const LEAKED_ACTION_NAMES =
  "generate_image|generate_video|generate_music|generate_voice|edit_image|create_image|image_generation|video_generation|deep_research|web_search|browse_website";

export const stripLeakedToolText = (value: string) =>
  String(value || "")
    .replace(
      /```(?:tool_code|tool_call|function_call|python)?[\s\S]*?(?:default_api|tool_code|tool_call|function_call)[\s\S]*?(?:```|$)/gi,
      "",
    )
    // Fenced JSON action blocks, e.g. ```json { "action": "generate_image", ... } ```
    .replace(
      new RegExp(
        "```(?:json|jsonc|javascript|js)?\\s*\\{[\\s\\S]*?\"(?:action|tool|tool_name|name|function)\"\\s*:\\s*\"(?:" +
          LEAKED_ACTION_NAMES +
          ")\"[\\s\\S]*?(?:```|$)",
        "gi",
      ),
      "",
    )
    // Bare JSON action objects printed straight into the message body.
    .replace(
      new RegExp(
        "\\{[^{}]*\"(?:action|tool|tool_name|name|function)\"\\s*:\\s*\"(?:" +
          LEAKED_ACTION_NAMES +
          ")\"[\\s\\S]*?(?:\\}\\s*\\}|\\})",
        "gi",
      ),
      "",
    )
    .replace(/<tool_call[\s\S]*?(?:<\/tool_call>|$)/gi, "")
    .replace(/<function_call[\s\S]*?(?:<\/function_call>|$)/gi, "")
    .replace(/\$\{tool_code\}\s*/gi, "")
    .replace(/(?:^|\n)[^\n]*(?:print\s*\(\s*)?default_api\.[^\n]*(?:\n|$)/gi, "\n");

/**
 * The assistant must never assert anything about the user's plan, subscription
 * or paid access. Any sentence/line that does is removed before render, no
 * matter which pipeline produced it (chat stream, long-run agent, replay).
 */
const PLAN_CLAIM_PATTERNS: RegExp[] = [
  /premium\s*\/\s*max/i,
  /مشترك\s+(?:في\s+)?(?:premium|max|pro|بريميوم|ماكس)/i,
  /(?:حساب(?:ك|ي)|الحساب)\s+(?:مش\s+|غير\s+|ليس\s+)?مجاني/i,
  /الميزات\s+المدفوعة/i,
  /(?:خطة|اشتراك)(?:ك|ي)?\s+(?:premium|max|pro|مدفوع)/i,
  /your account is (?:not )?free/i,
  /you(?:'re| are) (?:on|subscribed to) (?:the )?(?:premium|max|pro)\b/i,
  /all paid features are (?:available|unlocked)/i,
];

const isPlanClaim = (segment: string) => PLAN_CLAIM_PATTERNS.some((re) => re.test(segment));

/**
 * Removes any sentence — not just whole lines — that asserts something about
 * the user's plan / subscription / paid access, in Arabic or English.
 */
export const stripPlanClaims = (value: string) => {
  const input = String(value || "");
  if (!input || !isPlanClaim(input)) return input;
  const cleanedLines = input.split("\n").map((line) => {
    if (!isPlanClaim(line)) return line;
    // Drop only the offending sentence(s) inside the line when possible.
    const sentences = line.split(/(?<=[.!؟?۔])\s+/);
    const kept = sentences.filter((s) => !isPlanClaim(s));
    const rebuilt = kept.join(" ").trim();
    return isPlanClaim(rebuilt) ? "" : rebuilt;
  });
  return cleanedLines.join("\n").replace(/\n{3,}/g, "\n\n");
};



export const sanitizeLeakedToolText = (value: string) =>
  stripPlanClaims(stripLeakedToolText(value)).trim();

export const makeLeakedToolStreamSanitizer = () => {
  let buffer = "";
  let droppingToolLine = false;
  const markers = [
    "${tool_code}",
    "print(default_api.",
    "default_api.",
    "<tool_call",
    "<function_call",
    "```tool_code",
    "```tool_call",
    "```function_call",
    "```python",
    "```json",
    '{"action"',
    '{ "action"',
  ];
  return (chunk: string, force = false) => {
    buffer += chunk;
    const lower = buffer.toLowerCase();
    if (droppingToolLine) {
      const nl = buffer.indexOf("\n");
      if (nl === -1) {
        buffer = "";
        return "";
      }
      buffer = buffer.slice(nl + 1);
      droppingToolLine = false;
    }
    const toolLineMatch = buffer.match(
      /(?:^|\n)[^\n]*(?:\$\{tool_code\}|default_api\.|print\s*\(\s*default_api\.)/i,
    );
    if (toolLineMatch && toolLineMatch.index !== undefined) {
      const start = toolLineMatch.index + (toolLineMatch[0].startsWith("\n") ? 1 : 0);
      const safePrefix = stripLeakedToolText(buffer.slice(0, start));
      const nl = buffer.indexOf("\n", start);
      if (nl === -1) {
        buffer = "";
        droppingToolLine = !force;
        return safePrefix;
      }
      buffer = buffer.slice(nl + 1);
      return safePrefix + stripLeakedToolText(buffer);
    }
    if (force) {
      const safe = markers.some((marker) => marker.startsWith(lower.trim())) ? "" : buffer;
      buffer = "";
      return stripLeakedToolText(safe);
    }
    if (!force) {
      const max = Math.min(80, buffer.length);
      for (let len = max; len > 0; len--) {
        const suffix = lower.slice(-len);
        if (markers.some((marker) => marker.startsWith(suffix))) {
          const safe = buffer.slice(0, -len);
          buffer = buffer.slice(-len);
          return stripLeakedToolText(safe);
        }
      }
    }
    const safe = buffer;
    buffer = "";
    return stripLeakedToolText(safe);
  };
};

export const normalizeStatusLabel = (status: string) => {
  if (!status.trim()) return "";
  const lower = status.toLowerCase();
  // Deep Research agent stages are already user-facing — show them verbatim.
  if (
    /^(planning the research|starting the deep research|starting open deep research|generating search queries|search wave|reading source batch|extracting findings|deep synthesis|researching the web|reading the findings|analysing the findings|analyzing the findings|searching the web across|reading \d+ of \d+ sources|analysing evidence|analyzing evidence|writing (the )?(final )?report|writing \d+ analytical sections|writing section|supervisor is planning|dispatching \d+ research sub-agents|sub-agents working|verifying findings|trying hierarchical|falling back to)/i.test(
      status.trim(),
    )
  )
    return status.trim();

  const blocklist = [
    "web_search",
    "browse_website",
    "shopping_search",
    "convert_currency",
    "generate_image",
    "generate_video",
    "generate_music",
    "generate_voice",
    "canva_create_slides",
    "running ",
    "tool_call",
    "function_call",
  ];
  if (blocklist.some((b) => lower.includes(b))) return "Thinking…";
  if (
    /browser task failed|browser task timed out|working on it|navigating|loading page/i.test(lower)
  )
    return "Trying another angle…";
  if (/https?:\/\//i.test(status)) return "Looking it up…";
  if (/writing the report/i.test(lower)) return "Putting the report together…";
  if (/analyzing products/i.test(lower)) return "Weighing the best picks…";
  if (/searching for products|searching stores/i.test(lower)) return "Browsing stores…";
  if (/consulting/i.test(lower)) return "Pulling references…";
  if (/reading top sources|deep_read/i.test(lower)) return "Reading through the sources…";
  if (/searching:|gathering/i.test(lower)) return "Looking it up…";
  if (/found\s+\d+\s+(results|products)/i.test(lower)) return "Going through the results…";
  if (/search completed/i.test(lower)) return "Search done.";
  if (/browsing completed/i.test(lower)) return "Done browsing.";
  if (/reviewing/i.test(lower)) return "Skimming the sources…";
  if (
    /opening|starting|browser|megsy computer|navigat|clicking|scrolling|extracting|smart browser/i.test(
      lower,
    )
  )
    return "Looking it up…";
  return "Thinking…";
};

export const DEEP_RESEARCH_STATUS_FALLBACKS = [
  "Framing the angles to dig into…",
  "Pulling the most trustworthy sources…",
  "Reading through the material…",
  "Cross-checking what they actually say…",
  "Writing this up properly…",
];

export const DOCS_STATUS_FALLBACKS = [
  "Reading what you asked for…",
  "Picking the right document shape…",
  "Lining up the data and outline…",
  "Laying out the design…",
  "Writing the content…",
  "Rendering it live…",
  "Tightening the final pass…",
  "Almost there…",
];

export const SLIDES_CLIENT_TIMEOUT_MS = 480_000;
export const SLIDES_TIMEOUT_MESSAGE =
  "Slides generation took too long and was stopped safely. Please try again.";
