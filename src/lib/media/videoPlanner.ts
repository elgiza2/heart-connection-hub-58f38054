// مخطِّط الفيديو: قبل التوليد يبني خطة كاملة (فهم الشخصية/المنتج + المشاهد
// + السيناريو الممتد) ثم تُعرض على المستخدم للموافقة قبل بدء التوليد.

import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_MODEL } from "@/lib/defaultModel";

const CHAT_EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-alibaba`;

export interface VideoPlanScene {
  title: string;
  prompt: string;
  duration_seconds?: number;
}

export interface VideoStoryPlan {
  /** وصف ثابت للشخصية أو المنتج يُحقن في كل لقطة للحفاظ على الاتساق. */
  identity: string;
  /** السيناريو الممتد المقروء للمستخدم. */
  storyline: string;
  scenes: VideoPlanScene[];
}

const SYSTEM = `You are a senior video director. Plan a short video before any rendering.
Return ONLY valid minified JSON, no markdown fences, with this exact shape:
{"identity":"...","storyline":"...","scenes":[{"title":"...","prompt":"...","duration_seconds":5}]}
Rules:
- "identity": one dense English paragraph fully describing the MAIN CHARACTER or PRODUCT (face, age, hair, skin, outfit, colors, materials, distinguishing details). This exact description will be repeated in every shot so the subject stays identical across all shots. Be specific enough that two renders look like the same person/product.
- "storyline": 2-4 sentences describing the continuous narrative across the shots, written in the SAME LANGUAGE as the user's request.
- "scenes": one entry per shot, in narrative order. "title" in the user's language, "prompt" in English describing camera, action, setting, lighting and mood for that shot only (do NOT repeat the identity paragraph inside the prompt).
- Respect the requested number of shots and duration exactly.`;

async function token() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
}

function extractJson(raw: string): any | null {
  const cleaned = raw.replace(/```json|```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function planVideoStory(args: {
  text: string;
  sceneCount: number;
  durationSec: number;
  ugc?: boolean;
  referenceNote?: string;
}): Promise<VideoStoryPlan | null> {
  const req = [
    `User request: ${args.text}`,
    `Number of shots: ${args.sceneCount}`,
    `Duration per shot: ${args.durationSec} seconds`,
    args.ugc ? "Style: authentic user-generated content (UGC), smartphone-shot look." : "",
    args.referenceNote || "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const resp = await fetch(CHAT_EDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${await token()}`,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: req }],
        model: DEFAULT_MODEL,
        chatMode: "video",
        customSystem: SYSTEM,
      }),
    });
    if (!resp.ok || !resp.body) return null;

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let out = "";
    const handle = (line: string) => {
      if (!line.startsWith("data: ")) return;
      const payload = line.slice(6).trim();
      if (!payload || payload === "[DONE]") return;
      try {
        const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
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

    const parsed = extractJson(out);
    const scenes: VideoPlanScene[] = Array.isArray(parsed?.scenes)
      ? parsed.scenes
          .filter((s: any) => s && typeof s.prompt === "string" && s.prompt.trim())
          .map((s: any) => ({
            title: String(s.title || "").slice(0, 80) || "Shot",
            prompt: String(s.prompt).slice(0, 900),
            duration_seconds: Number(s.duration_seconds) || args.durationSec,
          }))
      : [];
    if (!scenes.length) return null;
    return {
      identity: String(parsed.identity || "").slice(0, 900),
      storyline: String(parsed.storyline || "").slice(0, 1200),
      scenes,
    };
  } catch {
    return null;
  }
}
