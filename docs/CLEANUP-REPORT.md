# تقرير التنظيف وإعادة الهيكلة — المرحلة 1

## 1) ما تم تنفيذه فعلياً (واجهة أمامية فقط)

- بناء خريطة استيراد كاملة انطلاقاً من `src/main.tsx` (824 ملف مستخدم فعلاً من أصل 2028 ملف في `src`).
- حذف **43 ملف واجهة غير مستخدم إطلاقاً** (لا يستورده أي ملف ولا يُذكر اسمه في أي مكان): مكوّنات شاشات قديمة، ديمو صفحة الهبوط، صفحات إعدادات Operator المهجورة، خدمات شات قديمة، ومكوّنات فواتير/أيقونات غير مرتبطة.
- التحقق بعد الحذف: فحص الأنواع (TypeScript) يمر بدون أخطاء، وسيرفر التطوير يعمل.
- لم يُلمس أي جدول أو دالة في قاعدة البيانات، ولم تُحذف أي وظيفة edge.

## 2) ملفات غير مستخدمة لكن لم تُحذف (تحتاج قراراً)

103 ملف ما زال "غير مقروء" من شجرة التطبيق لكن اسمه يظهر في أماكن أخرى (توثيق، سكربتات، أو مكوّنات shadcn قياسية):

- ~22 مكوّن shadcn في `src/components/ui` (table, form, calendar, sidebar, carousel, drawer, menubar…) — الأفضل إبقاؤها كمكتبة أساسية.
- `src/lib/builders/*` (12 ملف) و `src/lib/slides/*` و `src/lib/landing/mobile-i18n/*` — تبدو ميزات مبنية وغير موصولة بواجهة حالياً.
- `src/lib/ai/tools/*` و`hitl.server.ts` و`ai-gateway.server.ts` — طبقة أدوات AI غير موصولة.
- `src/test/*` — ملفات اختبار (تُبقى).

## 3) قاعدة البيانات — تقرير بلا حذف

- إجمالي جداول `public`: **295**.
- جداول يستدعيها كود المشروع مباشرة: **103** جدول + **24** دالة RPC.
- جداول **لا يذكرها كود هذا المستودع**: **192**، منها **145 جدول فارغ تماماً (0 صف)**.

### تحذير مهم قبل أي حذف
عدد من الجداول غير المذكورة في الكود تحتوي بيانات حقيقية وكبيرة، ما يعني أنها تُستخدم من وظائف edge منشورة على Supabase وغير موجودة في هذا المستودع (بوت تلجرام/اللعبة/المدفوعات):

`game_notifications (28.9k)`, `prize_broadcast_log (25k)`, `edge_rate_limits (6.8k)`, `user_tasks (3.1k)`, `mining_sessions (2.4k)`, `auto_notification_log (1.7k)`, `ton_payment_intents (271)`, `stakes`, `star_payments`, `telegram_payments`, `pvp_*`, `bolt_*`, `shop_*`, `service_secrets`, `user_roles`.

لذلك: **لا يجوز الحذف بناءً على "غير مذكور في الكود" فقط.**

### مرشحون آمنون نسبياً للحذف (فارغة + لا كود + ميزات مهجورة)
مجموعات واضحة: `youtube_*` / `yt_video_*`, `slide_projects`/`slide_templates`, `spreadsheet_projects`, `student_*`/`learn_profile`, `appsumo_*`, `dodo_*`, `composio_*`, `oauth_clients`/`oauth_codes`/`oauth_tokens`, `v0_api_keys`, `runbase_keys`, `wavespeed_keys`, `apify_keys`, `brave_keys`, `manus_keys`, `e2b_*`, `meetings`/`meeting_recordings`, `parallel_monitor*`, `affiliate_*`, `bundle_orders`, `course_orders`.

كلها 0 صف. الحذف يتم بترحيل (migration) واحد وبموافقتك الصريحة.

## 4) الخطوة المقترحة التالية (استقرار: "يفتح بعد وقت")

1. تقسيم `src/App.tsx` (1485 سطر، 150 `lazy()`) إلى ملفات مجموعات مسارات (`routes/marketing`, `routes/chat`, `routes/settings`…) لتقليل حجم شجرة الإقلاع وتسهيل الصيانة.
2. قياس زمن الإقلاع الفعلي وحصر ما يُحمَّل قبل أول رسم، ثم تأخير كل ما ليس ضرورياً.
3. توحيد نظام التصميم في `src/index.css` وإزالة الأنماط المتكررة.
