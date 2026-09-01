// "الروبوت الذكي الداخلي" لوضع Images: يحسّن كل طلب تلقائيًا قبل التوليد،
// ويكتشف نية التعديل على صورة سبق توليدها حتى لا يحتاج المستخدم لإعادة إرفاقها.

import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_MODEL } from "@/lib/defaultModel";

const CHAT_EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-alibaba`;

const EDIT_PATTERNS =
  /(عدّل|عدل|تعديل|غيّر|غير|بدّل|بدل|خلي|اجعل|احذف|امسح|شيل|ضيف|أضف|زوّد|نفس الصورة|الصوره دي|الصورة دي|هذه الصورة|نفس الشخصية|edit|change|modify|adjust|remove|erase|replace|make it|same image|this image|tweak|retouch)/i;

/** هل الطلب تعديل على آخر صورة مولّدة بدل Generate image Newة؟ */
export function detectImageEditIntent(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  if (t.split(/\s+/).length > 40) return false;
  return EDIT_PATTERNS.test(t);
}

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
}

const SYSTEM_ENHANCE = `You are an internal image-prompt engineer. Rewrite the user's request into ONE rich, concrete English image prompt.
Rules:
- Keep the user's exact subject, intent, text content and composition wishes. Never invent a different subject.
- Add useful visual detail: lighting, lens/camera, materials, mood, color palette, background, quality cues.
- If an identity/character description is provided, preserve it word-for-word so the same character stays consistent.
- Output ONLY the final prompt. No quotes, no explanation, no markdown, max 120 words.`;

/**
 * يحسّن البرومبت داخليًا عبر نموذج الدردشة. عند أي فشل نُرجع النص الأصلي
 * حتى لا يتعطل التوليد أبدًا.
 */
export async function enhanceImagePrompt(args: {
  text: string;
  identity?: string;
  editOf?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const base = (args.text || "").trim();
  if (!base) return base;
  const parts = [`User request: ${base}`];
  if (args.identity) parts.push(`Character identity to preserve exactly: ${args.identity}`);
  if (args.editOf)
    parts.push(
      `This is an EDIT of an existing image originally described as: ${args.editOf}. Keep everything else identical and apply only the requested change.`,
    );

  try {
    const token = await accessToken();
    const resp = await fetch(CHAT_EDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
      },
      signal: args.signal,
      body: JSON.stringify({
        messages: [{ role: "user", content: parts.join("\n") }],
        model: DEFAULT_MODEL,
        chatMode: "images",
        customSystem: SYSTEM_ENHANCE,
      }),
    });
    if (!resp.ok || !resp.body) return base;

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let out = "";
    const handle = (line: string) => {
      if (!line.startsWith("data: ")) return;
      const payload = line.slice(6).trim();
      if (!payload || payload === "[DONE]") return;
      try {
        const parsed = JSON.parse(payload);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (typeof delta === "string") out += delta;
      } catch {
        /* status frames */
      }
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        handle(buffer.slice(0, idx).replace(/\r$/, ""));
        buffer = buffer.slice(idx + 1);
      }
    }
    if (buffer.trim()) handle(buffer.trim());

    const cleaned = out
      .replace(/```[a-z]*|```/gi, "")
      .replace(/^\s*(prompt|final prompt)\s*:\s*/i, "")
      .trim();
    return cleaned.length >= 8 ? cleaned.slice(0, 1200) : base;
  } catch {
    return base;
  }
}

/** يبني البرومبت النهائي لمشهد Imagesة مع الهوية والتعديل الداخلي. */
export function composeImagePrompt(args: {
  enhanced: string;
  identity?: string;
  editInstruction?: string;
}): string {
  const chunks: string[] = [];
  if (args.identity) chunks.push(`Consistent character identity: ${args.identity}.`);
  chunks.push(args.enhanced);
  if (args.editInstruction) chunks.push(`Apply this change only: ${args.editInstruction}.`);
  return chunks.join(" ").trim();
}
