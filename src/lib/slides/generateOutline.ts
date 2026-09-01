import { streamChat } from "@/lib/streamChat";
import { parseSlidesOutline, type SlidesOutline } from "@/lib/slidesOutlineParser";
import type { SlidesSlideContent } from "./planTypes";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function buildFallbackSlidesOutline(
  topic: string,
  language: "ar" | "en" = "en",
  slideCount = 8,
): SlidesOutline {
  const ar = language === "ar";
  const cleanTopic = topic.trim() || (ar ? "الموضوع" : "the topic");
  const sections = ar
    ? ["نظرة عامة", "السياق", "الفكرة الأساسية", "أهم النقاط", "أمثلة عملية", "التحديات", "التوصيات", "الخلاصة"]
    : ["Overview", "Context", "Core idea", "Key insights", "Practical examples", "Challenges", "Recommendations", "Conclusion"];
  return {
    intro: "",
    steps: Array.from({ length: slideCount }, (_, index) => ({
      title: index === 0 ? cleanTopic : `${sections[index % sections.length]} — ${cleanTopic}`,
      items: ar
        ? ["نقطة رئيسية مرتبطة بالموضوع", "تفصيل مختصر وواضح", "مثال أو نتيجة قابلة للتطبيق"]
        : ["Main point related to the topic", "A concise supporting detail", "A practical example or takeaway"],
    })),
  };
}

async function ask(params: {
  prompt: string;
  userId?: string;
  signal?: AbortSignal;
}): Promise<string> {
  let text = "";
  await new Promise<void>((resolve, reject) => {
    void streamChat({
      messages: [{ role: "user", content: params.prompt }],
      chatMode: "chat",
      user_id: params.userId,
      signal: params.signal,
      onDelta: (d) => {
        text += d;
      },
      onDone: () => resolve(),
      onError: (e) => reject(new Error(e)),
    }).catch(reject);
  });
  return text.trim();
}

/**
 * Asks the chat model for a structured slide-by-slide plan before generation.
 * Optionally grounded on user-uploaded file data and deep-research findings.
 * Never throws — returns null on failure.
 */
export async function generateSlidesOutline(params: {
  topic: string;
  slideCount?: number;
  language?: "ar" | "en";
  userId?: string;
  signal?: AbortSignal;
  /** Extracted text from user attachments. */
  sourceText?: string;
  /** Deep-research report to ground the outline on. */
  researchText?: string;
}): Promise<{ text: string; outline: SlidesOutline } | null> {
  const count = params.slideCount ?? 8;
  const ar = params.language === "ar";

  const grounding: string[] = [];
  if (params.sourceText?.trim()) {
    grounding.push(
      ("Data from user-uploaded files — analyze it and rely on it; never invent numbers:\n") +
        clip(params.sourceText.trim(), 8000),
    );
  }
  if (params.researchText?.trim()) {
    grounding.push(
      ("Recent deep-research findings:\n") +
        clip(params.researchText.trim(), 6000),
    );
  }

  const prompt = ar
    ? `اعمل مخطط عرض تقديمي عن: "${params.topic}".
اكتب ${count} سلايد بالتنسيق التالي بالحرف، بدون أي مقدمات أو خواتيم:

Slide 1: عنوان السلايد
- نقطة قصيرة
- نقطة قصيرة

Slide 2: عنوان السلايد
- نقطة قصيرة
...

قواعد: كل سلايد له عنوان واضح و2-4 نقاط قصيرة (كل نقطة أقل من 12 كلمة). لا تكتب أي شرح خارج القائمة.${
        grounding.length ? `\n\n${grounding.join("\n\n")}` : ""
      }`
    : `Create a presentation outline about: "${params.topic}".
Write ${count} slides in exactly this format, with no intro or closing text:

Slide 1: Slide title
- short bullet
- short bullet

Slide 2: Slide title
- short bullet
...

Rules: each slide has a clear title and 2-4 short bullets (max 12 words each). Output nothing except the list.${
        grounding.length ? `\n\n${grounding.join("\n\n")}` : ""
      }`;

  let text = "";
  try {
    text = await ask({ prompt, userId: params.userId, signal: params.signal });
  } catch {
    return null;
  }

  const trimmed = text.trim();
  if (!trimmed) return null;
  const outline = parseSlidesOutline(trimmed);
  if (!outline.steps.length) return null;
  return { text: trimmed, outline };
}

/**
 * Review step: expands the approved outline into the actual written content of
 * every slide so the user can read (and edit) it before the deck is rendered.
 */
export async function generateSlidesContent(params: {
  outline: SlidesOutline;
  topic: string;
  language?: "ar" | "en";
  userId?: string;
  signal?: AbortSignal;
  sourceText?: string;
  researchText?: string;
}): Promise<SlidesSlideContent[] | null> {
  const ar = params.language === "ar";
  const steps = params.outline?.steps || [];
  if (!steps.length) return null;

  const outlineText = steps
    .map((s, i) => `Slide ${i + 1}: ${s.title}\n${(s.items || []).map((b) => `- ${b}`).join("\n")}`)
    .join("\n\n");

  const grounding = [
    params.sourceText?.trim()
      ? ("User data:\n") + clip(params.sourceText.trim(), 6000)
      : "",
    params.researchText?.trim()
      ? ("Research findings:\n") + clip(params.researchText.trim(), 5000)
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const prompt = ar
    ? `اكتب المحتوى النهائي لكل سلايد في العرض التقديمي عن "${params.topic}".
المخطط المعتمد:

${outlineText}

أعد نفس عدد الشرائح بنفس الترتيب بهذا التنسيق بالضبط:

Slide 1: العنوان
النص الكامل للسلايد في 2-4 جمل قصيرة واضحة.

لا تكتب أي شيء خارج هذا التنسيق.${grounding ? `\n\n${grounding}` : ""}`
    : `Write the final content for every slide of a presentation about "${params.topic}".
Approved outline:

${outlineText}

Return the same number of slides in the same order, in exactly this format:

Slide 1: Title
Full slide text in 2-4 short, clear sentences.

Output nothing outside this format.${grounding ? `\n\n${grounding}` : ""}`;

  let text = "";
  try {
    text = await ask({ prompt, userId: params.userId, signal: params.signal });
  } catch {
    return null;
  }
  const parsed = parseSlidesOutline(text);
  if (!parsed.steps.length) return null;
  return parsed.steps.map((s) => ({ title: s.title, body: (s.items || []).join(" ") }));
}

/** Rewrites a single slide (title + body) according to a user instruction. */
export async function reviseSingleSlide(params: {
  slideNumber: number;
  currentTitle: string;
  currentBody: string;
  instruction: string;
  topic: string;
  language?: "ar" | "en";
  userId?: string;
  signal?: AbortSignal;
}): Promise<SlidesSlideContent | null> {
  const ar = params.language === "ar";
  const prompt = `This is slide ${params.slideNumber} of a presentation about "${params.topic}":
Title: ${params.currentTitle}
Body: ${params.currentBody}

User edit request: ${params.instruction}

Rewrite only this slide in exactly this format, with no extra text:

Slide ${params.slideNumber}: New title
New body in 2-4 sentences.`;

  let text = "";
  try {
    text = await ask({ prompt, userId: params.userId, signal: params.signal });
  } catch {
    return null;
  }
  const parsed = parseSlidesOutline(text);
  const first = parsed.steps[0];
  if (!first) return null;
  return { title: first.title, body: (first.items || []).join(" ") };
}
