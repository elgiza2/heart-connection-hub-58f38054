/**
 * Localized strings for the whole UI — English + Egyptian colloquial Arabic.
 *
 * Everything lives in this file (no i18n library, no remote dictionaries, no
 * DOM translation pass), so switching languages costs zero network requests
 * and zero runtime lag.
 *
 * Usage:
 *   import { t, useUserLang, setUserLang, initUserLang } from "@/lib/authI18n";
 *   const lang = useUserLang();
 *   <button>{t("signIn")}</button>
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeErrorMessage } from "@/lib/sanitizeError";
import { EGYPTIAN_DICT } from "@/lib/i18n/egyptianDict";
import { EGYPTIAN_EXTRA } from "@/lib/i18n/egyptianExtra";
import { EGYPTIAN_PAGES } from "@/lib/i18n/egyptianPages";
import { EGYPTIAN_PAGES_2 } from "@/lib/i18n/egyptianPages2";
import { setPayRegion } from "@/lib/payRegion";


export type AuthLang = "en" | "ar-eg";

const SUPPORTED: AuthLang[] = ["en", "ar-eg"];
const RTL_LANGS: AuthLang[] = ["ar-eg"];

type Entry = Partial<Record<AuthLang, string>> & { en: string };


const DICT: Record<string, Entry> = {
  // ── Toast / error messages (existing) ────────────────────────────────
  invalidEmail: { en: "Please enter a valid email address", "ar-eg": "من فضلك اكتب إيميل صحيح" },
  couldNotCheckEmail: { en: "Could not check email", "ar-eg": "معرفناش نتأكد من الإيميل" },
  otpSent: { en: "Verification code sent to your email", "ar-eg": "بعتنالك كود التحقق على الإيميل" },
  couldNotSendCode: { en: "Could not send code", "ar-eg": "معرفناش نبعت الكود" },
  welcomeBack: { en: "Welcome back!", "ar-eg": "نورت تاني!" },
  wrongPassword: { en: "Wrong password. Please try again or reset it.", "ar-eg": "كلمة السر غلط. جرب تاني أو غيّرها." },
  noAccountFound: { en: "No account found — let's create one", "ar-eg": "مفيش حساب — يلا نعمل واحد" },
  loginFailed: { en: "Login failed", "ar-eg": "الدخول فشل" },
  verificationFailed: { en: "Verification failed", "ar-eg": "التحقق فشل" },
  passwordMinLength: { en: "Password must be at least 8 characters", "ar-eg": "كلمة السر لازم تكون 8 حروف على الأقل" },
  emailExists: { en: "This email already has an account", "ar-eg": "الإيميل ده ليه حساب فعلاً" },
  emailExistsDesc: { en: "Please sign in with your existing password.", "ar-eg": "سجّل دخول بكلمة السر بتاعتك." },
  accountCreated: { en: "Account created!", "ar-eg": "الحساب اتعمل!" },
  couldNotCreate: { en: "Could not create account", "ar-eg": "معرفناش نعمل الحساب" },
  passwordUpdated: { en: "Password updated!", "ar-eg": "كلمة السر اتحدثت!" },
  passwordUpdateFailed: { en: "Failed to update password", "ar-eg": "معرفناش نحدّث كلمة السر" },
  continueWithPassword: { en: "Continue with your password", "ar-eg": "كمّل بكلمة السر" },
  previewProxyBlocked: { en: "Preview proxy blocked the login request. Please try on the published site.", "ar-eg": "المعاينة حجبت طلب الدخول. جرّب على الموقع المنشور." },
  typeDelete: { en: "Please type DELETE to confirm", "ar-eg": 'اكتب "DELETE" عشان تأكد' },
  enterPasswordConfirm: { en: "Please enter your password to confirm", "ar-eg": "ادخل كلمة السر عشان تأكد" },
  incorrectPassword: { en: "Incorrect password", "ar-eg": "كلمة السر غلط" },
  accountDeletionRequested: { en: "Account deletion requested. You will be signed out.", "ar-eg": "طلبنا حذف الحساب. هيتم تسجيل خروجك." },
  deleteAccountFailed: { en: "Failed to delete account", "ar-eg": "معرفناش نحذف الحساب" },
  freeCreditsAdded: { en: "+15 free credits added — welcome to Megsy!", "ar-eg": "+15 كريدت مجاني — أهلاً بيك في Megsy!" },

  // ── AuthPage UI (new) ────────────────────────────────────────────────
  seoTitle: { en: "Sign in to Megsy AI", "ar-eg": "سجّل دخولك في Megsy AI" },
  seoDesc: { en: "Sign in or create your Megsy AI account.", "ar-eg": "سجّل دخول أو اعمل حساب في Megsy AI." },
  back: { en: "Back", "ar-eg": "رجوع" },
  getStarted: { en: "Get started", "ar-eg": "يلا نبدأ" },
  emailTitle: { en: "Welcome to Megsy", "ar-eg": "أهلاً بيك في Megsy" },
  emailSub: { en: "Enter your email to sign in or create an account.", "ar-eg": "اكتب إيميلك عشان تدخل أو تعمل حساب." },
  passwordTitle: { en: "Enter your password", "ar-eg": "اكتب كلمة السر" },
  verifyEmailTitle: { en: "Verify your email", "ar-eg": "أكّد الإيميل بتاعك" },
  otpSubTemplate: { en: "We sent a 6-digit code to {email}", "ar-eg": "بعتنا كود من 6 أرقام على {email}" },
  otp2faSubTemplate: { en: "Enter the code sent to {email}", "ar-eg": "اكتب الكود اللي وصلك على {email}" },
  setPasswordTitle: { en: "Set a password", "ar-eg": "اختار كلمة سر" },
  atLeast8: { en: "At least 8 characters.", "ar-eg": "8 حروف على الأقل." },
  regionQuestion: { en: "Where are you billed from?", "ar-eg": "إنت من العالم العربي؟" },
  regionArab: { en: "Arab world", "ar-eg": "العالم العربي" },
  regionGlobal: { en: "International", "ar-eg": "دولي" },

  twoFATitle: { en: "Two-factor verification", "ar-eg": "تحقق بخطوتين" },
  forgotTitle: { en: "Reset your password", "ar-eg": "إعادة ضبط كلمة السر" },
  forgotSubTemplate: { en: "We'll send a verification code to {email}", "ar-eg": "هنبعت كود تحقق على {email}" },
  chooseNewPasswordTitle: { en: "Choose a new password", "ar-eg": "اختار كلمة سر جديدة" },
  signIn: { en: "Sign in", "ar-eg": "دخول" },
  createAccount: { en: "Create account", "ar-eg": "اعمل حساب" },
  resetPassword: { en: "Reset password", "ar-eg": "غيّر كلمة السر" },
  continue: { en: "Continue", "ar-eg": "كمّل" },
  checking: { en: "Checking…", "ar-eg": "بنتأكد…" },
  signingIn: { en: "Signing in…", "ar-eg": "بنسجل دخولك…" },
  creating: { en: "Creating…", "ar-eg": "بنعمل الحساب…" },
  updating: { en: "Updating…", "ar-eg": "بنحدّث…" },
  sending: { en: "Sending…", "ar-eg": "بنبعت…" },
  verifying: { en: "Verifying…", "ar-eg": "بنتحقق…" },
  passwordPlaceholder: { en: "Password", "ar-eg": "كلمة السر" },
  passwordMinPlaceholder: { en: "Password (min 8 characters)", "ar-eg": "كلمة السر (8 حروف على الأقل)" },
  newPasswordMinPlaceholder: { en: "New password (min 8 characters)", "ar-eg": "كلمة سر جديدة (8 حروف على الأقل)" },
  forgotPasswordLink: { en: "Forgot password?", "ar-eg": "نسيت كلمة السر؟" },
  or: { en: "or", "ar-eg": "أو" },
  continueWithGoogle: { en: "Continue with Google", "ar-eg": "كمّل بجوجل" },
  continueWithGitHub: { en: "Continue with GitHub", "ar-eg": "كمّل بـ GitHub" },
  continueWithTelegram: { en: "Continue with Telegram", "ar-eg": "كمّل بـ Telegram" },
  inviteCode: { en: "Invite code", "ar-eg": "كود الدعوة" },
  remove: { en: "Remove", "ar-eg": "شيله" },
  haveInviteCode: { en: "Have an invite code?", "ar-eg": "معاك كود دعوة؟" },
  invitedByPrefix: { en: "You'll be credited to ", "ar-eg": "هتتحسبلك دعوة من " },
  invitedBySuffix: { en: " after signup.", "ar-eg": " بعد ما تسجّل." },
  sendResetCode: { en: "Send reset code", "ar-eg": "ابعت كود إعادة الضبط" },
  updatePassword: { en: "Update password", "ar-eg": "حدّث كلمة السر" },
  resendCode: { en: "Resend code", "ar-eg": "ابعت الكود تاني" },
  resendInSecondsTemplate: { en: "Resend in {n}s", "ar-eg": "ابعت تاني بعد {n} ث" },
  copy: { en: "Copy", "ar-eg": "نسخ" },
  paste: { en: "Paste", "ar-eg": "لصق" },
  termsAgreePrefix: { en: "By continuing, you agree to our ", "ar-eg": "بالاستمرار، إنت موافق على " },
  termsLink: { en: "Terms", "ar-eg": "الشروط" },
  and: { en: " and ", "ar-eg": " و " },
  privacyLink: { en: "Privacy Policy", "ar-eg": "سياسة الخصوصية" },
  emailPlaceholder: { en: "you@example.com", "ar-eg": "you@example.com" },

  // ── Settings screen labels ───────────────────────────────────────────
  settingsTitle: { en: "Settings", "ar-eg": "الإعدادات" },
  settingsAccount: { en: "Account Settings", "ar-eg": "إعدادات الحساب" },
  settingsPreferences: { en: "Preferences", "ar-eg": "التفضيلات" },
  settingsMore: { en: "Settings", "ar-eg": "الإعدادات" },
  rowAccount: { en: "Account", "ar-eg": "الحساب" },
  rowBilling: { en: "Billing", "ar-eg": "الفواتير" },
  rowAppearance: { en: "Appearance", "ar-eg": "الشكل" },
  rowIntegrations: { en: "Integrations", "ar-eg": "الربط بالتطبيقات" },
  rowHelp: { en: "Help & Support", "ar-eg": "المساعدة والدعم" },
  rowPrivacy: { en: "Privacy & Data", "ar-eg": "الخصوصية والبيانات" },
  rowStatus: { en: "System Status", "ar-eg": "حالة النظام" },
  rowLanguage: { en: "Language", "ar-eg": "اللغة" },
  rowLogout: { en: "Logout", "ar-eg": "تسجيل الخروج" },
  upgradePremium: { en: "Upgrade to Premium", "ar-eg": "اترقّى لـ Premium" },
  languageSheetTitle: { en: "Choose language", "ar-eg": "اختار اللغة" },
  languageSaved: { en: "Language updated", "ar-eg": "اللغة اتحدثت" },

  // ── MobileAuthFlow (intro screen) ────────────────────────────────────
  mobileIntroLine1: { en: "One subscription.", "ar-eg": "اشتراك واحد بس." },
  mobileIntroLine2: { en: "Every frontier model.", "ar-eg": "كل الموديلات المتقدمة." },
  mobileIntroSub: { en: "Chat, images, video, slides, code and deep research — in one place.", "ar-eg": "شات، صور، فيديو، شرايح، كود وبحث معمّق — كله في مكان واحد." },
  signInWithEmail: { en: "Sign in with Email", "ar-eg": "دخول بالإيميل" },
  continueWithEmail: { en: "Continue with email", "ar-eg": "كمّل بالإيميل" },
  mobileAuthSub: { en: "Sign in to access your AI-powered creations.", "ar-eg": "سجّل دخول عشان توصل لإبداعاتك اللي عاملها بالذكاء الاصطناعي." },
  emailLabel: { en: "Email", "ar-eg": "الإيميل" },
  passwordLabel: { en: "Password", "ar-eg": "كلمة السر" },
  forgotPasswordQ: { en: "Forgot Password?", "ar-eg": "نسيت كلمة السر؟" },
};

const UI_DICT: Record<string, Entry> = {
  sidebarHome: { en: "Home", "ar-eg": "الرئيسية" },
  sidebarLibrary: { en: "Library", "ar-eg": "المكتبة" },
  sidebarEarn: { en: "Earn", "ar-eg": "اكسب" },
  sidebarCloud: { en: "Cloud", "ar-eg": "السحابة" },
  newChat: { en: "New chat", "ar-eg": "شات جديد" },
  newProject: { en: "New project", "ar-eg": "مشروع جديد" },
  noConversations: { en: "No conversations yet", "ar-eg": "لسه مفيش شاتات" },
  untitled: { en: "Untitled", "ar-eg": "من غير عنوان" },
  logIn: { en: "Log in", "ar-eg": "دخول" },
  upgrade: { en: "Upgrade", "ar-eg": "ترقية" },
  getPlus: { en: "Get Plus", "ar-eg": "هات بلس" },
  placeholderAsk: { en: "Ask Megsy anything…", "ar-eg": "اسأل Megsy أي حاجة…" },
  placeholderProject: { en: "Start your next project with one idea…", "ar-eg": "ابدأ مشروعك الجاي بفكرة واحدة…" },
  greeting1: { en: "Let's cook something up.", "ar-eg": "يلا نعمل حاجة حلوة." },
  greeting2: { en: "What should we build today?", "ar-eg": "نبني إيه النهارده؟" },
  greeting3: { en: "Drop an idea and I'll run with it.", "ar-eg": "قول فكرة وأنا أكمّل." },
  greeting4: { en: "Start with a thought. I'll shape it.", "ar-eg": "ابدأ بفكرة وأنا أظبطها." },
  greeting5: { en: "Tell me what you want to create.", "ar-eg": "قوللي عايز تعمل إيه." },

  placeholderAllInOne: { en: "Design, write, research — all in one place", "ar-eg": "صمّم واكتب وابحث — كله في مكان واحد" },
  placeholderType: { en: "Type a question and let's get started", "ar-eg": "اكتب سؤال ويلا نبدأ" },
  megsyAsking: { en: "Megsy is asking", "ar-eg": "Megsy بيسأل" },
  skipQuestion: { en: "Skip question", "ar-eg": "عدّي السؤال" },
  typeOwnAnswer: { en: "Type your own answer…", "ar-eg": "اكتب إجابتك…" },
  sendAnswer: { en: "Send answer", "ar-eg": "ابعت الإجابة" },
  editing: { en: "Editing", "ar-eg": "بتعدّل" },
  cancelEdit: { en: "Cancel edit", "ar-eg": "إلغاء التعديل" },
  openTools: { en: "Open attachments and tools", "ar-eg": "افتح المرفقات والأدوات" },
  stopGeneration: { en: "Stop generation", "ar-eg": "وقف التوليد" },
  sendMessage: { en: "Send message", "ar-eg": "ابعت الرسالة" },
  googleProvider: { en: "Google", "ar-eg": "جوجل" },
  muteVideo: { en: "Mute video", "ar-eg": "اكتم صوت الفيديو" },
  unmuteVideo: { en: "Unmute video", "ar-eg": "شغّل صوت الفيديو" },
  showcaseTitle: { en: "Built for makers", "ar-eg": "معمول للمبدعين" },
  imageModels: { en: "Image models", "ar-eg": "موديلات الصور" },
  videoModels: { en: "Video models", "ar-eg": "موديلات الفيديو" },
  imageModelsDesc: { en: "Generate stunning visuals with the world's most powerful image AI models.", "ar-eg": "اعمل صور مبهرة بأقوى موديلات صور AI في العالم." },
  videoModelsDesc: { en: "Create cinematic videos from text or images with cutting-edge video AI.", "ar-eg": "اعمل فيديوهات سينمائية من نص أو صور بأحدث موديلات فيديو AI." },
  finalCtaTitle: { en: "Every AI model. One subscription.", "ar-eg": "كل موديلات AI. اشتراك واحد." },
  finalCtaSubtitle: { en: "Replace ChatGPT, Midjourney, Sora, Gamma and Bolt with one plan. Cancel anytime.", "ar-eg": "استبدل ChatGPT وMidjourney وSora وGamma وBolt بخطة واحدة. لغي في أي وقت." },
  startCreating: { en: "Start creating", "ar-eg": "ابدأ دلوقتي" },
  allModelsIncluded: { en: "All flagship models included", "ar-eg": "كل الموديلات القوية متاحة" },
  creditBasedVideos: { en: "Credit-based videos", "ar-eg": "فيديوهات بالكريدت" },
  thinking: { en: "Thinking…", "ar-eg": "بيفكّر…" },
  thoughts: { en: "Thinking", "ar-eg": "تفكير" },
  thinkingDeep: { en: "Thinking deeply…", "ar-eg": "بيفكّر بعمق…" },
  working: { en: "Working…", "ar-eg": "شغال…" },
  done: { en: "Done", "ar-eg": "تمام" },
  failed: { en: "Failed", "ar-eg": "فشل" },
  somethingWentWrong: { en: "Something went wrong", "ar-eg": "فيه حاجة غلط حصلت" },
  goodMorning: { en: "Good morning", "ar-eg": "صباح الخير" },
  goodAfternoon: { en: "Good afternoon", "ar-eg": "مساء الخير" },
  goodEvening: { en: "Good evening", "ar-eg": "مساء الخير" },
  stillUp: { en: "Still up", "ar-eg": "لسه صاحي" },
  lateOne: { en: "Late one", "ar-eg": "وقت متأخر" },
  there: { en: "there", "ar-eg": "يا صاحبي" },
  whatsOnYourMind: { en: "What's on your mind", "ar-eg": "بتفكر في إيه" },
  whereToToday: { en: "Where to today", "ar-eg": "رايح فين النهارده" },
  readyWhenYouAre: { en: "Ready when you are", "ar-eg": "جاهز لما تكون جاهز" },
  loadingMegsy: { en: "Loading Megsy", "ar-eg": "Megsy بيحمّل" },
};

const STORAGE_KEY = "app_lang";
const DETECTED_FLAG_KEY = "app_lang:detected";

// ── Public helpers ─────────────────────────────────────────────────────

export function isSupportedLang(code: string): code is AuthLang {
  return (SUPPORTED as string[]).includes(code);
}

/** Read the stored language, if any. */
export function readStoredLang(): AuthLang | null {
  try {
    const raw = typeof localStorage !== "undefined"
      ? localStorage.getItem(STORAGE_KEY) || localStorage.getItem("language")
      : null;
    if (!raw) return null;
    const lower = raw.toLowerCase();
    if (isSupportedLang(lower)) return lower;
    const base = lower.split("-")[0];
    if (isSupportedLang(base)) return base as AuthLang;
  } catch {
    // ignore
  }
  return null;
}

