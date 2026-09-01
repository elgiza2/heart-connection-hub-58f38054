/**
 * Egyptian colloquial Arabic — part 3.
 * Covers strings that were still showing in English: chat cards (media, slides,
 * docs, coder, computer), composer + onboarding tours, command palette,
 * shortcuts, auth/settings flows and toast messages.
 * Same plain in-bundle map contract as the other parts (no network, pure lookup).
 * Brand names (GitHub, Notion, Stripe…) and model names are intentionally kept.
 */
export const EGYPTIAN_PAGES_3: Record<string, string> = {
  // ------------------------------------------------- بقايا نصوص (دفعة أخيرة)
  Choose: "اختار",
  Deleted: "اتمسح",
  Imported: "اتستورد",
  "Image is too large (max 5MB)": "الصورة كبيرة أوي (أقصى حد 5 ميجا)",
  "No suggestions returned": "مفيش اقتراحات رجعت",
  "Learn about Megsy AI": "اعرف أكتر عن Megsy AI",
  "browser screenshot": "صورة شاشة المتصفح",
  "Megsy OS screenshot": "صورة شاشة Megsy OS",
  "Megsy logo": "شعار Megsy",
  "Smooth oil-painted document preview cover": "غلاف معاينة المستند برسم زيتي ناعم",
  "How you'd like Megsy to respond": "تحب Megsy يرد عليك إزاي",
  "You're all caught up": "خلصت كل حاجة",
  "Enter the new email address. You'll need to confirm from both inboxes to complete the change.":
    "اكتب الإيميل الجديد. لازم تأكّد من الإيميلين عشان التغيير يكتمل.",
  "Choose a strong password with at least 8 characters. You'll stay signed in on this device.":
    "اختار باسورد قوي مش أقل من 8 حروف. هتفضل مسجّل دخول على الجهاز ده.",


  // ------------------------------------------------------- ترحيب / كاروسيل

  Build: "ابني",
  "Start now": "ابدأ دلوقتي",
  Waiting: "مستني",
  "Go to step 1": "روح للخطوة 1",
  "Go to step 2": "روح للخطوة 2",
  "Go to step 3": "روح للخطوة 3",
  "Go to step 4": "روح للخطوة 4",
  "Tell Megsy once. It does the whole job.": "قول لـ Megsy مرة واحدة… وهو يعمل الشغل كله.",
  "Megsy writes the work in front of you.": "Megsy بيشتغل قدامك خطوة بخطوة.",
  "you@example.com": "أنت@example.com",

  // ------------------------------------------------------------- toasts: عام
  "Link copied": "اتنسخ اللينك",
  "Code copied": "اتنسخ الكود",
  "Copy failed": "النسخ فشل",
  "File downloaded": "الملف اتنزّل",
  Downloaded: "اتنزّل",
  "Download failed": "التنزيل فشل",
  "Download failed, opening in a new tab": "التنزيل فشل، بنفتحه في تاب جديد",
  "Upload failed": "الرفع فشل",
  "Failed to save": "التسجيل فشل",
  Removed: "اتشال",
  "Not signed in": "مش داخل بحسابك",
  "Sign in required": "محتاج تسجّل دخول",
  "Please sign in again to continue.": "سجّل دخول تاني عشان تكمّل.",
  "You'll need to sign in again to access your chats.":
    "هتحتاج تسجّل دخول تاني عشان توصل لشاتاتك.",
  "Your session expired. Please sign in again.": "الجلسة انتهت. سجّل دخول تاني.",
  "Please sign in to use this feature.": "سجّل دخول عشان تستخدم الميزة دي.",
  "Please fill in the required fields": "املا الخانات المطلوبة",
  "Please fill all fields": "املا كل الخانات",
  "Pick an option.": "اختار واحد من الاختيارات.",
  "Pick a tool first": "اختار أداة الأول",
  "Start a conversation first": "ابدأ محادثة الأول",
  "Enter a valid link": "دخّل لينك صحيح",
  "Could not read the attached link": "مش قادر أقرا اللينك المرفق",
  "Please wait until attachments finish processing": "استنى لحد ما المرفقات تخلص معالجة",
  "Upload both the first and last frame first": "ارفع أول فريم وآخر فريم الأول",
  "Arguments must be valid JSON": "المدخلات لازم تكون JSON صحيح",
  "Please choose an image file": "اختار ملف صورة",
  "Please pick a .zip file": "اختار ملف .zip",
  "Name is required": "الاسم مطلوب",
  "Instructions are required": "التعليمات مطلوبة",
  "Server URL is required": "لينك السيرفر مطلوب",
  "no user": "مفيش مستخدم",
  "User not found": "المستخدم مش موجود",
  "fetch failed": "الطلب فشل",
  "render failed": "الرندر فشل",
  "Unexpected proxy response": "رد غير متوقع من البروكسي",

  // ------------------------------------------------------- صوت / مايك / إدخال
  "Listening…": "بسمعك…",
  "Recording too short — hold the mic and speak":
    "التسجيل قصير جدًا — دوس مطوّل على المايك واتكلم",
  "Didn't catch that — try again": "مسمعتش كويس — جرّب تاني",
  "Transcription failed": "تحويل الصوت لنص فشل",
  "Your browser does not support voice input": "المتصفح بتاعك مش بيدعم الإدخال الصوتي",
  "Couldn't start the microphone": "مش قادر أفتح المايك",
  "toggle password": "إظهار/إخفاء الباسورد",

  // -------------------------------------------------------------- ميديا وصور
  "Creating image": "بيعمل صورة",
  "Creating video": "بيعمل فيديو",
  "Generating video": "بيولّد الفيديو",
  Queued: "في الطابور",
  Encoding: "بيرندر",
  Ready: "جاهز",
  "🎬 Your video is ready": "🎬 الفيديو بتاعك جاهز",
  "Final video ready": "الفيديو النهائي جاهز",
  "Merge failed": "الدمج فشل",
  "Need at least 2 finished clips to merge": "محتاج على الأقل مقطعين خلصوا عشان تدمج",
  "Already retrying this scene…": "بنجرّب المشهد ده تاني بالفعل…",
  "Couldn't attach the image": "مش قادر أرفق الصورة",
  "Removing background…": "بشيل الخلفية…",
  "Background removed": "الخلفية اتشالت",
  "Couldn't remove the background, try another image":
    "مش قادر أشيل الخلفية، جرّب صورة تانية",
  "Couldn't upscale the image, try another one": "مش قادر أكبّر الصورة، جرّب واحدة تانية",
  "Opened in a new tab — long-press the video to save it.":
    "اتفتح في تاب جديد — دوس مطوّل على الفيديو تحفظه.",
  "Media type": "نوع الميديا",
  "Start + End": "أول وآخر فريم",
  "Create image": "اعمل صورة",
  "Take a photo": "صوّر صورة",
  "Upload an image": "ارفع صورة",
  "Add files or photos": "ضيف ملفات أو صور",
  "Add link": "ضيف لينك",
  Camera: "الكاميرا",

  // ------------------------------------------------------------ سلايدز ودوكس
  "HTML downloaded": "ملف HTML اتنزّل",
  "HTML export failed": "تصدير HTML فشل",
  "PPTX downloaded": "ملف PPTX اتنزّل",
  "PPTX export failed": "تصدير PPTX فشل",
  "remove slide": "شيل السلايد",
  "remove section": "شيل القسم",
  "remove point": "شيل النقطة",
  "Presentation link and invite copied": "لينك العرض والدعوة اتنسخوا",
  "Could not share the file": "مش قادر أشير الملف",
  "Could not draft content": "مش قادر أكتب المحتوى",
  "Document was not created — please try again": "المستند مااتعملش — جرّب تاني",
  "Rendering PDF…": "بيحضّر الـ PDF…",
  "Generating PDF…": "بيولّد الـ PDF…",
  "Failed to generate PDF": "توليد الـ PDF فشل",
  "PDF downloaded": "ملف الـ PDF اتنزّل",
  "Could not create PDF — try downloading as HTML":
    "مش قادر أعمل PDF — نزّله بصيغة HTML",
  "No content to download": "مفيش محتوى للتنزيل",
  "No content to print": "مفيش محتوى للطبع",
  "Opening Save as PDF dialog…": "بيفتح نافذة الحفظ كـ PDF…",
  "iframe contentWindow missing": "نافذة العرض الداخلية مش متاحة",
  "Pop-ups are blocked — enable them to print":
    "النوافذ المنبثقة مقفولة — فعّلها عشان تطبع",
  "Failed to render diagram": "رسم الدياجرام فشل",
  "Error sent to the composer": "الخطأ اتبعت للشات",

  // -------------------------------------------------------------------- كودر
  "Publish failed": "النشر فشل",
  Published: "منشور",
  "Sign in to publish": "سجّل دخول عشان تنشر",
  "Publishing saves your project so anyone with the link can view it.":
    "النشر بيحفظ مشروعك عشان أي حد معاه اللينك يشوفه.",
  "It is still building — check back shortly.": "لسه بيبني — تعالى بصّ كمان شويّة.",
  "Deploy failed": "النشر على السيرفر فشل",
  "No previous version": "مفيش نسخة سابقة",
  "No previous version to restore": "مفيش نسخة سابقة نرجّعها",
  "Reverted to previous version": "رجعنا للنسخة السابقة",
  "Reverted to the previous version": "رجعنا للنسخة السابقة",
  "No source files saved": "مفيش ملفات مصدر محفوظة",
  "No files yet": "مفيش ملفات لسه",
  "Files copied": "الملفات اتنسخت",
  "Regeneration failed": "إعادة التوليد فشلت",
  "Continuing the build…": "بنكمّل البناء…",
  "Build stopped.": "البناء اتوقف.",
  "Sending project to Anything.com…": "بيبعت المشروع لـ Anything.com…",
  "Anything.com build failed": "البناء على Anything.com فشل",
  "Build started on Anything.com": "البناء بدأ على Anything.com",
  "The connection ended before the project finished generating. Please try again.":
    "الاتصال قطع قبل ما المشروع يخلص توليد. جرّب تاني.",
  "The build finished without producing any files. Please try again.":
    "البناء خلص من غير ما يطلّع ملفات. جرّب تاني.",
  "The build didn't start — the connection timed out. Please try again.":
    "البناء مابدأش — الاتصال خلص وقته. جرّب تاني.",
  "The build stopped before producing any files. Please try again.":
    "البناء اتوقف قبل ما يطلّع ملفات. جرّب تاني.",
  "A file with that name already exists": "فيه ملف بنفس الاسم موجود",
  "Failed to load Pyodide": "تحميل Pyodide فشل",
  "Megsy Coder Studio — terminal ready. Type `help` to list commands.":
    "Megsy Coder Studio — التيرمنال جاهز. اكتب `help` تشوف الأوامر.",
  Terminal: "تيرمنال",
  Notes: "ملاحظات",
  "Skipped — you can continue without connecting": "اتخطّيناها — تقدر تكمّل من غير ربط",
  "Sign in and subscribe to use Coder mode.": "سجّل دخول واشترك عشان تستخدم وضع الكودر.",

  // ------------------------------------------------------------ كمبيوتر ومهام
  "Task stopped": "المهمة اتوقفت",
  "Couldn't stop the task": "مش قادر أوقف المهمة",
  "Opened a cloud browser": "فتح متصفح سحابي",
  "Pulled 40 sources & 3 dashboards": "جمع 40 مصدر و3 لوحات بيانات",
  "Ran the numbers in a sheet": "حسب الأرقام في شيت",
  "Writing the final report": "بيكتب التقرير النهائي",
  "Tasks that run for hours": "مهام بتشتغل ساعات",
  "Finished work, not chat": "شغل مخلّص، مش مجرد كلام",
  "A real cloud computer": "كمبيوتر سحابي حقيقي",
  "Tasks up to 4 hours": "مهام لحد 4 ساعات",
  "3 agents in parallel": "3 وكلاء بيشتغلوا مع بعض",
  "Deep research with citations": "بحث عميق بمصادر",
  "Upgrade to Megsy Pro": "اترقّى لـ Megsy Pro",
  "Megsy OS is available on Pro plans and above": "Megsy OS متاح في باقات Pro وأعلى",

  // ---------------------------------------------------------------- تكاملات
  "Require your confirmation before each action.": "يطلب تأكيدك قبل كل خطوة.",
  "Integration Logo": "شعار التكامل",
  "Connect an API app for me:": "وصّلني بتطبيق API:",
  "Add an MCP server for me:": "ضيف لي سيرفر MCP:",
  "Connect your repositories to read code and manage tasks.":
    "وصّل الريبوهات بتاعتك عشان يقرا الكود ويدير المهام.",
  "Connect your Supabase project to manage data and auth.":
    "وصّل مشروع Supabase عشان تدير البيانات والدخول.",
  "Manage your database, auth and edge functions.":
    "إدارة الداتابيز والدخول ودوال الحافة.",
  "Send and receive messages across chats.": "ابعت واستقبل رسايل في الشاتات.",
  "Pipedream is not configured on the backend yet": "Pipedream لسه مش متظبّط في الباك إند",

  // ---------------------------------------------- لوحة الأوامر والاختصارات
  Apps: "التطبيقات",
  "AI Models": "موديلات الذكاء الاصطناعي",
  Showcase: "المعرض",
  "AI Personalization": "تخصيص الذكاء الاصطناعي",
  Help: "مساعدة",
  Navigation: "التنقل",
  "Recent Conversations": "أحدث المحادثات",
  Actions: "إجراءات",
  "Open command palette": "افتح لوحة الأوامر",
  "Show keyboard shortcuts": "اعرض اختصارات الكيبورد",
  "Close dialog / palette": "اقفل النافذة / اللوحة",
  "New line": "سطر جديد",
  "Regenerate (mobile)": "إعادة التوليد (موبايل)",
  "Branch conversation (mobile)": "تفريع المحادثة (موبايل)",
  "Copy report as Markdown": "انسخ التقرير كـ Markdown",
  "Print / Save as PDF": "طبع / حفظ كـ PDF",
  "Chevron Left": "سهم لليسار",

  // ------------------------------------------------------------ أنماط ونماذج
  Fast: "سريع",
  "Quick everyday replies": "ردود سريعة للاستخدام اليومي",
  Balanced: "متوازن",
  "The default": "الوضع الافتراضي",
  Smart: "ذكي",
  "More careful reasoning": "تفكير أدق",
  "Quick answers": "ردود سريعة",
  Deep: "عميق",
  "Careful, detailed work": "شغل مدقّق وبتفصيل",
  "Quicker replies": "ردود أسرع",
  "Detailed reasoning": "تفكير بتفصيل",
  "Hardest problems": "أصعب المسائل",
  "Adapts the answer to your request": "بيظبّط الرد على طلبك",
  "Short, direct answers": "ردود قصيرة ومباشرة",
  "Thorough answers with examples": "ردود وافية بأمثلة",
  "Professional, structured tone": "أسلوب مهني منظّم",
  "Warm, conversational tone": "أسلوب ودود وبسيط",
  "Exploratory · 2–10 min": "استكشافي · 2–10 دقايق",
  "Recommended · 5–25 min": "المفضّل · 5–25 دقيقة",
  "2x compute · 5–50 min": "ضعف القدرة · 5–50 دقيقة",
  "4x compute · 5–90 min": "4 أضعاف القدرة · 5–90 دقيقة",
  "8x compute · up to 2 hr": "8 أضعاف القدرة · لحد ساعتين",

  // --------------------------------------------------------- تعريف بالتطبيق
  "Just type your idea": "اكتب فكرتك وبس",
  "Type your idea here": "اكتب فكرتك هنا",
  "Start with one short sentence — I'll turn it into steps or ready-made content.":
    "ابدأ بجملة قصيرة — وأنا أحوّلها لخطوات أو محتوى جاهز.",
  "One short sentence is enough — Megsy turns it into steps or content.":
    "جملة قصيرة تكفي — وMegsy يحوّلها لخطوات أو محتوى.",
  "Use + for files and tools": "استخدم + للملفات والأدوات",
  "Add anything from +": "ضيف أي حاجة من +",
  "Upload images and video, or open creation and editing tools from the + button.":
    "ارفع صور وفيديو، أو افتح أدوات الإنشاء والتعديل من زر +.",
  "Photos, videos and creation tools all live behind this button.":
    "الصور والفيديوهات وأدوات الإنشاء كلها ورا الزر ده.",
  "Send when ready": "ابعت لما تكون جاهز",
  "Tap send and Megsy gets to work right away.": "دوس ابعت وMegsy يبدأ الشغل على طول.",
  "Pick the model that fits — speed or higher quality — before you send.":
    "اختار الموديل المناسب — سرعة ولا جودة أعلى — قبل ما تبعت.",
  "Tap the name at the top to pick the model that fits the task.":
    "دوس على الاسم فوق تختار الموديل المناسب للمهمة.",
  "First chat": "أول شات",
  "First image": "أول صورة",
  "First document / slide": "أول مستند / سلايد",
  "Invite a friend": "اعزم صاحبك",
  "Activate Pro — 50% off": "فعّل Pro — خصم 50%",
  "50% off — half price on all plans": "خصم 50% — نص السعر على كل الباقات",
  "50% off": "خصم 50%",
  "Almost done": "قربنا نخلّص",
  Paused: "متوقّف",
  "Best Design Tool": "أفضل أداة تصميم",
  "2,000+ reviews": "أكتر من 2,000 تقييم",
  "AI Creation": "الإنشاء بالذكاء الاصطناعي",
  Studios: "الاستوديوهات",
  "Discover Megsy": "اكتشف Megsy",
  Earn: "اكسب",
  "Parallel agents": "وكلاء بالتوازي",
  "In-chat tools": "أدوات جوه الشات",
  "Sheets & Resume": "شيتات وسيرة ذاتية",
  "Which layer stores long-term context?": "أنهي طبقة بتخزّن السياق طويل المدى؟",
  "Nice — turn it into a 3-slide deck.": "جميل — حوّلها لعرض من 3 سلايدات.",
  "Done. Deck is ready with charts and notes.": "خلصت. العرض جاهز بالرسوم والملاحظات.",
  "report.docx · autosaved": "report.docx · اتحفظ تلقائي",
  Executor: "المنفّذ",
  "Rate this app": "قيّم التطبيق",
  Version: "الإصدار",
  "This page has moved": "الصفحة دي اتنقلت",
  "This Megsy AI page does not exist. Head back to chat, pricing or your settings.":
    "الصفحة دي مش موجودة في Megsy AI. ارجع للشات أو الأسعار أو الإعدادات.",

  // ----------------------------------------------------------- دخول وحسابات
  "Invalid invite link": "لينك الدعوة غير صحيح",
  "Couldn't load this invite. Try again later.": "مش قادر أفتح الدعوة دي. جرّب بعدين.",
  "Joined conversation!": "دخلت المحادثة!",
  "Sign-in expired, please try again": "الدخول انتهت صلاحيته، جرّب تاني",
  "Update the email linked to your account. We'll send a confirmation link to both addresses before the change takes effect.":
    "غيّر الإيميل المربوط بحسابك. هنبعت لينك تأكيد للإيميلين قبل ما التغيير يتم.",
  "We'll send a confirmation link to both addresses.": "هنبعت لينك تأكيد للإيميلين.",
  "Please enter an email": "دخّل إيميل",
  "Please enter a valid email": "دخّل إيميل صحيح",
  "This is your current email": "ده إيميلك الحالي",
  "Confirmation email sent to both addresses": "إيميل التأكيد اتبعت للإيميلين",
  "Passwords do not match": "الباسوردين مش متطابقين",
  "Password changed successfully": "الباسورد اتغيّر بنجاح",
  "Password updated successfully!": "الباسورد اتحدّث بنجاح!",
  "Rotate your account password": "غيّر باسورد حسابك",
  "Capital letters required.": "لازم حروف كابيتال.",
  Verified: "اتأكد",
  "Add an extra layer of security using an authenticator app like Google Authenticator, 1Password, or Authy.":
    "ضيف طبقة أمان زيادة بتطبيق مصادقة زي Google Authenticator أو 1Password أو Authy.",
  "Enter the 6-digit code": "دخّل الكود المكوّن من 6 أرقام",
  "Two-factor authentication enabled": "التحقق بخطوتين اتفعّل",
  "Two-factor authentication disabled": "التحقق بخطوتين اتقفل",
  "Incomplete application data": "بيانات التطبيق ناقصة",
  "Invalid application": "تطبيق غير صحيح",
  "Redirect URI not allowed": "لينك التحويل غير مسموح",
  "Authorization failed": "التصريح فشل",
  "Name, avatar, contact details": "الاسم والصورة وبيانات التواصل",
  "Chats, messages, threads": "الشاتات والرسايل والمواضيع",
  "Every asset you created": "كل حاجة عملتها",
  "Credits and active plans": "الكريدت والباقات الشغّالة",
  "Once deleted, your data cannot be recovered.": "بعد المسح مفيش رجعة لبياناتك.",
  "This permanently removes your account, chats and files. This cannot be undone.":
    "ده بيمسح حسابك وشاتاتك وملفاتك خلاص. مفيش رجعة.",
  "Permanent — 30-day recovery": "نهائي — استرجاع خلال 30 يوم",

  // ------------------------------------------------------------ فوترة ودعوات
  "Please tell us why you're cancelling": "قول لنا سبب الإلغاء",
  "Cancellation request sent. Our team will reach out shortly.":
    "طلب الإلغاء اتبعت. الفريق هيكلّمك قريب.",
  "This plan isn't available for local payment yet.":
    "الباقة دي لسه مش متاحة للدفع المحلي.",
  "This reward is awaiting secure verification": "المكافأة دي مستنية تحقق آمن",
  "Redeemed — our team will activate your plan shortly":
    "اتصرفت — الفريق هيفعّل باقتك قريب",
  "Invite message copied": "رسالة الدعوة اتنسخت",
  Local: "محلي",
  "E-Wallets": "محافظ إلكترونية",

  // ----------------------------------------------------------- إعدادات ومهارات
  "Email notifications": "إشعارات الإيميل",
  "Email types": "أنواع الإيميلات",
  "Fine-tune what we send.": "ظبّط اللي بنبعته بالتفصيل.",
  "Profile photo updated": "صورة البروفايل اتحدّثت",
  "Could not resolve image URL": "مش قادر أجيب لينك الصورة",
  "Could not download file": "مش قادر أنزّل الملف",
  "Could not save knowledge": "مش قادر أحفظ المعلومة",
  "Nothing to fill — your empty fields didn't have enough signal yet":
    "مفيش حاجة نملاها — الخانات الفاضية لسه مفيش منها معلومات كفاية",
  "Preparing your data export…": "بنحضّر تصدير بياناتك…",
  "Your data export has downloaded.": "تصدير بياناتك اتنزّل.",
  "Delete this skill?": "تمسح المهارة دي؟",
  "Describe or refine the skill in plain language.": "وصف المهارة أو ظبّطها بكلام عادي.",
  "How this skill shows up in your library.": "شكل المهارة دي في مكتبتك.",
  "Keywords that let Megsy pick this skill automatically.":
    "كلمات مفتاحية تخلّي Megsy يختار المهارة دي لوحده.",
  "add keyword…": "ضيف كلمة مفتاحية…",
  "The system prompt Megsy follows for this skill.":
    "التعليمات الأساسية اللي Megsy بيمشي عليها في المهارة دي.",
  "What this skill is allowed to use.": "المهارة دي مسموح لها تستخدم إيه.",
  "Leave on Auto unless this skill needs a specific model.":
    "سيبها تلقائي إلا لو المهارة محتاجة موديل معيّن.",
  "Branching conversation…": "بنفرّع المحادثة…",
  "Failed to branch": "التفريع فشل",
  "Branch created": "الفرع اتعمل",
  "Manus API Key": "مفتاح Manus API",

  // ---------------------------------------------------------------- وصف قانوني
  "The terms that apply when you use Megsy AI, including account rules, acceptable use, subscriptions and account termination.":
    "الشروط اللي بتنطبق وإنت بتستخدم Megsy AI، وفيها قواعد الحساب والاستخدام المقبول والاشتراكات وإنهاء الحساب.",
  "How Megsy AI collects, uses, stores and protects your data, including chats, files, account information and third-party processors.":
    "إزاي Megsy AI بيجمع ويستخدم ويخزّن ويحمي بياناتك، وده يشمل الشاتات والملفات وبيانات الحساب والأطراف التانية.",
  "How refunds, cancellations and billing issues are handled for Megsy AI subscriptions and credit purchases.":
    "إزاي بنتعامل مع الاسترجاع والإلغاء ومشاكل الفوترة في اشتراكات Megsy AI وشراء الكريدت.",
  "Megsy AI is an AI workspace for chat, research, media generation, skills and connected tools.":
    "Megsy AI مساحة شغل بالذكاء الاصطناعي للشات والبحث وتوليد الميديا والمهارات والأدوات المتوصلة.",
  "Get in touch with the Megsy AI team for support, billing questions, security reports or partnership enquiries.":
    "اتواصل مع فريق Megsy AI للدعم أو أسئلة الفوترة أو تقارير الأمان أو الشراكات.",
  "Restore a Megsy AI subscription on this device by re-checking the plan recorded for your account.":
    "استرجع اشتراك Megsy AI على الجهاز ده بمراجعة الباقة المسجّلة لحسابك.",
  "Learn about Megsy AI's security practices, data protection, encryption, and compliance commitments. Your data safety is our priority.":
    "اعرف ممارسات الأمان في Megsy AI وحماية البيانات والتشفير والالتزام بالمعايير. أمان بياناتك أولويتنا.",
};
