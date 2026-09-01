/**
 * Client-side heuristic to suppress wasteful web-search calls when the user's
 * query clearly does not need real-time information.
 *
 * Returns `false` ⇒ do NOT enable web search for this turn.
 * Returns `true`  ⇒ leave the user/server decision unchanged (search may run).
 *
 * Conservative on purpose: when in doubt, return true so the model can still
 * decide. We only suppress when the query is *obviously* self-contained.
 */

const NO_SEARCH_PATTERNS: RegExp[] = [
  // Pure arithmetic / numeric expressions
  /^[\s\d+\-*/×÷=().,^%]+\??$/,
  // Math word: "ما هو 2+2", "calculate", "solve", "احسب"
  /^(احسب|calculate|solve|what is|كم يساوي|ما ناتج|ما هو ناتج|ما هو)\s+[\d\s+\-*/×÷=().,^%]+\??$/i,
  // Math with Arabic/English operator words: "ما هو 5 زائد 7", "what is 5 plus 7", "145 ضرب 23"
  /^(ما\s*هو\s+|كم\s+يساوي\s+|احسب\s+|what\s+is\s+|calculate\s+|how\s+much\s+is\s+)?\d+(\.\d+)?\s*(زائد|ناقص|ضرب|في|تقسيم|على|يساوي|plus|minus|times|multiplied\s+by|divided\s+by|over|equals?|and|\+|\-|\*|×|÷|\/)\s*\d+(\.\d+)?\s*[\?؟.!]*$/i,

  // Identity / personal / chit-chat with the assistant
  /^(who are you|what('?| i)s your name|من انت|ما اسمك|hi|hello|مرحبا|اهلا|سلام|salam|good (morning|evening|night)|صباح الخير|مساء الخير|تصبح على خير|كيف حالك|how are you|thanks|thank you|شكرا|شكراً|بارك الله|ok|okay|تمام|حسنا|yes|no|نعم|لا)[\s.!?؟]*$/i,
  /(?:انت|إنت|أنت|اي|إيه|ايه|what|which).*(?:نموذج|موديل|model)|(?:نموذج|موديل|model).*(?:انت|إنت|أنت|you)/i,

  // Simple formatting / transformation commands on previous content
  /^(translate|ترجم|reformat|نسّق|نسق|أعد صياغة|اعد صياغة|rewrite|summarize|لخص|اختصر|continue|أكمل|اكمل|expand|elaborate|اشرح أكثر|اشرح اكثر|format as|حوّل إلى|حول الى)(\s|$)/i,

  // Code / programming asks (model knows the language already)
  /^(write|code|اكتب|اعطني|أعطني)\s+(a\s+)?(function|class|component|hook|script|query|sql|regex|دالة|كود|سكربت|استعلام|كلاس)(\s|$)/i,

  // Creative/writing asks that don't need fresh facts
  // Allow up to 2 short filler tokens between the verb and the form (e.g. "write me a haiku")
  /^(اكتب|write|compose|أنشئ|انشئ|اعمل)\s+(?:(?:لي|me|a|an|the)\s+){0,2}(قصيدة|شعر|قصة|مقال|رسالة|نكتة|poem|story|essay|joke|haiku|song|email|letter)(\s|$)/i,

  // Conceptual "explain / define / how does X work" questions — model already knows
  /^(اشرح|اشرحلي|اشرح\s+لي|وضّح|وضح|عرّف|عرف|فسّر|فسر|explain|define|describe|tell\s+me\s+about|what\s+(is|are)|how\s+(does|do)|why\s+(does|do|is|are)|كيف\s+(يعمل|تعمل|يحدث|تحدث)|لماذا|ما\s+هو|ما\s+هي|ما\s+الفرق)\s+/i,
];

// Unicode-aware word boundary that works for Arabic + Latin.
// `\b` only treats ASCII letters/digits as word chars, so Arabic terms like
// "أخبار" or "اليوم" never match `\b...\b`. This wrapper uses lookarounds on
// any Unicode letter or digit instead.
const wb = (inner: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${inner})(?![\\p{L}\\p{N}])`, "iu");

// Strong "needs fresh data" signals — never suppress when present.
const NEEDS_SEARCH_PATTERNS: RegExp[] = [
  wb("today|tonight|right now|currently|الآن|اليوم|الليلة|حالياً|حاليا"),
  wb("news|latest|breaking|update|أخبار|اخبار|آخر|اخر|New|عاجل"),
  wb("price|stock|market|سعر|أسعار|اسعار|سوق|بورصة"),
  wb("weather|طقس|درجة الحرارة"),
  wb("202[5-9]|203\\d"), // recent / future years
  /https?:\/\//i, // URLs almost always need fetching
  wb("score|match|game|نتيجة|مباراة"),
];

export function shouldUseWebSearch(userMessage: string, userToggle: boolean): boolean {
  // User explicitly turned search OFF → respect them.
  if (!userToggle) return false;

  const text = (userMessage || "").trim();
  if (!text) return userToggle;
  if (text.length > 600) return userToggle; // long prompts: let server decide

  // If the message clearly asks for fresh info, keep search on.
  if (NEEDS_SEARCH_PATTERNS.some((re) => re.test(text))) return true;

  // If the message matches a "no search needed" pattern, suppress.
  if (NO_SEARCH_PATTERNS.some((re) => re.test(text))) return false;

  // Default: respect the user's toggle.
  return userToggle;
}
