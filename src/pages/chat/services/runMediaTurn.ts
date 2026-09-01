import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { loadMediaSettings } from "@/components/chat/mobile/MediaSettingsMenu";
import type { Message, ChatMode } from "../chatConstants";
import { DEFAULT_MODEL } from "@/lib/defaultModel";


export type MediaPlan = any;

const CHAT_EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-alibaba`;

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
}

/**
 * Uploads data-URL image attachments to Supabase Storage and returns public
 * URLs, so image providers (renderful/deapi) can fetch them as references.
 */
async function uploadAttachedImages(dataUrls: string[]): Promise<string[]> {
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  const urls: string[] = [];
  for (const [i, d] of dataUrls.entries()) {
    if (typeof d !== "string") continue;
    if (/^https?:\/\//.test(d)) {
      urls.push(d);
      continue;
    }
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(d);
    if (!match) continue;
    if (!uid) throw new Error("سجّل الدخول أولًا حتى أقدر أرفع الصورة وأعدل عليها.");
    try {
      const mime = match[1];
      const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
      const bin = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
      const path = `${uid}/chat-uploads/${Date.now()}-${i}.${ext}`;
      const { data: up, error } = await supabase.storage
        .from("user-images")
        .upload(path, bin, { contentType: mime, upsert: false });
      if (error || !up?.path) throw error ?? new Error("Image upload failed");
      const { data: pub } = supabase.storage.from("user-images").getPublicUrl(up.path);
      if (pub?.publicUrl) urls.push(pub.publicUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image upload failed";
      throw new Error(`فشل رفع الصورة المرفقة: ${message}`);
    }
  }
  if (dataUrls.length > 0 && urls.length === 0) {
    throw new Error("فشل رفع الصورة المرفقة، لذلك لم أبدأ توليد صورة جديدة بدونها.");
  }
  return urls;
}

function preservingImageEditPrompt(prompt: string, userRequest: string): string {
  const request = (userRequest || prompt || "Apply the requested edit").trim();
  const base = (prompt || request).trim();
  return [
    "Use the provided reference image as the exact source image.",
    "Preserve the original subject, identity, pose, composition, camera angle, proportions, and every unchanged detail.",
    "Do not create a new unrelated image.",
    `Apply only this requested edit: ${request}.`,
    base && base !== request ? `Detailed edit prompt: ${base}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function sanitizeLyrics(raw: string, prompt: string, isArabic: boolean): string {
  let lyrics = raw
    .replace(/```(?:lyrics|text|markdown)?/gi, "")
    .replace(/```/g, "")
    .replace(/^\s*(?:كلمات الأغنية|الأغنية|lyrics|song lyrics)\s*:?\s*/i, "")
    .trim();

  if (!/\[(verse|chorus|bridge)\]/i.test(lyrics)) {
    const lines = lyrics
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length >= 4) {
      const mid = Math.max(2, Math.floor(lines.length / 2));
      lyrics = `[verse]\n${lines.slice(0, mid).join("\n")}\n\n[chorus]\n${lines.slice(mid).join("\n")}`;
    } else if (isArabic) {
      lyrics = `[verse]\nعن ${prompt}\nهنغني ونعيش الإحساس\n\n[chorus]\nهبدأ أولد دلوقتي\nوالحلم هيعلى مع الناس`;
    } else {
      lyrics = `[verse]\nA song about ${prompt}\nWe carry the feeling through the night\n\n[chorus]\nI am starting the generation now\nLet the dream rise into light`;
    }
  }

  return lyrics.slice(0, 3_500).trim();
}

function musicIntro(_lyrics: string, _isArabic: boolean): string {
  return "";
}

function musicDraftIntro(_rawLyrics: string, _isArabic: boolean): string {
  return "";
}

