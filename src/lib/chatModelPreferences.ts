export type ModelEffort = "low" | "medium" | "high" | "extra" | "max";
export type ArabicDialect = "auto" | "msa" | "egy" | "gulf" | "levant" | "maghreb";

export interface ChatModelPreferences {
  effort: ModelEffort;
  deepThinking: boolean;
  islamicFinance: boolean;
  ramadanAware: boolean;
  arabicDialect: ArabicDialect;
  dialectMirror: boolean;
}

const STORAGE_KEY = "megsy.chat-model-preferences.v1";
const DEFAULTS: ChatModelPreferences = {
  effort: "medium",
  deepThinking: false,
  islamicFinance: false,
  ramadanAware: true,
  arabicDialect: "auto",
  dialectMirror: true,
};

const VALID_DIALECTS: ArabicDialect[] = ["auto", "msa", "egy", "gulf", "levant", "maghreb"];

export function readChatModelPreferences(): ChatModelPreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as Partial<ChatModelPreferences> | null;
    const effort = stored?.effort;
    const dialect = stored?.arabicDialect;
    return {
      effort: effort && ["low", "medium", "high", "extra", "max"].includes(effort) ? effort : DEFAULTS.effort,
      deepThinking: stored?.deepThinking === true,
      islamicFinance: stored?.islamicFinance === true,
      ramadanAware: stored?.ramadanAware !== false,
      arabicDialect: dialect && VALID_DIALECTS.includes(dialect as ArabicDialect) ? (dialect as ArabicDialect) : DEFAULTS.arabicDialect,
      dialectMirror: stored?.dialectMirror !== false,
    };
  } catch {
    return DEFAULTS;
  }
}

export function setChatModelPreferences(preferences: ChatModelPreferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    window.dispatchEvent(new CustomEvent("megsy:chat-model-preferences", { detail: preferences }));
  } catch {}
}

// Very rough Hijri approximation (no external lib). Good enough to know "is it Ramadan-ish".
function approxHijriMonth(date = new Date()): number {
  // Reference: 2024-03-11 = 1 Ramadan 1445 (approx.)
  const REF = Date.UTC(2024, 2, 11);
  const days = Math.floor((date.getTime() - REF) / 86_400_000);
  // Hijri year ~ 354.367 days, month ~ 29.53 days.
  const monthOffset = Math.floor(days / 29.53);
  const monthIndex = (((9 + monthOffset) % 12) + 12) % 12; // 9 = Ramadan
  return monthIndex + 1; // 1..12
}

export function isRamadan(date = new Date()): boolean {
  return approxHijriMonth(date) === 9;
}

export function chatModelPreferenceHint(preferences = readChatModelPreferences()) {
  const effortHints: Record<ModelEffort, string> = {
    low: "استخدم أقل قدر مناسب من الاستدلال وأجب بسرعة.",
    medium: "استخدم استدلالاً متوازناً يناسب المهمة.",
    high: "حلّل المهمة بعناية وقدّم إجابة قوية ومدروسة.",
    extra: "استخدم استدلالاً عميقاً وتحقق من Details قبل الإجابة.",
    max: "استخدم أقصى قوة استدلال متاحة للمسائل شديدة التعقيد.",
  };
  const parts: string[] = [effortHints[preferences.effort]];
  if (preferences.deepThinking) {
    parts.push("فعّل التفكير العميق للمهام الطويلة: خطط داخلياً، راجع النتيجة، ثم قدّم الإجابة النهائية بوضوح.");
  }
  if (preferences.dialectMirror) {
    parts.push("إذا كتب المستخدم بلهجة عربية عامية (مصرية/خليجية/شامية/مغاربية) فحاكِ نفس اللهجة بطبيعية بدل الفصحى الجافة، مع الحفاظ على الوضوح.");
  }
  if (preferences.arabicDialect && preferences.arabicDialect !== "auto") {
    const dialectMap: Record<ArabicDialect, string> = {
      auto: "",
      msa: "استخدم العربية الفصحى الحديثة عند الرد بالعربية.",
      egy: "عند الرد بالعربية، استخدم اللهجة المصرية الطبيعية.",
      gulf: "عند الرد بالعربية، استخدم اللهجة الخليجية الطبيعية.",
      levant: "عند الرد بالعربية، استخدم اللهجة الشامية الطبيعية.",
      maghreb: "عند الرد بالعربية، استخدم اللهجة المغاربية الطبيعية.",
    };
    parts.push(dialectMap[preferences.arabicDialect]);
  }
  if (preferences.islamicFinance) {
    parts.push("عند تقديم نصائح أو أمثلة مالية أو اقتصادية، التزم بضوابط التمويل الإسلامي: تجنّب الربا والفوائد الربوية، واقترح بدائل متوافقة مع الشريعة (مرابحة، إجارة، مضاربة، صكوك، تكافل) عند الحاجة.");
  }
  if (preferences.ramadanAware && isRamadan()) {
    parts.push("نحن حالياً في month رمضان المبارك. راعِ ذلك في الأمثلة والاقتراحات (مواعيد الإفطار/السحور، الطاقة المتاحة، الأولويات الروحية) بلطف ودون مبالغة.");
  }
  return parts.filter(Boolean).join(" ");
}