/** Guess the language from the browser: Arabic speakers → Egyptian Arabic. */
export function detectLang(): AuthLang {
  if (typeof navigator === "undefined") return "en";
  try {
    const tags = [navigator.language || "", ...(navigator.languages || [])].map((s) =>
      s.toLowerCase(),
    );
    if (tags.some((tag) => tag.startsWith("ar"))) return "ar-eg";
  } catch {
    // ignore
  }
  return "en";
}

let currentLang: AuthLang | null = null;

/** Current effective language: stored → detected → 'en'. */
export function getUserLang(): AuthLang {
  if (currentLang) return currentLang;
  currentLang = readStoredLang() ?? "en";
  return currentLang;
}

function applyHtmlLang(lang: AuthLang) {
  currentLang = lang;
  if (typeof document === "undefined") return;
  const rtl = RTL_LANGS.includes(lang);
  document.documentElement.setAttribute("lang", lang === "ar-eg" ? "ar" : "en");
  document.documentElement.setAttribute("dir", rtl ? "rtl" : "ltr");
}



/** The language choice also drives the commercial zone (Arab vs International). */
function applyZoneForLang(lang: AuthLang) {
  setPayRegion(lang === "ar-eg" ? "arab" : "global");
  try {
    document.documentElement.dataset.payZone = lang === "ar-eg" ? "arab" : "global";
    window.dispatchEvent(new CustomEvent("megsy:zone", { detail: lang === "ar-eg" ? "arab" : "global" }));
  } catch {
    // ignore
  }
}

