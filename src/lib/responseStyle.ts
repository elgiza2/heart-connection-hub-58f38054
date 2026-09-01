/**
 * Response style preferences — how the assistant should format its next reply.
 * Stored per-user in localStorage; consumed by the composer to prepend a
 * short system hint to the outgoing message.
 */
export type ResponseStyle = "auto" | "concise" | "detailed" | "formal" | "friendly";

const KEY = "megsy.response-style.v1";

const HINTS: Record<ResponseStyle, string> = {
  auto: "",
  concise: "أجب باختصار شديد (3 أسطر أو أقل، بلا مقدمات).",
  detailed: "قدّم إجابة تفصيلية عميقة مع أمثلة عملية وخطوات مرقمة.",
  formal: "استخدم لغة رسمية احترافية موجّهة للأعمال.",
  friendly: "استخدم نبرة ودودة دافئة كصديق يشرح لصديقه.",
};

export const STYLE_LABELS_AR: Record<ResponseStyle, string> = {
  auto: "تلقائي",
  concise: "مختصر",
  detailed: "تفصيلي",
  formal: "رسمي",
  friendly: "ودود",
};

export function readResponseStyle(): ResponseStyle {
  try {
    const v = localStorage.getItem(KEY) as ResponseStyle | null;
    if (v && v in HINTS) return v;
  } catch {}
  return "auto";
}

export function setResponseStyle(v: ResponseStyle) {
  try { localStorage.setItem(KEY, v); } catch {}
  try { window.dispatchEvent(new CustomEvent("megsy:response-style", { detail: v })); } catch {}
}

/** Returns the system-hint sentence to prepend, or empty string for auto. */
export function styleHint(v: ResponseStyle = readResponseStyle()): string {
  return HINTS[v] || "";
}
