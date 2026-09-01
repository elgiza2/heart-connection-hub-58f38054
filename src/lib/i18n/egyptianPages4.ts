/**
 * Egyptian colloquial Arabic — part 4.
 * Covers the marketing pricing page (promo bar, billing toggle, plan features,
 * FAQ questions + answers, footer links) and the onboarding agent story stage.
 * Same plain in-bundle map contract as the other parts (no network, pure lookup).
 */
export const EGYPTIAN_PAGES_4: Record<string, string> = {
  // ------------------------------------------------------- شريط العرض والعدّاد
  "Limited Launch Offer": "عرض إطلاق لفترة محدودة",
  Days: "يوم",
  Hrs: "ساعة",
  Min: "دقيقة",
  Sec: "ثانية",
  "Unlock your creative power — start today": "فكّ طاقتك الإبداعية — ابدأ النهاردة",

  // ------------------------------------------------------------ توجل الفوترة
  Monthly: "شهري",
  Yearly: "سنوي",
  "4 months free": "4 شهور مجانًا",
  "65% Off": "خصم 65%",
  "1st mo": "أول شهر",
  month: "شهر",
  year: "سنة",

  // -------------------------------------------------------------- مميزات الباقة
  "240 MC / month": "240 كريدت شهريًا",
  "600 MC / month": "600 كريدت شهريًا",
  "Cloud Computer — Megsy operates a real browser and desktop for you":
    "كمبيوتر سحابي — Megsy بيشغّل متصفح وسطح مكتب حقيقي بدالك",
  "Long-running tasks up to 4 hours, continue while you are offline":
    "مهام طويلة لحد 4 ساعات، بتكمّل وإنت مش أونلاين",
  "3 background agents working in parallel": "3 وكلاء بيشتغلوا في الخلفية في نفس الوقت",
  "Deep Research with citation-backed reports": "بحث عميق بتقارير مدعومة بالمصادر",
  "Unlimited chat with every flagship model": "شات بلا حدود مع كل الموديلات القوية",
  "Unlimited image generation — no caps, no credits":
    "توليد صور بلا حدود — بدون سقف وبدون كريدت",
  "Up to 40 premium videos a month (240 MC)": "لحد 40 فيديو بريميوم في الشهر (240 كريدت)",
  "Up to 120 premium videos a month (600 MC)": "لحد 120 فيديو بريميوم في الشهر (600 كريدت)",
  "Docs, Slides & Megsy Coder — export, build and deploy":
    "مستندات وسلايدز وMegsy Coder — تصدير وبناء ونشر",
  "Team workspace with shared projects and files":
    "مساحة شغل للفريق بمشاريع وملفات مشتركة",
  "Priority support · cancel anytime": "دعم بأولوية · تلغي في أي وقت",
  "Cloud Computer with longer sessions and parallel machines":
    "كمبيوتر سحابي بجلسات أطول وأجهزة بتشتغل بالتوازي",
  "Long-running tasks up to 12 hours with automatic recovery":
    "مهام طويلة لحد 12 ساعة مع استرجاع تلقائي",
  "Unlimited parallel background agents": "وكلاء بلا حدود بيشتغلوا في الخلفية بالتوازي",
  "Deep Research at Ultra depth — longer, deeper report runs":
    "بحث عميق بمستوى Ultra — تقارير أطول وأعمق",
  "Everything in Pro, without daily limits": "كل حاجة في Pro، وبدون حدود يومية",
  "Priority compute lane — up to 3× faster runs":
    "مسار معالجة بأولوية — تنفيذ أسرع لحد 3 مرات",
  "Larger uploads, longer context and usage analytics":
    "رفع ملفات أكبر وسياق أطول وتحليلات استخدام",
  "24/7 priority support · cancel anytime": "دعم بأولوية 24 ساعة · تلغي في أي وقت",
  "Price locked for 12 months": "السعر متثبّت 12 شهر",

  // -------------------------------------------------------------------- الأسئلة
  FAQS: "أسئلة شائعة",
  "Refund Policy": "سياسة الاسترجاع",
  "How does the $7 first month work?": "أول شهر بـ 7 دولار بيشتغل إزاي؟",
  "Your first month of Pro is $7 instead of $20 (Max is $17 instead of $40). Right after your payment clears we offer you a second month at the same intro price — one tap on Pay now and you are covered for two full months. After that, the plan renews at its standard monthly price and you can cancel anytime.":
    "أول شهر في Pro بـ 7 دولار بدل 20 (وMax بـ 17 بدل 40). وأول ما الدفع يتم بنعرض عليك الشهر التاني بنفس سعر العرض — دوسة واحدة على «ادفع دلوقتي» وتبقى مغطّي شهرين كاملين. بعد كده الباقة بتتجدد بسعرها الشهري العادي وتقدر تلغي في أي وقت.",
  "Can I change or cancel my plan anytime?": "أقدر أغيّر أو ألغي باقتي في أي وقت؟",
  "Yes. From Billing settings you can upgrade, downgrade or cancel anytime. Upgrades are prorated and take effect immediately; downgrades and cancellations take effect at the end of the current cycle, and you keep full access until then.":
    "أيوه. من إعدادات الفوترة تقدر ترفّع أو تنزّل أو تلغي في أي وقت. الترقية بتتحسب بالتناسب وبتشتغل فورًا، والتخفيض والإلغاء بيشتغلوا آخر الدورة الحالية وتفضل معاك كل المميزات لحد وقتها.",
  "What are Megsy Credits (MC)?": "إيه هي كريدتس Megsy (MC)؟",
  "Chat and image generation are unlimited on every paid plan. MC is a separate monthly balance used for premium video generation and premium model runs — 240 MC on Pro (about 40 videos) and 600 MC on Max (about 120 videos). DeAPI video models never cost MC.":
    "الشات وتوليد الصور بلا حدود في كل الباقات المدفوعة. الكريدت رصيد شهري منفصل بيتستخدم في فيديوهات البريميوم وتشغيل الموديلات البريميوم — 240 كريدت في Pro (حوالي 40 فيديو) و600 كريدت في Max (حوالي 120 فيديو). موديلات فيديو DeAPI مش بتاخد كريدت خالص.",
  "What happens when I run out of MC?": "لو الكريدت خلص يحصل إيه؟",
  "Chat, images, docs, slides and research stay available — images are always unlimited, and free DeAPI video models keep working. Only premium video and premium model runs need MC, so you can top up anytime from Billing or wait for your next renewal.":
    "الشات والصور والمستندات والسلايدز والبحث بيفضلوا شغالين — الصور بلا حدود دايمًا، وموديلات فيديو DeAPI المجانية بتكمّل. الكريدت مطلوب بس لفيديوهات وموديلات البريميوم، فتقدر تشحن في أي وقت من الفوترة أو تستنى التجديد الجاي.",
  "Do unused credits roll over?": "الكريدت اللي مستخدمتوش بيترحّل للشهر الجاي؟",
  "No. Monthly MC reset at the start of each cycle. Yearly plans get bonus MC delivered upfront (Pro +720, Max +1,800) on top of four months free.":
    "لأ. الكريدت الشهري بيتصفّر أول كل دورة. والباقات السنوية بتاخد كريدت إضافي مقدّم (Pro ‎+720‎، Max ‎+1,800‎) فوق الأربع شهور المجانية.",
  "Do prices include tax?": "الأسعار شاملة الضريبة؟",
  "Prices are shown excluding tax. VAT/GST is calculated at checkout based on your billing country and shown before you confirm.":
    "الأسعار معروضة من غير ضريبة. الضريبة بتتحسب في صفحة الدفع على حسب بلد الفوترة وبتظهرلك قبل ما تأكّد.",
  "Do you offer refunds?": "بتردّوا الفلوس؟",
  "Do you offer team or enterprise plans?": "في باقات فرق أو شركات؟",
  "Yes. Max includes team workspaces, and for custom MC allocation, SSO, dedicated infrastructure, custom contracts or volume discounts contact our enterprise team via the Enterprise page or support@megsyai.com.":
    "أيوه. Max فيه مساحات شغل للفريق، ولو محتاج كريدت مخصص أو SSO أو بنية تحتية مخصصة أو عقود خاصة أو خصم كميات كلّم فريق الشركات من صفحة Enterprise أو على support@megsyai.com.",
  "Is my payment secure? Which payment methods do you accept?":
    "الدفع آمن؟ وبتقبلوا إيه من وسايل الدفع؟",

  // ------------------------------------------------------- قصة الوكيل (onboarding)
  "Build my website, publish it, connect Stripe, launch a Facebook ad and reply to customers.":
    "ابنيلي موقعي، وانشره، ووصّل Stripe، وشغّل إعلان على فيسبوك، ورد على العملاء.",
  Waiting: "مستني",
  "Splitting into tasks": "بيقسّمها مهام",
  "Running on its own computer": "شغّال على كمبيوتره لوحده",
  "Yes — I want the best": "أيوه — عايز الأفضل",
  "I've been warned, let me in": "خدت تحذيري، دخّلني",
  "Tap now to enter": "دوس دلوقتي تدخل",
};