function persistLangLocally(lang: AuthLang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
    localStorage.setItem("language", lang);
    localStorage.setItem(DETECTED_FLAG_KEY, "1");
    localStorage.setItem("language-autodetected", "1");
  } catch {
    // ignore
  }
}

const listeners = new Set<(lang: AuthLang) => void>();
function emitChange(lang: AuthLang) {
  for (const cb of listeners) {
    try {
      cb(lang);
    } catch {
      // ignore listener errors
    }
  }
}

/** Persist the user's language choice everywhere (localStorage + profile). */
export async function setUserLang(
  lang: AuthLang,
  opts: { syncRemote?: boolean } = {},
): Promise<void> {
  if (!isSupportedLang(lang)) return;
  persistLangLocally(lang);
  applyHtmlLang(lang);
  applyZoneForLang(lang);
  emitChange(lang);
  try {
    window.dispatchEvent(new Event("languagechange-custom"));
  } catch {
    // ignore
  }

  if (opts.syncRemote !== false) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id) {
        await supabase
          .from("user_chat_settings")
          .upsert(
            { user_id: user.id, preferred_language: lang, updated_at: new Date().toISOString() },
            { onConflict: "user_id" },
          );
      }
    } catch {
      // Silent — local preference still applies.
    }
  }
}

/**
 * Run once on app boot: apply the stored language, or detect + persist it on
 * the first visit so the choice stays stable.
 */
