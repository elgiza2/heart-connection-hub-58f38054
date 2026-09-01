/** Campaign + welcome email copy in English and Arabic. */
import type { CleanEmailInput, MailLang } from "./campaign.ts";

const SITE = "https://megsyai.com";

export function campaignEmail(lang: MailLang, heroUrl: string): CleanEmailInput {
  if (lang === "ar") {
    return {
      lang,
      heroUrl,
      heroAlt: "ميغسي",
      title: "ميغسي عاد وأقوى من أي وقت",
      intro:
        "جمعنا كل ما تحتاجه في مكان واحد: محادثة ذكية، كمبيوتر يعمل نيابة عنك، توليد صور وفيديو، بحث عميق، عروض تقديمية، بريد إلكتروني خاص بك، وبرمجة ونشر مواقع كاملة. افتح حسابك وجرّب كل شيء الآن.",
      bullets: [
        ["الكمبيوتر الذكي", "اطلب مهمة وسيقوم ميغسي بتشغيل متصفح حقيقي، يبحث، يملأ النماذج، ويكمل العمل بدلاً عنك."],
        ["توليد الصور والفيديو", "حوّل فكرة إلى صورة احترافية أو فيديو قصير خلال ثوانٍ."],
        ["البحث العميق", "تقارير مفصّلة بمصادر موثوقة لأي موضوع تختاره."],
        ["العروض والمستندات", "سلايدز ومستندات جاهزة للتقديم بضغطة واحدة."],
        ["بريد ميغسي", "بريد إلكتروني خاص بك يستطيع الذكاء الاصطناعي القراءة منه والإرسال عبره."],
        ["برمجة ونشر", "اطلب موقعًا أو تطبيقًا وسيكتبه ميغسي وينشره لك مباشرة."],
        ["الدفع بفودافون كاش", "لعملائنا في مصر والوطن العربي: الاشتراك متاح بفودافون كاش والمحافظ المحلية والبطاقات، بالجنيه المصري وبدون أي تعقيد."],
      ],
      note: "لديك رصيد مجاني في انتظارك عند أول دخول. جرّب المهام الطويلة والكمبيوتر الذكي بنفسك.",
      ctaLabel: "ابدأ الآن مجانًا",
      ctaUrl: `${SITE}/chat`,
    };
  }
  return {
    lang,
    heroUrl,
    heroAlt: "Megsy",
    title: "Megsy is back, and it does everything",
    intro:
      "One workspace for smart chat, a computer that works for you, image and video generation, deep research, slides, your own email address, and full coding and deployment. Sign back in and try it all.",
    bullets: [
      ["Computer agent", "Give it a task and Megsy drives a real browser: searches, fills forms and finishes the job for you."],
      ["Image and video generation", "Turn an idea into a polished image or a short video in seconds."],
      ["Deep research", "Detailed, sourced reports on any topic you choose."],
      ["Slides and documents", "Presentation-ready decks and documents in one prompt."],
      ["Megsy Mail", "Your own inbox that the AI can read from and send through."],
      ["Build and deploy", "Ask for a site or an app and Megsy writes it and ships it live."],
      ["Flexible payments", "Cards worldwide, plus local wallets for the Middle East."],
    ],
    note: "Free credits are waiting on your next sign-in. Start with a long task and watch it run.",
    ctaLabel: "Open Megsy",
    ctaUrl: `${SITE}/chat`,
  };
}

export function welcomeEmail(lang: MailLang, heroUrl: string, code?: string | null): CleanEmailInput {
  if (lang === "ar") {
    return {
      lang,
      heroUrl,
      heroAlt: "أهلاً بك في ميغسي",
      title: code ? "رمز تأكيد حسابك" : "أهلاً بك في ميغسي",
      intro: code
        ? `استخدم الرمز ${code} لتأكيد بريدك والدخول إلى ميغسي. الرمز صالح لفترة قصيرة.`
        : "حسابك جاهز. ميغسي مساعدك للمحادثة، الصور والفيديو، البحث العميق، العروض، البريد، والبرمجة والنشر.",
      bullets: [
        ["ابدأ بمحادثة", "اسأل أي شيء واحصل على إجابة مع مصادر."],
        ["جرّب الكمبيوتر الذكي", "اطلب مهمة كاملة على الإنترنت وسينفذها نيابة عنك."],
        ["أنشئ صورة أو فيديو", "من وصف بسيط إلى نتيجة احترافية."],
      ],
      note: "يمكنك إيقاف رسائل البريد في أي وقت من إعدادات الإشعارات.",
      ctaLabel: "الدخول إلى ميغسي",
      ctaUrl: `${SITE}/chat`,
    };
  }
  return {
    lang,
    heroUrl,
    heroAlt: "Welcome to Megsy",
    title: code ? "Your verification code" : "Welcome to Megsy",
    intro: code
      ? `Use the code ${code} to confirm your email and get into Megsy. It expires shortly.`
      : "Your account is ready. Megsy handles chat, images and video, deep research, slides, email, and full build-and-deploy.",
    bullets: [
      ["Start a chat", "Ask anything and get an answer with sources."],
      ["Try the computer agent", "Hand over a full task on the web and let it run."],
      ["Create an image or video", "From a simple prompt to a polished result."],
    ],
    note: "You can turn off email notifications any time in notification settings.",
    ctaLabel: "Open Megsy",
    ctaUrl: `${SITE}/chat`,
  };
}
