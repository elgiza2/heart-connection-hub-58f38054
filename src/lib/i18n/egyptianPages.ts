/**
 * Egyptian colloquial Arabic for the remaining app + legal pages.
 *
 * Plain in-bundle map (English -> Egyptian). No network, no i18n library.
 * Keys must match the exact English text rendered in the UI.
 */
export const EGYPTIAN_PAGES: Record<string, string> = {
  // ---------------------------------------------------------------- welcome
  "Choose your experience": "اختار تجربتك",
  "Global edition": "النسخة العالمية",
  "English interface with worldwide payment methods": "واجهة إنجليزي وطرق دفع عالمية",
  "International currencies": "عملات عالمية",
  "Go to step 1": "روح للخطوة 1",
  "Go to step 2": "روح للخطوة 2",
  "Go to step 3": "روح للخطوة 3",
  "Go to step 4": "روح للخطوة 4",
  "Go to step 5": "روح للخطوة 5",

  // ---------------------------------------------------------------- pricing
  Expand: "افتح",
  "Switch to yearly billing": "حوّل للاشتراك السنوي",
  "Switch to monthly billing": "حوّل للاشتراك الشهري",

  // ------------------------------------------------------------------ about
  "← Back to Megsy": "→ رجوع لـ Megsy",
  "Megsy AI is an AI workspace that brings chat, deep research, media generation, skills and connected tools into a single product.":
    "Megsy AI مساحة شغل بالذكاء الاصطناعي بتجمع الشات والبحث العميق وتوليد الميديا والمهارات والأدوات المتوصلة في منتج واحد.",
  "What Megsy does": "Megsy بيعمل إيه",
  "Chat with modern AI models, run multi-step deep research with sources, generate images and video, build reusable skills, and connect tools through integrations — from one interface on desktop and mobile.":
    "اتكلم مع أحدث موديلات الذكاء الاصطناعي، شغّل بحث عميق بخطوات ومصادر، ولّد صور وفيديو، اعمل مهارات تقدر تستخدمها كل مرة، ووصّل أدواتك بالتكاملات — كل ده من واجهة واحدة على الكمبيوتر والموبايل.",
  "How it is built": "متبني إزاي",
  "Megsy runs on a modern web stack with a managed Postgres backend. Access control, usage limits and credit accounting are enforced on the server, not in the browser.":
    "Megsy شغّال على تقنيات ويب حديثة مع باك إند Postgres مُدار. صلاحيات الدخول وحدود الاستخدام وحساب الكريدت كلها بتتنفّذ على السيرفر مش في المتصفح.",
  "For support, partnerships or press: support@megsyai.com":
    "للدعم أو الشراكات أو الصحافة: support@megsyai.com",

  // ---------------------------------------------------------------- contact
  "Contact Megsy AI": "اتواصل مع Megsy AI",
  "We read every message sent to our support address.": "بنقرا كل رسالة بتوصل على إيميل الدعم.",
  "General help, bugs and account issues: support@megsyai.com":
    "مساعدة عامة ومشاكل وأعطال الحساب: support@megsyai.com",
  "Include your account email and a description of what you expected versus what happened.":
    "ابعت إيميل حسابك ووصف لللي كنت متوقعه واللي حصل فعلاً.",
  "Subscription, invoice and refund questions: support@megsyai.com — see the refund policy for what to include.":
    "أسئلة الاشتراك والفواتير والاسترجاع: support@megsyai.com — بصّ على سياسة الاسترجاع تعرف تبعت إيه.",
  "Report a suspected vulnerability to support@megsyai.com with steps to reproduce. Please do not share details publicly before we respond.":
    "لو لقيت ثغرة، بلّغنا على support@megsyai.com مع خطوات إعادة المشكلة. ومن فضلك متنشرش التفاصيل قبل ما نرد عليك.",

  // ------------------------------------------------------------------ terms
  "These terms describe how Megsy AI may be used. By creating an account or using the service you agree to them.":
    "الشروط دي بتوضح إزاي تستخدم Megsy AI. أول ما تعمل حساب أو تستخدم الخدمة تبقى موافق عليها.",
  "Your account": "حسابك",
  "You need an account to use most of Megsy. You are responsible for keeping your credentials safe and for the activity that happens under your account.":
    "محتاج حساب عشان تستخدم أغلب مميزات Megsy. وإنت مسؤول عن الحفاظ على بيانات دخولك وعن أي نشاط بيحصل من حسابك.",
  "You must be legally able to enter into an agreement in your country to use the service.":
    "لازم تكون مؤهل قانونًا في بلدك إنك تدخل في اتفاق عشان تستخدم الخدمة.",
  "Acceptable use": "الاستخدام المسموح",
  "Do not use Megsy to break the law, to attack or overload the service, to bypass usage limits or billing, or to generate content that harms other people.":
    "متستخدمش Megsy في مخالفة القانون، ولا في مهاجمة الخدمة أو تحميلها فوق طاقتها، ولا في تخطّي حدود الاستخدام أو الفوترة، ولا في توليد محتوى بيأذي غيرك.",
  "Automated scraping, credential sharing, and reselling access without a written agreement are not permitted.":
    "السحب الآلي للبيانات ومشاركة بيانات الدخول وإعادة بيع الوصول من غير اتفاق مكتوب كلها ممنوعة.",
  "Plans, credits and usage limits": "الباقات والكريدت وحدود الاستخدام",
  "Paid plans include monthly usage allowances. Some features consume credits, and some models are limited to specific plans. Current limits are shown on the pricing page and inside your account.":
    "الباقات المدفوعة فيها حصص استخدام شهرية. في مميزات بتستهلك كريدت، وفي موديلات متاحة لباقات معينة بس. الحدود الحالية موجودة في صفحة الأسعار وجوه حسابك.",
  "Limits are enforced by our servers. Attempting to circumvent them may result in suspension.":
    "الحدود بتتطبّق من سيرفراتنا، ومحاولة الالتفاف عليها ممكن توقّف حسابك.",
  "AI-generated content": "المحتوى المولّد بالذكاء الاصطناعي",
  "Model output can be inaccurate or incomplete. Review results before relying on them, especially for legal, medical, financial or safety-critical decisions.":
    "نتايج الموديل ممكن تكون غير دقيقة أو ناقصة. راجع النتايج قبل ما تعتمد عليها، خصوصًا في القرارات القانونية أو الطبية أو المالية أو اللي ليها علاقة بالسلامة.",
  "You are responsible for how you use the output you generate.":
    "إنت مسؤول عن طريقة استخدامك للنتايج اللي بتولّدها.",
  "Changes and termination": "التعديلات وإنهاء الخدمة",
  "We may update the service and these terms. Material changes are announced in the app or by email.":
    "ممكن نحدّث الخدمة والشروط دي، وأي تغيير مهم هنعلنه في التطبيق أو على الإيميل.",
  "You may stop using Megsy and delete your account at any time from your account settings. We may suspend accounts that violate these terms.":
    "تقدر تبطّل استخدام Megsy وتمسح حسابك في أي وقت من إعدادات الحساب. وإحنا ممكن نوقف أي حساب بيخالف الشروط دي.",
  "Questions about these terms: support@megsyai.com": "أي استفسار عن الشروط: support@megsyai.com",

  // ---------------------------------------------------------------- privacy
  "This page explains what data Megsy collects, why it is collected, and the control you have over it.":
    "الصفحة دي بتوضح البيانات اللي Megsy بيجمعها، وليه بيجمعها، وإيه التحكم اللي في إيدك.",
  "Data we collect": "البيانات اللي بنجمعها",
  "Account data: email address, authentication identifiers, and profile details you provide.":
    "بيانات الحساب: الإيميل ومعرّفات تسجيل الدخول وتفاصيل البروفايل اللي بتدخلها.",
  "Product data: conversations, prompts, uploaded files, generated media, skills, memory entries and settings you create in the app.":
    "بيانات المنتج: المحادثات والأوامر والملفات المرفوعة والميديا المولّدة والمهارات والذاكرة والإعدادات اللي بتعملها في التطبيق.",
  "Technical data: request logs, usage counters, error reports and security events needed to operate and protect the service.":
    "بيانات تقنية: سجلات الطلبات وعدادات الاستخدام وتقارير الأخطاء وأحداث الأمان اللازمة لتشغيل الخدمة وحمايتها.",
  "Billing data: subscription status and transaction records. Card details are handled by our payment provider, not stored by Megsy.":
    "بيانات الفوترة: حالة الاشتراك وسجل المعاملات. بيانات الكارت بتتعامل معاها بوابة الدفع، وMegsy مش بيخزّنها.",
  "How we use it": "بنستخدمها إزاي",
  "To deliver the features you request, apply plan limits and credits, provide support, detect abuse, and improve reliability and safety.":
    "عشان نقدّم المميزات اللي بتطلبها، ونطبّق حدود الباقة والكريدت، ونديك دعم، ونكشف إساءة الاستخدام، ونحسّن الاستقرار والأمان.",
  "Processors and model providers": "مقدمو المعالجة والموديلات",
  "Prompts and files you submit may be sent to the AI model provider needed to fulfil the request, and to infrastructure providers used for hosting, storage, authentication and payments.":
    "الأوامر والملفات اللي بتبعتها ممكن تتبعت لمزوّد الموديل المطلوب لتنفيذ الطلب، ولمزوّدي البنية التحتية بتوع الاستضافة والتخزين وتسجيل الدخول والدفع.",
  "Integrations you connect yourself (for example calendars or third-party tools) receive only the data required for the actions you trigger.":
    "التكاملات اللي بتوصّلها بنفسك (زي التقويم أو أدوات خارجية) بتاخد البيانات اللازمة بس للإجراءات اللي إنت بتشغّلها.",
  "Retention and deletion": "الاحتفاظ والمسح",
  "Conversations, files and memories stay until you delete them or delete your account. Some records — such as billing history and security logs — are retained where required for accounting or fraud prevention.":
    "المحادثات والملفات والذاكرة بتفضل موجودة لحد ما تمسحها أو تمسح حسابك. في سجلات — زي سجل الفوترة وسجلات الأمان — بتفضل محفوظة لو مطلوبة للمحاسبة أو منع الاحتيال.",
  "You can delete individual items, export or clear data from Settings, and delete your account from Settings.":
    "تقدر تمسح عناصر منفردة، أو تصدّر بياناتك أو تفضّيها من الإعدادات، وتمسح حسابك من الإعدادات كمان.",
  "Access to your data is restricted per user at the database level, transport is encrypted, and privileged operations are authorised server-side.":
    "الوصول لبياناتك متقيّد لكل مستخدم على مستوى قاعدة البيانات، والنقل مشفّر، والعمليات الحساسة بتتصرّح من السيرفر.",
  "No system is perfectly secure. Report suspected vulnerabilities to support@megsyai.com.":
    "مفيش نظام آمن 100%. لو شكيت في ثغرة بلّغنا على support@megsyai.com.",
  "Your rights": "حقوقك",
  "Depending on where you live you may request access, correction, export or deletion of your personal data. Contact support@megsyai.com.":
    "حسب بلدك، تقدر تطلب الاطلاع على بياناتك الشخصية أو تصحيحها أو تصديرها أو مسحها. كلّمنا على support@megsyai.com.",

  // ----------------------------------------------------------------- refund
  "This page describes how cancellations and refund requests are handled.":
    "الصفحة دي بتوضح إزاي بنتعامل مع الإلغاء وطلبات استرجاع الفلوس.",
  "Cancelling a subscription": "إلغاء الاشتراك",
  "You can cancel at any time from Settings → Billing. Cancellation stops the next renewal; your plan stays active until the end of the period you already paid for.":
    "تقدر تلغي في أي وقت من الإعدادات ← الفوترة. الإلغاء بيوقّف التجديد الجاي، وباقتك بتفضل شغالة لحد آخر المدة اللي دفعتها.",
  "Pausing is offered as an alternative to cancelling where available.":
    "التعليق المؤقت متاح كبديل للإلغاء لو الخيار موجود.",
  "Refund requests": "طلبات الاسترجاع",
  "Refund requests are reviewed case by case. Email support@megsyai.com from your account address with the transaction date and the reason for the request.":
    "طلبات الاسترجاع بتتراجع حالة بحالة. ابعت من إيميل حسابك على support@megsyai.com بتاريخ العملية وسبب الطلب.",
  "Requests are more likely to be approved when the subscription was charged in error, was a duplicate charge, or when the paid features could not be delivered.":
    "فرصة الموافقة بتزيد لو الاشتراك اتخصم بالغلط، أو الخصم اتكرر، أو المميزات المدفوعة مقدرناش نقدّمها.",
  "Consumed usage": "الاستخدام المستهلك",
  "Credits and usage already consumed (generated images, videos, research runs, chat usage) cannot be restored after a refund is issued.":
    "الكريدت والاستخدام اللي اتصرف خلاص (صور وفيديوهات وأبحاث واستخدام الشات) مش بيترجع بعد ما الاسترجاع يتم.",
  Processing: "التنفيذ",
  "Approved refunds are returned through the original payment method by our payment provider. Bank processing time depends on your issuer.":
    "الاسترجاع الموافَق عليه بيرجع على نفس وسيلة الدفع عن طريق بوابة الدفع، ومدة التنفيذ بتعتمد على البنك بتاعك.",

  // --------------------------------------------------------------- settings
  Light: "فاتح",
  "About us": "عننا",

  // ------------------------------------------------------- ai personalization
  Formal: "رسمي",
  Friendly: "ودود",
  Concise: "مختصر",
  Detailed: "مفصّل",
  Conservative: "متحفّظ",
  Creative: "مبدع",
  "Mix based on your chat": "مزيج على حسب شاتك",
  "Relaxed and friendly": "بسيط وودود",
  "Polished and precise": "مرتّب ودقيق",
  "Always reply in English": "رد دايمًا بالإنجليزي",
  "Fast everyday": "سريع للاستخدام اليومي",
  "Smarter answers": "إجابات أذكى",
  "Top-tier model": "أقوى موديل",
  "e.g. Alex": "مثلاً: أحمد",

  // ------------------------------------------------------------ profile edit
  "Shown across Megsy.": "بيظهر في كل حتة في Megsy.",
  "How Megsy addresses you.": "Megsy بينده عليك إزاي.",
  "Custom guidance applied to every conversation.": "تعليمات خاصة بتتطبّق على كل محادثة.",
  "Irreversible actions.": "إجراءات مش بترجع تاني.",
  "Permanently remove your account and all associated data.": "امسح حسابك وكل بياناته نهائي.",

  // ---------------------------------------------------------- notifications
  "Notifications inside Megsy.": "الإشعارات جوه Megsy.",
  "Generation complete": "التوليد خلص",
  "Get notified when a generation completes": "يوصلك إشعار أول ما التوليد يخلص",
  "Credit updates": "تحديثات الكريدت",
  "Balance changes and top-up confirmations": "تغيّر الرصيد وتأكيد الشحن",
  "Rewards and referral activity": "المكافآت ونشاط الدعوات",
  "System messages": "رسايل النظام",
  "Important account and product updates": "تحديثات مهمة عن الحساب والمنتج",
  "What lands in your inbox.": "اللي بيوصل على إيميلك.",
  "Transaction receipts": "إيصالات المعاملات",
};