export async function initUserLang(): Promise<AuthLang> {
  let lang = readStoredLang();
  if (!lang) {
    lang = detectLang();
    persistLangLocally(lang);
  }
  applyHtmlLang(lang);
  applyZoneForLang(lang);
  emitChange(lang);
  return lang;
}


/** React hook: returns current language and re-renders on change. */
export function useUserLang(): AuthLang {
  const [lang, setLang] = useState<AuthLang>(() => getUserLang());
  useEffect(() => {
    const cb = (l: AuthLang) => setLang(l);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);
  return lang;
}

/** Translate one key. */
export function t(key: string, lang?: AuthLang): string {
  const L = lang || getUserLang();
  const entry = (DICT as Record<string, Entry>)[key] || UI_DICT[key];
  if (!entry) return String(key);
  return entry[L] || entry.en;
}


/** Translate + interpolate `{name}` placeholders. */
export function tf(
  key: string,
  vars: Record<string, string | number>,
  lang?: AuthLang,
): string {
  const raw = t(key, lang);
  return raw.replace(/\{(\w+)\}/g, (_, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : `{${k}}`,
  );
}

/**
 * Translate a thrown Supabase/network error into the user's language.
 * Falls back to a localized version of the provided fallback key.
 */
export function translateAuthError(
  err: unknown,
  fallbackKey: string = "loginFailed",
): string {
  const raw = sanitizeErrorMessage(err, "");
  const msg = (raw || "").toLowerCase();

  if (/invalid login|invalid credentials|wrong password|incorrect.*password/.test(msg)) {
    return t("wrongPassword");
  }
  if (/user not found|no.*account/.test(msg)) {
    return t("noAccountFound");
  }
  if (/email.*invalid|invalid.*email/.test(msg)) {
    return t("invalidEmail");
  }
  if (/already (registered|exists)|user.*exists/.test(msg)) {
    return t("emailExists");
  }
  if (/password.*(at least|short|min)/.test(msg)) {
    return t("passwordMinLength");
  }
  if (raw) return raw;
  return t(fallbackKey);
}

export const AVAILABLE_LANGS: { code: AuthLang; label: string; native: string }[] = [
  { code: "en", label: "English — International zone", native: "English" },
  { code: "ar-eg", label: "العربية — المنطقة العربية", native: "العربية" },
];

/**
 * Translate a literal English string by looking it up in the in-file
 * dictionaries. Pure memory lookup — no network, no DOM walking.
 */
const BY_ENGLISH: Map<string, Entry> = (() => {
  const m = new Map<string, Entry>();
  for (const entry of [...Object.values(UI_DICT), ...Object.values(DICT)]) {
    if (!m.has(entry.en)) m.set(entry.en, entry);
  }
  return m;
})();

export function translateExactText(text: string, lang?: AuthLang): string {
  const L = lang || getUserLang();
  if (L === "en") return text;
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return text;
  const entry = BY_ENGLISH.get(normalized);
  if (entry) return entry[L] || entry.en;
  // Fall back to the bundled Egyptian dictionaries (same data the DOM pass uses).
  return (
    EGYPTIAN_EXTRA[normalized] ||
    EGYPTIAN_PAGES[normalized] ||
    EGYPTIAN_PAGES_2[normalized] ||
    EGYPTIAN_DICT[normalized] ||
    text
  );
}