async function streamLyricsFromChatEdge({
  prompt,
  isArabic,
  onDraft,
}: {
  prompt: string;
  isArabic: boolean;
  onDraft: (content: string) => void;
}): Promise<string> {
  const token = await getAccessToken();
  const customSystem = "Write full song lyrics only, in the same language and dialect as the user. Use [verse], [chorus], and optional [bridge] tags, each on its own line. No intro, no explanation, no links, no model names, and no text outside the lyrics. Make the chorus strong, repeatable, and singable.";

  const resp = await fetch(CHAT_EDGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      model: DEFAULT_MODEL,
      chatMode: "music",
      customSystem,
    }),
  });

  if (!resp.ok || !resp.body) {
    const details = await resp.text().catch(() => "");
    throw new Error(details || "Could not write lyrics");
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lyrics = "";

  const handleLine = (line: string) => {
    if (!line.startsWith("data: ")) return;
    const payload = line.slice(6).trim();
    if (!payload || payload === "[DONE]") return;
    try {
      const parsed = JSON.parse(payload);
      const delta = parsed.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta) {
        lyrics += delta;
        onDraft(musicDraftIntro(lyrics, isArabic));
      }
    } catch {
      // Ignore non-chat frames/status packets.
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const raw = buffer.slice(0, idx).replace(/\r$/, "");
      buffer = buffer.slice(idx + 1);
      handleLine(raw);
    }
  }
  if (buffer.trim()) handleLine(buffer.trim());

  const finalLyrics = sanitizeLyrics(lyrics, prompt, isArabic);
  if (!finalLyrics) throw new Error("Could not write lyrics");
  return finalLyrics;
}

export interface RunMediaTurnArgs {
  text: string;
  /** آخر صورة مولّدة في نفس المحادثة — تُستخدم تلقائيًا عند طلب تعديل. */
  lastImageUrl?: string | null;
  /** برومبت آخر صورة مولّدة، لدعم التعديل مع الحفاظ على السياق. */
  lastImagePrompt?: string | null;
  userMsg: Message;
  localTurnId: string;
  chatMode: ChatMode;
  mediaModel: any;
  videoStartEndMode: boolean;
  startFrameUrl: string | null;
  endFrameUrl: string | null;
  videoDurationSec: number;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setInput: (v: string) => void;
  setAttachedFiles: (v: any[]) => void;
  setPendingQuestions: (v: any[]) => void;
  setIsLoading: (v: boolean) => void;
  setIsThinking: (v: boolean) => void;
  createOrUpdateConversation: (title: string) => Promise<string | null>;
  saveMessage: (
    cid: string,
    role: string,
    content: string,
    modelId?: any,
    meta?: any,
  ) => Promise<string | undefined>;
  ownInsertedIdsRef: React.MutableRefObject<Set<string>>;
}

/**
 * Returns `true` if it handled the turn (caller should `return`),
 * or `false` if validation prevented work (caller still returns but
 * already cleared `isSubmittingRef`).
 */
