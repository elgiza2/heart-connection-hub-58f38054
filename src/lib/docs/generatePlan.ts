import { streamChat } from "@/lib/streamChat";
import type { DocsSection, DocsSectionContent } from "./planTypes";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

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

/** Parses "Section N: Title" blocks followed by "- point" lines. */
export function parseDocsOutline(raw: string): DocsSection[] {
  const lines = (raw || "").split(/\r?\n/);
  const out: DocsSection[] = [];
  const head = /^\s*(?:section|sec|قسم|جزء)\s*\d+\s*[:：.\-]\s*(.+)$/i;
  const bullet = /^\s*(?:[-*•·]|\d+[.)])\s+(.+)$/;
  for (const line of lines) {
    const h = line.match(head);
    if (h) {
      out.push({ title: h[1].trim(), points: [] });
      continue;
    }
    const b = line.match(bullet);
    if (b && out.length) {
      out[out.length - 1].points.push(b[1].trim());
      continue;
    }
    const t = line.trim();
    if (t && out.length && !out[out.length - 1].points.length && out[out.length - 1].title === "") {
      out[out.length - 1].title = t;
    }
  }
  return out.filter((s) => s.title);
}

/** Detects the document type + language from the user's request. */
export function detectDocLanguage(text: string): "ar" | "en" {
  return /[\u0600-\u06FF]/.test(text || "") ? "ar" : "en";
}

/**
 * Step 1 — planning. Produces a section-by-section outline for the document,
 * optionally grounded on uploaded files and deep research findings.
 * Never throws — returns null on failure.
 */
export async function generateDocsOutline(params: {
  topic: string;
  docType?: string;
  language?: "ar" | "en";
  userId?: string;
  signal?: AbortSignal;
  sourceText?: string;
  researchText?: string;
  sectionCount?: number;
}): Promise<{ docType: string; sections: DocsSection[] } | null> {
  const ar = params.language === "ar";
  const count = params.sectionCount ?? 6;

  const grounding: string[] = [];
  if (params.sourceText?.trim()) {
    grounding.push(
      ("Data from user-uploaded files — analyze it and rely on it; never invent numbers:\n") +
        clip(params.sourceText.trim(), 9000),
    );
  }
  if (params.researchText?.trim()) {
    grounding.push(
      ("Recent deep-research findings:\n") +
        clip(params.researchText.trim(), 6000),
    );
  }

  const prompt = ar
    ? `اعمل مخطط مستند احترافي عن: "${params.topic}".
أولًا اكتب سطر واحد بالشكل: DocType: <نوع المستند بالعربية>
ثم اكتب ${count} أقسام بهذا التنسيق بالحرف بدون أي مقدمات:

Section 1: عنوان القسم
- نقطة قصيرة
- نقطة قصيرة

Section 2: عنوان القسم
- نقطة قصيرة

قواعد: عناوين واضحة و2-4 نقاط قصيرة لكل قسم. لا تكتب أي شرح خارج القائمة.${
        grounding.length ? `\n\n${grounding.join("\n\n")}` : ""
      }`
    : `Create a professional document outline about: "${params.topic}".
First write one line: DocType: <document type>
Then write ${count} sections in exactly this format, with no intro text:

Section 1: Section title
- short bullet
- short bullet

Section 2: Section title
- short bullet

Rules: clear titles and 2-4 short bullets per section. Output nothing else.${
        grounding.length ? `\n\n${grounding.join("\n\n")}` : ""
      }`;

  let text = "";
  try {
    text = await ask({ prompt, userId: params.userId, signal: params.signal });
  } catch {
    return null;
  }
  if (!text) return null;
  const dt = text.match(/^\s*DocType\s*[:：]\s*(.+)$/im)?.[1]?.trim();
  const sections = parseDocsOutline(text);
  if (!sections.length) return null;
  return { docType: params.docType || dt || ("document"), sections };
}

/**
 * Step 3 — review. Expands the approved outline into the real written text of
 * every section so the user can read and edit it before the file is produced.
 */
