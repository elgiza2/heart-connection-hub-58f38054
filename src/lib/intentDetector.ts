/**
 * Multilingual chat-intent detector.
 *
 * When a user types free text in "normal" mode without picking a service chip,
 * this classifies their intent so the app can auto-switch to the right mode
 * (image / video / research / learning / docs / slides / code / website)
 * exactly as if they had tapped the chip themselves.
 *
 * Design goals:
 *  - Zero network cost (pure regex/keyword scoring, runs in <1ms).
 *  - Language-aware: Arabic (MSA + Egyptian), English, French, Spanish,
 *    German, Portuguese, Italian, Turkish, Russian, Hindi, Indonesian,
 *    Dutch, Swedish, Polish, Chinese, Japanese and Korean.
 *  - Deterministic + explainable (returns the matched trigger).
 *  - Confidence-scored so the caller can decide auto-apply vs suggest.
 *  - Anti-noise: negations ("mesh 3ayez sora"), and rejection memory
 *    (users can silence a repeat suggestion for 24h via `snoozeIntent`).
 */

export type ChatIntent =
  | "image"
  | "video"
  | "research"
  | "learning"
  | "docs"
  | "slides"
  | "code"
  | "website"
  | "voice"
  | "normal";

export interface IntentResult {
  intent: ChatIntent;
  confidence: number; // 0..1
  matched: string[]; // trigger tokens that fired
  reason: string; // short human explanation
}

export const INTENT_AUTO_APPLY_THRESHOLD = 0.6;

interface Triggers {
  verbs: RegExp;
  nouns: RegExp;
  strong?: RegExp; // one-shot strong triggers that count as verb+noun
}

/**
 * Per-intent multilingual triggers. Verbs (create/make/generate/etc.) combine
 * with nouns (image/video/etc.) to score a match. `strong` is a single-word
 * fallback for very unambiguous phrases like "deep research".
 */
