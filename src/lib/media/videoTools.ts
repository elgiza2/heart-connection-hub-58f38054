// تفضيلات وضع الفيديو: نمط UGC + الأبعاد المتعددة لنفس الفيديو.
// تُحفظ محليًا ويقرأها مسار التوليد قبل بناء الخطة.

const KEY = "megsy_video_tools_v1";

export interface VideoToolsPrefs {
  /** توليد بأسلوب محتوى المستخدمين (UGC): كاميرا هاتف، إضاءة طبيعية، عفوية. */
  ugc: boolean;
  /** More aspect ratios تُولَّد لنفس الفيديو (مثل 9:16 و1:1 بجانب 16:9). */
  extraAspects: string[];
}

const DEFAULTS: VideoToolsPrefs = { ugc: false, extraAspects: [] };

export const UGC_STYLE_PROMPT =
  "Shot as authentic user-generated content: handheld smartphone camera, natural available lighting, slight camera shake, casual candid framing, real person speaking to camera, unpolished realistic look, no cinematic color grading.";

export function loadVideoTools(): VideoToolsPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      ugc: !!parsed?.ugc,
      extraAspects: Array.isArray(parsed?.extraAspects) ? parsed.extraAspects : [],
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveVideoTools(prefs: VideoToolsPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