export async function generateDocsContent(params: {
  sections: DocsSection[];
  topic: string;
  docType?: string;
  language?: "ar" | "en";
  userId?: string;
  signal?: AbortSignal;
  sourceText?: string;
  researchText?: string;
  sources?: { title: string; url: string }[];
}): Promise<DocsSectionContent[] | null> {
  const ar = params.language === "ar";
  const sections = params.sections || [];
  if (!sections.length) return null;

  const outlineText = sections
    .map(
      (s, i) => `Section ${i + 1}: ${s.title}\n${(s.points || []).map((b) => `- ${b}`).join("\n")}`,
    )
    .join("\n\n");

  const refs = (params.sources || []).slice(0, 12);
  const grounding = [
    params.sourceText?.trim()
      ? ("User data:\n") + clip(params.sourceText.trim(), 7000)
      : "",
    params.researchText?.trim()
      ? ("Research findings:\n") + clip(params.researchText.trim(), 6000)
      : "",
    refs.length
      ? ("Real available references (cite only these):\n") +
        refs.map((r, i) => `[${i + 1}] ${r.title} — ${r.url}`).join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const prompt = ar
    ? `اكتب المحتوى النهائي لكل قسم في مستند (${params.docType || "مستند"}) عن "${params.topic}".
المخطط المعتمد:

${outlineText}

أعد نفس عدد الأقسام بنفس الترتيب بهذا التنسيق بالضبط:

Section 1: العنوان
النص الكامل للقسم بأسلوب متسق ومحافظ ومناسب لنوع المستند (2-5 فقرات قصيرة).

قواعد مهمة: أسلوب واحد متسق في كل المستند، بدون مبالغة أو حشو، وبدون أي عناصر نائبة مثل [الاسم].${
        refs.length
          ? " إذا استشهدت بمعلومة من Search فاذكر رقم المرجع بين قوسين مثل [1]، ولا تخترع مراجع غير موجودة."
          : " لا تخترع أي مراجع."
      }${grounding ? `\n\n${grounding}` : ""}`
    : `Write the final content of every section of a ${params.docType || "document"} about "${params.topic}".
Approved outline:

${outlineText}

Return the same number of sections in the same order, in exactly this format:

Section 1: Title
Full section text in a consistent, conservative tone suited to the document type (2-5 short paragraphs).

Rules: one consistent voice across the whole document, no fluff, no placeholders like [Your Name].${
        refs.length
          ? " When you cite a researched fact, add its bracketed reference number like [1]; never invent references."
          : " Never invent references."
      }${grounding ? `\n\n${grounding}` : ""}`;

  let text = "";
  try {
    text = await ask({ prompt, userId: params.userId, signal: params.signal });
  } catch {
    return null;
  }
  const parsed = parseDocsOutline(text);
  if (parsed.length) {
    return parsed.map((s) => ({ title: s.title, body: s.points.join("\n\n") }));
  }
  // Fallback: split by "Section N:" headings manually.
  const blocks = text.split(/^\s*Section\s*\d+\s*[:：]\s*/im).filter((b) => b.trim());
  if (!blocks.length) return null;
  return blocks.map((b) => {
    const [first, ...rest] = b.trim().split(/\r?\n/);
    return { title: first.trim(), body: rest.join("\n").trim() };
  });
}

/** Rewrites a single section according to a user instruction. */
export async function reviseDocsSection(params: {
  sectionNumber: number;
  currentTitle: string;
  currentBody: string;
  instruction: string;
  topic: string;
  language?: "ar" | "en";
  userId?: string;
  signal?: AbortSignal;
}): Promise<DocsSectionContent | null> {
  const ar = params.language === "ar";
  const prompt = `This is section ${params.sectionNumber} of a document about "${params.topic}":
Title: ${params.currentTitle}
Body: ${params.currentBody}

Edit request: ${params.instruction}

Rewrite only this section in the same voice, in exactly this format and nothing else:

Section ${params.sectionNumber}: New title
New body.`;

  let text = "";
  try {
    text = await ask({ prompt, userId: params.userId, signal: params.signal });
  } catch {
    return null;
  }
  const parsed = parseDocsOutline(text);
  if (parsed[0]) return { title: parsed[0].title, body: parsed[0].points.join("\n\n") };
  const m = text.match(/^\s*Section\s*\d+\s*[:：]\s*(.+)$/im);
  if (!m) return null;
  const body = text.slice(text.indexOf(m[0]) + m[0].length).trim();
  return { title: m[1].trim(), body };
}

/**
 * Rewrites a short piece of text inside an existing document without
 * regenerating anything else. Returns the replacement string only.
 */
export async function rewriteSnippet(params: {
  snippet: string;
  instruction: string;
  language?: "ar" | "en";
  userId?: string;
}): Promise<string | null> {
  const ar = params.language === "ar";
  const prompt = `Rewrite only this text per the instruction. Return the new text only, with no explanation or quotes:

Text: ${params.snippet}
Instruction: ${params.instruction}`;
  try {
    const out = await ask({ prompt, userId: params.userId });
    return out.replace(/^["'«»]|["'«»]$/g, "").trim() || null;
  } catch {
    return null;
  }
}