const TRIGGERS: Record<Exclude<ChatIntent, "normal">, Triggers> = {
  image: {
    verbs: /\b(generate|make|create|draw|design|render|paint|sketch|produce|give\s*me|show\s*me|dessine|génère|crée|dibuja|genera|crea|zeichne|erstelle|erzeuge|gere|crie|desenhe|disegna|crea|genera|tasarla|oluştur|çiz|создай|сгенерируй|нарисуй|बनाओ|बनाएँ|चित्र\s*बनाओ|buat|hasilkan|maak|ontwerp|rita|skapa|wygeneruj|stwórz|narysuj|生成|作成|描いて|만들어|그려)\b|(اعمل(ي|ل\s*ي)?|إعمل|ارسم(ي|ل\s*ي)?|صمم(ي|ل\s*ي)?|انشئ|أنشئ|ولّد|ولد|هات|جيبل?ي|عايز|عاوز|عايزة|عاوزة|أريد|اريد|ابغى|بدي)/i,
    nouns: /\b(image|images|picture|pictures|photo|photos|drawing|illustration|logo|poster|thumbnail|wallpaper|artwork|art|icon|avatar|banner|cover|meme|sticker|dessin|imagen|foto|dibujo|bild|zeichnung|imagem|foto|desenho|immagine|disegno|resim|görsel|fotoğraf|изображение|картин(?:а|ку)|фото|логотип|तस्वीर|छवि|फोटो|gambar|foto|afbeelding|tekening|bild|foto|obraz|zdjęcie|rysunek|画像|写真|イラスト|이미지|사진|그림)\b|(صور[ةه]|صور|رسم[ةه]?|رسمة|بوستر|ملصق|لوجو|شعار|خلفية|تصميم|أيقونة|ايقونة|أفاتار|افاتار|بانر|ميم|ستيكر|غلاف|كوفر)/i,
  },
  video: {
    verbs: /\b(generate|make|create|produce|animate|render|shoot|film|génère|crée|anime|genera|crea|anima|erstelle|animiere|gere|crie|anime|crea|genera|anima|oluştur|yap|canlandır|создай|сгенерируй|анимируй|बनाओ|वीडियो\s*बनाओ|buat|hasilkan|maak|animeer|skapa|animera|wygeneruj|stwórz|生成|作成|만들어)\b|(اعمل(ي|ل\s*ي)?|إعمل|صور(ي|ل\s*ي)?|انشئ|أنشئ|ولّد|ولد|هات|جيبل?ي|عايز|عاوز|أريد|اريد|ابغى|بدي|حرّك|حرك)/i,
    nouns: /\b(video|videos|clip|clips|reel|reels|animation|movie|short|shorts|tiktok|vidéo|película|film|kurzvideo|vídeo|filme|vídeo|video|filmato|animazione|video|klip|видео|ролик|клип|वीडियो|क्लिप|video|klip|filmpje|video|film|wideo|klip|视频|影片|動画|비디오|영상)\b|(فيديو|فيديوهات|مقطع|كليب|ريلز|ريل|انيميشن|أنيميشن|رسوم\s*متحركة|شورت|شورتس|تيك\s*توك|ريلز)/i,
  },
  research: {
    verbs: /\b(research|investigate|analy[sz]e|study|compare|dig\s*into|find\s*out|deep\s*dive|deep\s*search|recherche|analyse|étudie|investiga|analiza|estudia|recherchier|analysier|untersuch|pesquise|analise|estude|ricerca|analizza|araştır|incele|analiz\s*et|исследуй|проанализируй|найди|शोध|विश्लेषण|teliti|riset|onderzoek|analyseer|undersök|analysera|zbadaj|przeanalizuj|研究|調査|분석|조사)\b|(اSearch|إSearch|Search|حلل|قارن|قار?ن\s*بين|ادرس|إدرس|حقق|إستقصي|استقصي)/i,
    nouns: /\b(research|report|analysis|study|market|competitors|paper|sources|literature|deep\s*research|étude|analyse|recherche|informe|análisis|estudio|forschung|studie|bericht|pesquisa|relatório|análise|estudo|ricerca|analisi|rapporto|araştırma|analiz|rapor|исследование|анализ|отчет|рынок|शोध|रिपोर्ट|विश्लेषण|riset|laporan|analisis|onderzoek|rapport|studie|badanie|analiza|raport|研究|分析|調査|보고서|분석|조사)\b|(Search|ديب\s*سيرش|Search\s*عميق|تقرير|تحليل|دراسة|السوق|منافسين|منافسة|مصادر|مراجع|أبحاث)/i,
    strong: /\b(deep\s*research|deep\s*dive|deep\s*search|literature\s*review|pesquisa\s*profunda|ricerca\s*approfondita|derin\s*araştırma|глубок(?:ое|ий)\s*исследование|गहन\s*शोध|diep\s*onderzoek|głębokie\s*badanie|深入研究|深い調査|심층\s*조사)\b|(ديب\s*سيرش|Search\s*عميق|تحليل\s*سوقي|دراسة\s*سوق)/i,
  },
  learning: {
    verbs: /\b(teach|explain|learn|tutor|help\s*me\s*understand|walk\s*me\s*through|enseigne|explique|apprends|enseña|explica|aprende|erkläre|lerne|bring\s*mir\s*bei|ensine|explique|aprenda|spiega|impara|öğret|açıkla|öğren|объясни|научи|изучи|समझाओ|सिखाओ|belajar|jelaskan|leer|leg\s*uit|lär|förklara|naucz|wyjaśnij|教えて|説明|学习|説明して|가르쳐|설명해)\b|(علم(ي|ني)?|إشرح|اشرح(ي|ل\s*ي)?|فهم(ي|ني)?|فسر|درّس|درس|علمني)/i,
    nouns: /\b(concept|topic|lesson|tutorial|course|subject|homework|exam|quiz|cours|leçon|tutoriel|examen|clase|lección|curso|kurs|lektion|prüfung|conceito|aula|curso|prova|concetto|lezione|argomento|ders|konu|sınav|урок|курс|экзамен|тема|पाठ|कोर्स|विषय|pelajaran|kursus|onderwerp|les|cursus|ämne|lektion|kurs|temat|lekcja|kurs|概念|授業|课程|トピック|개념|수업|강의)\b|(درس|دروس|درسة?|مفهوم|موضوع|مادة|كورس|امتحان|اختبار|واجب|شرح|تعليم|تعلم)/i,
    strong: /\b(explain\s*like\s*i(?:'m|\s*am)\s*5|eli5|explique\s*como\s*se\s*eu|beş\s*yaşındaymışım|объясни\s*как\s*пятилетнему|ऐसे\s*समझाओ|5歳|처럼\s*설명)\b/i,
  },
  docs: {
    verbs: /\b(write|draft|prepare|generate|create|rédige|écris|prépare|redacta|escribe|prepara|schreibe|verfasse|erstelle|escreva|redija|prepare|scrivi|redigi|yaz|hazırla|напиши|подготовь|लिखो|लिखें|तैयार|tulis|siapkan|schrijf|stel\s*op|skriv|förbered|napisz|przygotuj|撰写|作成|書いて|작성|써줘)\b|(اكتب(ي|ل\s*ي)?|إكتب|صيغ|جهز(ي|ل\s*ي)?|أعد|اعد(ي|ل\s*ي)?|جاوب|صمم(ي|ل\s*ي)?)/i,
    nouns: /\b(document|doc|docs|report|contract|letter|email|resume|cv|proposal|invoice|policy|memo|essay|article|blog\s*post|document|contrat|lettre|rapport|documento|contrato|carta|informe|dokument|vertrag|brief|bericht|lebenslauf|documento|relatório|contrato|carta|currículo|documento|relazione|contratto|lettera|belge|rapor|sözleşme|резюме|документ|отчет|договор|письмо|दस्तावेज़|रिपोर्ट|अनुबंध|ईमेल|dokumen|laporan|kontrak|document|rapport|contract|brief|dokument|rapport|kontrakt|dokument|raport|umowa|文書|报告|契約|履歴書|문서|보고서|계약서|이메일)\b|(مستند|وثيقة|تقرير|عقد|عقود|خطاب|إيميل|بريد|رسالة|سيرة\s*ذاتية|CV|عرض\s*سعر|فاتورة|سياسة|مذكرة|مقال|مقالة|منشور)/i,
  },
  slides: {
    verbs: /\b(make|create|prepare|design|build|génère|crée|prépare|genera|crea|prepara|erstelle|bereite\s*vor|entwerfe|crie|prepare|faça|crea|prepara|hazırla|oluştur|создай|подготовь|बनाओ|तैयार|buat|siapkan|maak|bereid|skapa|förbered|stwórz|przygotuj|作成|生成|만들어|준비)\b|(اعمل(ي|ل\s*ي)?|إعمل|جهز(ي|ل\s*ي)?|صمم(ي|ل\s*ي)?|انشئ|أنشئ)/i,
    nouns: /\b(slides?|presentation|deck|pitch|keynote|powerpoint|pptx?|présentation|diapos|diapositives|presentación|diapositivas|präsentation|folien|apresentação|slides|diapositive|presentazione|slayt|sunum|презентация|слайды|स्लाइड|प्रेजेंटेशन|presentasi|dia|presentatie|slides|presentation|slajdy|prezentacja|幻灯片|プレゼン|スライド|슬라이드|프레젠테이션)\b|(عرض\s*تقديمي|بريزنتيشن|شرائح|سلايدز|سلايدس|بوربوينت|بور\s*بوينت|كي\s*نوت|كينوت)/i,
    strong: /\b(pitch\s*deck|slide\s*deck|slides?\s*for|deck\s*de\s*slides|pitch\s*deck|sunum\s*destesi|презентация\s*для|プレゼン資料|발표자료)\b|(عرض\s*باور\s*بوينت|عرض\s*بوربوينت)/i,
  },
  code: {
    verbs: /\b(write|build|code|develop|debug|refactor|implement|fix|écris|développe|débogue|escribe|desarrolla|depura|schreibe|entwickle|debugge|escreva|programe|corrija|desenvolva|scrivi|sviluppa|debugga|kodla|geliştir|düzelt|напиши|разработай|исправь|отладь|कोड|लिखो|ठीक|koding|buat|perbaiki|schrijf|bouw|debug|utveckla|felsök|napisz|zbuduj|napraw|コード|実装|修正|코드|개발|고쳐)\b|(اكتب(ي|ل\s*ي)?|برمج(ي|ل\s*ي)?|طور(ي|ل\s*ي)?|ابن(ي|ل\s*ي)?|ابني|أصلح|صلح|ديبج|فيكس)/i,
    nouns: /\b(code|function|script|snippet|component|api|endpoint|bug|error|regex|algorithm|sql|query|typescript|javascript|python|react|node|fonction|script|composant|función|componente|funktion|komponente|código|função|componente|codice|funzione|kod|fonksiyon|bileşen|код|функция|скрипт|ошибка|कोड|फ़ंक्शन|स्क्रिप्ट|komponen|kode|functie|component|kod|funktion|komponent|kod|funkcja|komponent|代码|函数|脚本|コード|関数|コンポーネント|코드|함수|스크립트)\b|(كود|دالة|فانكشن|سكريبت|كومبوننت|API|إند\s*بوينت|باغ|خطأ|إيرور|ريجيكس|خوارزمية|SQL|كويري|تايب\s*سكريبت|جافا\s*سكربت|بايثون|رياكت|نود)/i,
    strong: /\b(write\s*(a|me\s*a|some)?\s*code|code\s*me\s*a|debug\s*this|escreva\s*código|kod\s*yaz|напиши\s*код|कोड\s*लिखो|コードを書いて|코드\s*작성)\b|(اكتب\s*لي\s*كود|برمج\s*لي|صلح\s*الكود|أصلح\s*الكود)/i,
  },
  website: {
    verbs: /\b(build|make|create|design|launch|ship|construis|crée|conçois|lance|construye|crea|diseña|lanza|baue|erstelle|entwerfe|crie|construa|projete|crea|costruisci|tasarla|kur|создай|сделай|बनाओ|buat|bangun|maak|bouw|skapa|bygg|stwórz|zbuduj|作成|構築|制作|개발|만들어)\b|(ابن(ي|ل\s*ي)?|ابني|اعمل(ي|ل\s*ي)?|إعمل|انشئ|أنشئ|صمم(ي|ل\s*ي)?|أطلق|اطلق)/i,
    nouns: /\b(website|web\s*app|web\s*application|landing\s*page|landing|site|saas|dashboard|portfolio|store|shop|blog\s*site|app|mobile\s*app|application|site\s*web|sitio\s*web|tienda|webseite|landingpage|site|aplicativo|loja|sito|app|negozio|web\s*sitesi|uygulama|сайт|веб\s*приложение|лендинг|приложение|वेबसाइट|ऐप|aplikasi|situs|website|webapp|webbplats|aplikacja|strona|网站|网页|アプリ|サイト|웹사이트|앱)\b|(موقع|ويب\s*سايت|لاندينج|لاندنج|صفحة\s*هبوط|App|أب|متجر|ستور|بورتفوليو|داشبورد|لوحة\s*تحكم|SaaS|منصة)/i,
    strong: /\b(landing\s*page|web\s*app|full\s*stack\s*app|saas\s*app|page\s*d['’]?atterrissage|página\s*de\s*destino|web\s*uygulaması|веб\s*приложение|लैंडिंग\s*पेज|webapp|ランディングページ|웹\s*앱)\b|(موقع\s*كامل|موقع\s*متكامل|صفحة\s*هبوط)/i,
  },
  voice: {
    verbs: /\b(read|say|speak|narrate|voice|dub|lis|dis|parle|narre|lee|di|habla|narra|lies|sag|sprich|erzähle|leia|fale|narre|leggi|parla|seslendir|oku|говори|озвучь|прочитай|बोलो|पढ़ो|bacakan|ucapkan|lees|spreek|läs|säg|przeczytaj|powiedz|読み上げ|話して|읽어|말해)\b|(اقرأ|قول|تكلم|تحدث|علق|دبلج|انطق)/i,
    nouns: /\b(voice|voiceover|narration|speech|tts|audio|podcast|voix|voix\s*off|voz|locución|audio|stimme|sprachausgabe|hörbuch|voz|narração|áudio|voce|audio|ses|konuşma|голос|озвучка|аудио|आवाज़|ऑडियो|suara|audio|stem|spraak|röst|ljud|głos|audio|音声|ナレーション|오디오|음성)\b|(صوت|صوتي|تعليق\s*صوتي|بودكاست|ناريشن|تي\s*تي\s*اس|TTS|صوت\s*احترافي)/i,
  },
};

/** Explicit negation guard — user is saying they DON'T want that thing. */
const NEGATION_RE = /\b(don'?t|do\s*not|no|without|instead\s*of|except|not|pas\s*de|sans|sin|kein|keine|ohne|nicht|sem|não|nao|senza|non|yok|değil|degil|без|не\s+надо|मत|नहीं|tanpa|geen|niet|utan|nie|bez|不要|なし|하지\s*마)\b|(مش|مو|مب|بلا|بدون|لا\s*اريد|لا\s*أريد|ما\s*عايز|مش\s*عايز|مش\s*عاوز)/i;
const CODE_SPECIFIC_RE = /\b(function|api|endpoint|bug|error|debug|regex|algorithm|sql|query|typescript|javascript|python|react|node|كود|دالة|فانكشن|سكريبت|باغ|خطأ|ريجيكس|خوارزمية|код|функция|ошибка|कोड|コード|함수)\b/i;
const META_CONTENT_RE = /\b(article|essay|report|document|blog\s*post|write\s+about|explain\s+how|about\s+how|مقال|تقرير|وثيقة|عن\s+كيفية|شرح\s+عن|статья|документ|लेख|記事|문서)\b/i;

/**
 * Score a single intent against the input text.
 * Returns 0 when the required trigger pair isn't present.
 */
function scoreIntent(text: string, intent: Exclude<ChatIntent, "normal">): { score: number; matched: string[] } {
  const t = TRIGGERS[intent];
  const matched: string[] = [];
  let score = 0;

  const strong = t.strong?.exec(text);
  if (strong) {
    matched.push(strong[0]);
    score += 0.75;
  }
  const noun = t.nouns.exec(text);
  const verb = t.verbs.exec(text);
  if (noun) matched.push(noun[0]);
  if (verb) matched.push(verb[0]);

  // Baseline: strong alone is enough; otherwise need both verb + noun.
  if (verb && noun) score += 0.7;
  else if (noun && !verb) score += 0.25; // noun-only ("a video of…") — weak.

  // If the user is asking to write/explain ABOUT a thing, prefer docs/learning
  // over hijacking into the thing's tool mode (e.g. article about a website).
  if ((intent === "website" || intent === "code" || intent === "image" || intent === "video") && META_CONTENT_RE.test(text)) {
    score *= 0.55;
  }

  // `website` and `code` share many words. Pure engineering nouns should not
  // become website-builder mode just because the prompt also says "build".
  if (intent === "website" && CODE_SPECIFIC_RE.test(text)) score *= 0.55;

  // Short, focused prompts boost score.
  const words = text.trim().split(/\s+/).length;
  if (words <= 8 && score > 0) score += 0.1;
  // Very long prompts (essay-style) are usually conversational; damp them.
  if (words > 60) score *= 0.75;

  // Negation guard: if user explicitly negates, suppress. A wrong auto-switch
  // is worse than leaving the message in normal chat.
  if (NEGATION_RE.test(text) && score > 0) score = 0;

  return { score: Math.min(score, 1), matched };
}

/**
 * Priority order when two intents tie. `code` and `website` overlap heavily
 * ("build me an app") — prefer `website` when a UI/product noun is present.
 * `research` beats `learning` when both fire ("teach me about the market with sources").
 */
const PRIORITY: Exclude<ChatIntent, "normal">[] = [
  "video",
  "image",
  "slides",
  "website",
  "code",
  "research",
  "docs",
  "learning",
  "voice",
];

export interface DetectOptions {
  /** Optional last-selected mode so we can bias toward "sticky" flows. */
  currentMode?: string;
  /** Recent intents (last 5) so a hot streak nudges scoring. */
  recentIntents?: ChatIntent[];
}

export function detectIntent(rawText: string, opts: DetectOptions = {}): IntentResult {
  const text = (rawText || "").trim();
  if (!text) {
    return { intent: "normal", confidence: 0, matched: [], reason: "empty" };
  }
  // Snoozed intents get suppressed for 24h — respect user rejection.
  const snoozed = readSnoozed();

  const scores = PRIORITY.map((intent) => {
    const { score, matched } = scoreIntent(text, intent);
    let s = score;
    // Bias toward intents the user has picked recently (sticky flows).
    const recentHits = opts.recentIntents?.filter((i) => i === intent).length ?? 0;
    if (recentHits >= 2) s += 0.05;
    if (snoozed.includes(intent)) s = 0;
    return { intent, score: s, matched };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);


  const top = scores[0];
  // Aligned with ChatPage's auto-apply gate. Anything below is treated as
  // conversational text — no silent "matched but ignored" gap.
  if (!top || top.score < INTENT_AUTO_APPLY_THRESHOLD) {
    return { intent: "normal", confidence: top?.score ?? 0, matched: [], reason: "below threshold" };
  }


  return {
    intent: top.intent,
    confidence: Number(top.score.toFixed(2)),
    matched: top.matched,
    reason: `matched ${top.matched.join(" + ")}`,
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Rejection memory: if the user dismisses the same suggestion 3 times, mute  */
/* it for 24 hours so we stop nagging.                                        */
/* ────────────────────────────────────────────────────────────────────────── */

const REJECT_KEY = "megsy.intent.rejects.v1";
const SNOOZE_MS = 24 * 60 * 60 * 1000;

interface RejectRec { intent: ChatIntent; count: number; snoozedUntil?: number }

function readRejects(): RejectRec[] {
  try { return JSON.parse(localStorage.getItem(REJECT_KEY) || "[]"); } catch { return []; }
}
function writeRejects(list: RejectRec[]) {
  try { localStorage.setItem(REJECT_KEY, JSON.stringify(list)); } catch {}
}
function readSnoozed(): ChatIntent[] {
  const now = Date.now();
  return readRejects().filter((r) => r.snoozedUntil && r.snoozedUntil > now).map((r) => r.intent);
}
export function rejectIntent(intent: ChatIntent) {
  const list = readRejects();
  const existing = list.find((r) => r.intent === intent);
  if (existing) {
    existing.count += 1;
    if (existing.count >= 3) existing.snoozedUntil = Date.now() + SNOOZE_MS;
  } else {
    list.push({ intent, count: 1 });
  }
  writeRejects(list);
}
export function acceptIntent(intent: ChatIntent) {
  // Positive feedback clears past rejections for that intent.
  const list = readRejects().filter((r) => r.intent !== intent);
  writeRejects(list);
}
