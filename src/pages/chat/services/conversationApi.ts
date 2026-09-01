import { supabase } from "@/integrations/supabase/client";
import { getCachedUser } from "@/lib/cachedUser";
import { getActiveWorkspaceId } from "@/lib/activeWorkspace";
import { type ChatMode } from "../chatConstants";
import { DEFAULT_MODEL } from "@/lib/defaultModel";

/**
 * Asks the lightweight chat-alibaba edge function to compress the user's first
 * message into a 2-3 word title in the original language, then persists it.
 * Silent on failure — the long fallback title remains in place.
 */
export async function generateShortTitle(
  firstMessage: string,
  convId: string,
  setConversationTitle: (t: string) => void,
): Promise<void> {
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-alibaba`;
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    // Detect Arabic so we can use an Arabic-native instruction — otherwise
    // the model sometimes answers the English "Summarize..." prompt with a
    // one-word Arabic reply like "لا" (No) instead of an actual title.
    const isArabic = /[\u0600-\u06FF]/.test(firstMessage);
    const instruction = `Write a very short title (two to three words maximum) summarizing the following message, in the same language as the message. Return only the title with no quotes, punctuation, or explanation. Do NOT answer the message:\n\n${firstMessage.slice(0, 500)}`;

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [{ role: "user", content: instruction }],
      }),
    });

    if (!resp.ok || !resp.body) return;
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let title = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload);
          const delta =
            json?.choices?.[0]?.delta?.content || json?.choices?.[0]?.message?.content || "";
          if (delta) title += delta;
        } catch {
          /* ignore */
        }
      }
    }
    title = title
      .replace(/["'`*_#]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
    title = title.replace(/[.,!?…]+$/g, "").trim();
    const words = title.split(/\s+/).filter(Boolean).slice(0, 4);
    // Drop a dangling connector left by the word cut ("... حسابك مش", "... of the").
    const dangling = new Set([
      "مش", "في", "من", "على", "عن", "و", "أو", "ما", "لو", "إن",
      "of", "the", "a", "an", "and", "or", "to", "for", "in", "on", "is", "are",
    ]);
    while (words.length > 1 && dangling.has(words[words.length - 1].toLowerCase())) words.pop();
    let finalTitle = words.join(" ").slice(0, 60);

    // Reject junk replies (yes/no/ok in AR/EN) — including ones that merely
    // start with a refusal — and fall back to an excerpt of the user's message.
    const junk = new Set([
      "لا", "نعم", "حسنا", "حسناً", "أوك", "اوك", "طيب", "تمام",
      "no", "yes", "ok", "okay", "sure", "hi", "hello", "hey",
    ]);
    const firstWord = (words[0] || "").replace(/[،,.!؟?:]+$/g, "").toLowerCase();
    if (!finalTitle || junk.has(finalTitle.trim().toLowerCase()) || junk.has(firstWord)) {
      finalTitle = firstMessage.trim().replace(/\s+/g, " ").slice(0, 40);
    }

    if (!finalTitle) return;

    await supabase.from("conversations").update({ title: finalTitle }).eq("id", convId);
    setConversationTitle(finalTitle);
  } catch (e) {
    console.error("[generateShortTitle] failed", e);
  }
}

function modeToDbMode(chatMode: ChatMode | string): string {
  switch (chatMode) {
    case "deep-research":
      return "research";
    case "learning":
      return "learning";
    case "shopping":
      return "shopping";
    case "slides":
    case "slides-images":
      return "slides";
    // Persist media/code conversations under their own DB modes so the
    // sidebar (which filters by mode when the user is in those modes)
    // can find them again instead of treating them as "deleted".
    case "images":
      return "images";
    case "video":
      return "videos";
    case "website":
    case "coding":
    case "code":
      return "code";
    default:
      return "chat";
  }
}

export interface CreateOrUpdateOptions {
  conversationId: string | null;
  chatMode: ChatMode;
  setConversationId: (id: string) => void;
  setConversationTitle: (t: string) => void;
}

/**
 * Returns the existing conversationId or creates a new conversation row
 * (insert + title kickoff). Returns null when the user is unauthenticated
 * or the insert fails.
 */
export async function createOrUpdateConversation(
  firstMessage: string,
  opts: CreateOrUpdateOptions,
): Promise<string | null> {
  if (opts.conversationId) return opts.conversationId;
  const user = await getCachedUser();
  if (!user) return null;
  const title = firstMessage.slice(0, 50) || "New Chat";
  const mode = modeToDbMode(opts.chatMode);
  const ws = getActiveWorkspaceId();
  const { data } = await supabase
    .from("conversations")
    .insert({
      title,
      mode,
      model: DEFAULT_MODEL,
      user_id: user.id,
      ...(ws ? { workspace_id: ws } : {}),
    } as any)
    .select("id")
    .single();
  if (data) {
    opts.setConversationId(data.id);
    opts.setConversationTitle(title);
    // Keep title generation off the first-token critical path. Starting a
    // second model stream here competes with chat-fast for the browser and the
    // workspace gateway exactly while the user is waiting for the reply.
    window.setTimeout(() => {
      void generateShortTitle(firstMessage, data.id, opts.setConversationTitle);
    }, 2500);
    return data.id;
  }
  return null;
}

/** Persists a chat message to the messages table. */
export async function saveMessage(
  convId: string,
  role: string,
  content: string,
  images?: string[],
  metadata?: Record<string, unknown>,
): Promise<string | undefined> {
  const user = await getCachedUser();
  const payload: Record<string, unknown> = {
    conversation_id: convId,
    role,
    content,
    images: images || null,
    user_id: user?.id || null,
  };
  if (metadata && Object.keys(metadata).length) payload.metadata = metadata;
  const { data } = await supabase
    .from("messages")
    .insert(payload as any)
    .select("id")
    .single();
  const insertedId = (data as any)?.id as string | undefined;
  return insertedId;
}

/** Merges new keys into a message's metadata JSON column (best-effort). */
export async function updateMessageMetadata(
  messageId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from("messages")
      .select("metadata")
      .eq("id", messageId)
      .maybeSingle();
    const merged = { ...((existing as any)?.metadata || {}), ...patch };
    await supabase
      .from("messages")
      .update({ metadata: merged } as any)
      .eq("id", messageId);
  } catch {
    // non-fatal — persistence is best effort
  }
}

/**
 * Asks the slides edge function to produce a freeform pre/post narration
 * message wrapped around slide generation. Returns null on any failure.
 */
export async function fetchSlidesNarration(params: {
  mode: "plan" | "summary";
  topic: string;
  kind: "slides" | "slides-images";
  slideCount?: number;
  title?: string;
  format?: "outline" | "text";
  language?: string;
}): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke("chat-slides-stream", {
      body: { action: "message", model: DEFAULT_MODEL, ...params },
    });
    if (error) return null;
    const msg = String((data as any)?.message || "").trim();
    return msg || null;
  } catch {
    return null;
  }
}
