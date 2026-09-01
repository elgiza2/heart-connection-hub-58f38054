import { streamChat } from "@/lib/streamChat";
import { DEFAULT_MODEL } from "@/lib/defaultModel";

export type PreambleKind =
  | "deep-research"
  | "slides"
  | "images"
  | "video"
  | "docs"
  | "computer";

const KIND_BRIEF: Record<PreambleKind, string> = {
  "deep-research": "a deep research report with live web sources",
  slides: "a presentation deck",
  images: "an AI generated image",
  video: "an AI generated video",
  docs: "a document",
  computer: "a task you will carry out yourself on a real computer/browser",
};

/**
 * Streams a short, model-written preamble that tells the user what is about to
 * be produced, in their own language. Never returns canned text: on any
 * failure it resolves to an empty string and the caller starts the job
 * immediately with no preamble at all.
 */
export async function generateTurnPreamble(params: {
  kind: PreambleKind;
  userText: string;
  chatUserId?: string | null;
  conversationId?: string | null;
  onDelta?: (delta: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const { kind, userText, chatUserId, conversationId, onDelta, signal } = params;
  const request = (userText || "").trim();
  if (!request) return "";

  const prompt = [
    `The user asked for ${KIND_BRIEF[kind]}.`,
    "Write ONLY a short natural reply (1-2 sentences, max ~35 words) that acknowledges the request and states concretely what you are about to produce and how you will approach it.",
    "Reply in the exact same language and dialect the user used.",
    "No greetings, no markdown, no bullet points, no headings, no emojis, no promises about time.",
    "",
    `User request: ${request}`,
  ].join("\n");

  let out = "";
  try {
    await streamChat({
      messages: [{ role: "user", content: prompt }],
      model: DEFAULT_MODEL,
      searchEnabled: false,
      chatMode: "normal",
      user_id: chatUserId || undefined,
      conversation_id: conversationId || undefined,
      signal,
      onDelta: (delta) => {
        if (!delta) return;
        out += delta;
        onDelta?.(delta);
      },
      onDone: () => {},
      onError: () => {},
    });
  } catch {
    return out.trim();
  }
  return out.trim();
}