export async function runMediaTurn(args: RunMediaTurnArgs): Promise<void> {
  const {
    text,
    lastImageUrl,
    lastImagePrompt,
    userMsg,
    localTurnId,
    chatMode,
    mediaModel,
    videoStartEndMode,
    startFrameUrl,
    endFrameUrl,
    videoDurationSec,
    setMessages,
    setInput,
    setAttachedFiles,
    setPendingQuestions,
    setIsLoading,
    setIsThinking,
    createOrUpdateConversation,
    saveMessage,
    ownInsertedIdsRef,
  } = args;

  const isStartEnd = chatMode === "video" && videoStartEndMode;
  const assistantClientId = `assistant-${localTurnId}`;
  const modeLocal = chatMode;
  const modelLocal = mediaModel;

  const isArabic = /[\u0600-\u06FF]/.test(text || "");
  let introContent = "";

  setMessages((prev) => [
    ...prev,
    userMsg,
    {
      role: "assistant",
      content: introContent,
      clientId: assistantClientId,
      mode: modeLocal,
    },
  ]);
  setInput("");
  setAttachedFiles([]);
  setPendingQuestions([]);
  setIsLoading(true);
  setIsThinking(true);

  try {
    const cid = await createOrUpdateConversation(text || "Media");
    if (cid) {
      const userMessageId = await saveMessage(cid, "user", userMsg.content, undefined, {
        mode: modeLocal,
      });
      if (userMessageId) ownInsertedIdsRef.current.add(userMessageId);
    }

    // Dynamic, model-written reply shown BEFORE generation starts. Streamed
    // into the same assistant bubble; on failure we simply start with none.
    try {
      const { generateTurnPreamble } = await import("./turnPreamble");
      await generateTurnPreamble({
        kind: modeLocal === "video" ? "video" : "images",
        userText: text || "",
        chatUserId: undefined,
        conversationId: cid,
        onDelta: (delta) => {
          introContent += delta;
          setMessages((prev) => {
            const idx = prev.findIndex((m) => (m as any).clientId === assistantClientId);
            if (idx < 0) return prev;
            const next = prev.slice();
            next[idx] = { ...next[idx], content: introContent };
            return next;
          });
        },
      });
    } catch {
      /* no preamble — start generating right away */
    }
    let plan: MediaPlan;
    const settings = loadMediaSettings(modeLocal === "video" ? "video" : "images");
    const aspectRatio = settings.aspectRatio;
    if (isStartEnd) {
      plan = {
        mode: "video",
        modelSlug: modelLocal.slug,
        modelName: modelLocal.name,
        summary: text || "First → last frame interpolation",
        aspectRatio,
        scenes: [
          {
            index: 1,
            title: "First → Last frame",
            prompt: text || "Smooth motion interpolation between the two frames.",
            duration_seconds: videoDurationSec,
            first_frame_url: startFrameUrl!,
            last_frame_url: endFrameUrl!,
          },
        ],
      };
    } else {
      // وضع Images: يمر كل طلب على "الروبوت الداخلي" الذي يحسّن البرومبت،
      // ويستحضر هوية أي شخصية محفوظة، ويكتشف نية التعديل على آخر صورة
      // مولّدة فيرفقها داخليًا بدون أن يعيد المستخدم إرفاق Imagesة.
      let scenePrompt = text;
      let referenceImage: string | undefined;
      let extraReferenceImages: string[] = [];
      let identityDescriptor: string | undefined;
      let isImageEdit = false;
      // صور أرفقها المستخدم بنفسه: تُرفع إلى التخزين وتُستخدم كمرجع للتعديل
      // مباشرة — لا ننتظر "نية تعديل" لأن الإرفاق نفسه هو النية.
      if (modeLocal === "images") {
        const attached = (userMsg as any).attachedImages as string[] | undefined;
        if (Array.isArray(attached) && attached.length > 0) {
          const uploaded = await uploadAttachedImages(attached);
          if (uploaded.length > 0) {
            referenceImage = uploaded[0];
            extraReferenceImages = uploaded.slice(1);
          }
        }
      }
      if (modeLocal === "images" && text?.trim()) {
        try {
          const [{ enhanceImagePrompt, composeImagePrompt, detectImageEditIntent }, { findMentionedCharacter }] =
            await Promise.all([
              import("@/lib/media/imageBrain"),
              import("@/lib/media/characterMemory"),
            ]);
          const character = findMentionedCharacter(text);
          identityDescriptor = character?.descriptor;
          const isEdit =
            !!referenceImage || (detectImageEditIntent(text) && !!lastImageUrl);
          isImageEdit = isEdit;
          if (!referenceImage && isEdit) referenceImage = lastImageUrl || undefined;
          if (!referenceImage && character?.refUrl) referenceImage = character.refUrl;
          const enhanced = await enhanceImagePrompt({
            text,
            identity: identityDescriptor,
            editOf: isEdit ? lastImagePrompt || "the attached reference image" : undefined,
          });
          scenePrompt = composeImagePrompt({
            enhanced,
            identity: identityDescriptor,
            editInstruction: isEdit ? text : undefined,
          });
        } catch {
          scenePrompt = text;
        }
      }
      if (modeLocal === "images" && !scenePrompt?.trim() && referenceImage) {
        scenePrompt = "Edit this image as requested";
      }
      if (modeLocal === "images" && isImageEdit && referenceImage) {
        scenePrompt = preservingImageEditPrompt(scenePrompt, text);
      }
      // Image turns intentionally produce one output. This prevents stale
      // multi-image preferences from launching several paid requests at once;
      // the user can ask for another variation explicitly.
      const count = modeLocal === "images" ? 1 : (settings.count ?? 1);
      let planned = false;

      // وضع الفيديو: خطة مسبقة تفهم الشخصية/المنتج والمشاهد والسيناريو الممتد،
      // مع نمط UGC اختياري وMore aspect ratios لنفس الفيديو.
      if (modeLocal === "video" && text?.trim()) {
        try {
          const [{ planVideoStory }, { loadVideoTools, UGC_STYLE_PROMPT }] = await Promise.all([
            import("@/lib/media/videoPlanner"),
            import("@/lib/media/videoTools"),
          ]);
          const tools = loadVideoTools();
          const perShot = settings.duration ?? videoDurationSec;
          const story = await planVideoStory({
            text,
            sceneCount: count,
            durationSec: perShot,
            ugc: tools.ugc,
          });
          if (story) {
            const aspects = [aspectRatio, ...tools.extraAspects.filter((a) => a !== aspectRatio)];
            const storyScenes: any[] = [];
            let idx = 0;
            for (const aspect of aspects) {
              for (const sc of story.scenes) {
                idx += 1;
                storyScenes.push({
                  index: idx,
                  title: aspects.length > 1 ? `${sc.title} · ${aspect}` : sc.title,
                  prompt: [
                    story.identity ? `Consistent subject (must look identical in every shot): ${story.identity}` : "",
                    sc.prompt,
                    tools.ugc ? UGC_STYLE_PROMPT : "",
                  ]
                    .filter(Boolean)
                    .join(" "),
                  duration_seconds: sc.duration_seconds || perShot,
                  aspect_ratio: aspect,
                  identity: story.identity,
                });
              }
            }
            setIsThinking(false);
            plan = {
              mode: "video",
              modelSlug: modelLocal.slug,
              modelName: modelLocal.name,
              summary: story.storyline || text,
              originalPrompt: text,
              storyline: story.storyline,
              identity: story.identity,
              ugc: tools.ugc,
              aspectRatio,
              aspectRatios: aspects,
              scenes: storyScenes,
              estimatedTotalSeconds: storyScenes.reduce(
                (acc, s) => acc + (s.duration_seconds || perShot),
                0,
              ),
            };
            planned = true;
          }
        } catch {
          // فشل التخطيط: نكمل بالمسار المباشر.
        }
      }

      if (planned) {
        // الخطة المعتمدة جاهزة، لا نعيد بناءها.
      } else {
      // Direct generation — no LLM planner.
      const scenes = Array.from({ length: count }, (_, i) => ({
        index: i + 1,
        title:
          count > 1
            ? modeLocal === "video"
              ? `Clip ${i + 1}`
              : `Image ${i + 1}`
            : "Your prompt",
        prompt: scenePrompt,
        ...(referenceImage
          ? {
              reference_image_url: referenceImage,
              image_url: referenceImage,
              reference_image_urls: [referenceImage, ...extraReferenceImages],
            }
          : {}),
        ...(identityDescriptor ? { identity: identityDescriptor } : {}),
        ...(modeLocal === "video"
          ? { duration_seconds: settings.duration ?? videoDurationSec }
          : {}),
      }));
      plan = {
        mode: modeLocal,
        modelSlug: modelLocal.slug,
        modelName: modelLocal.name,
        summary: text,
        originalPrompt: text,
        aspectRatio,
        scenes,
        ...(modeLocal === "video"
          ? {
              estimatedTotalSeconds:
                (settings.duration ?? videoDurationSec) * count,
            }
          : {}),
      };
      }
    }


    plan.generationKey = localTurnId;
    const initialResults = plan.scenes.map((s: any) => ({
      index: s.index,
      title: s.title,
      status: "pending" as const,
      type:
        modeLocal === "video" ? ("video" as const) : ("image" as const),
    }));
    // Persist the assistant media message so it survives reloads.
    let assistantId: string | undefined;
    if (cid) {
      assistantId = await saveMessage(cid, "assistant", introContent, undefined, {
        kind: "mediaPlan",
        mediaPlan: plan,
        mediaStatus: "awaiting",
        mediaResults: initialResults,
        mode: modeLocal,
      });
      if (assistantId) ownInsertedIdsRef.current.add(assistantId);
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.clientId === assistantClientId
          ? {
              ...m,
              id: assistantId ?? m.id,
              content: introContent,
              mediaPlan: plan,
              mediaStatus: "awaiting",
              mediaResults: initialResults,
            }
          : m,
      ),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Planning failed";
    setMessages((prev) =>
      prev.map((m) => (m.clientId === assistantClientId ? { ...m, content: `Error: ${msg}` } : m)),
    );
    toast.error(msg);
    setIsLoading(false);
    setIsThinking(false);
  }
}
