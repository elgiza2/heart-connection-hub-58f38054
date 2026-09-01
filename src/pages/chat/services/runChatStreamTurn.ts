import type React from "react";
import type { NavigateFunction } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getCachedUser } from "@/lib/cachedUser";
import { streamChat, GUEST_QUOTA_ERROR } from "@/lib/streamChat";
import { shouldUseWebSearch } from "@/lib/shouldUseWebSearch";
import type { WebSource } from "@/lib/search/webSearchClient";

import {
  makeLeakedToolStreamSanitizer,
  sanitizeLeakedToolText,
  normalizeStatusLabel,
} from "../chatUtils";
import type { Message, ProductResult, ChatMode, ToolPart } from "../chatConstants";
import { updateMessageMetadata } from "./conversationApi";
import { DEFAULT_MODEL } from "@/lib/defaultModel";

/** Extracts the generated_sites UUID from a `build_website` preview URL embedded
 *  in assistant text. Returns undefined when no match. */
function detectSiteBuildId(text: string): string | undefined {
  if (!text) return undefined;
  const m = text.match(/\/published-sites\/[0-9a-f-]{36}\/([0-9a-f-]{36})\/index\.html/i);
  return m?.[1];
}

function readLearnAnswerField(text: string, key: string): string | undefined {
  const quoted = text.match(new RegExp(`${key}="([^"]*)"`));
  if (quoted) return quoted[1];
  const bare = text.match(new RegExp(`${key}=([^\\s]+)`));
  return bare?.[1]?.replace(/^\[|\]$/g, "");
}

function normalizeLearningAnswerForModel(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("[LEARN_CHOICE]")) {
    const type = readLearnAnswerField(trimmed, "type") || "setup_choice";
    const question = readLearnAnswerField(trimmed, "question") || "";
    const chosen = readLearnAnswerField(trimmed, "chosen") || "";
    const topic = readLearnAnswerField(trimmed, "topic") || "";

    return [
      "INTERNAL LEARNING UI EVENT — do not quote or reveal this marker.",
      "The learner just chose an ungraded setup/preference option, not an answer to be marked right or wrong.",
      `Choice type: ${type}.`,
      question ? `Setup question: ${question}.` : "",
      chosen ? `Learner selected: ${chosen}.` : "",
      topic ? `Current topic: ${topic}.` : "",
      "Reply directly in the learner's language. Accept the choice, do not grade it, do not say correct/wrong, do not repeat the same setup question. Immediately execute the selected lesson/exam configuration and start the requested learning activity.",
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (!trimmed.startsWith("[LEARN_ANSWER]")) return text;

  const type = readLearnAnswerField(trimmed, "type") || "answer";
  const result = readLearnAnswerField(trimmed, "result") || readLearnAnswerField(trimmed, "self_rating") || "submitted";
  const chosen =
    readLearnAnswerField(trimmed, "chosen") ||
    readLearnAnswerField(trimmed, "entered") ||
    readLearnAnswerField(trimmed, "summary") ||
    readLearnAnswerField(trimmed, "self_rating") ||
    "";
  const correct = readLearnAnswerField(trimmed, "correct") || readLearnAnswerField(trimmed, "back") || "";
  const isWrong = /incorrect|wrong|didnt/i.test(result);

  return [
    "INTERNAL LEARNING UI EVENT — do not quote or reveal this marker.",
    "The learner just answered the immediately previous interactive learning card.",
    `Card type: ${type}.`,
    `Result: ${result}.`,
    chosen ? `Learner chose/submitted: ${chosen}.` : "",
    correct ? `Correct answer / expected target: ${correct}.` : "",
    isWrong
      ? "Reply directly in the learner's language: first say the choice is not correct, explain the exact misconception, justify the correct answer, then continue with an easier follow-up card for the same concept. Never proceed as if the wrong choice was selected."
      : "Reply directly in the learner's language: give brief positive feedback, explain the reason, then continue with the next smart learning step or card.",
  ]
    .filter(Boolean)
    .join("\n");
}

type SaveMessageFn = (
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  images?: string[],
  metadata?: Record<string, unknown>,
) => Promise<string | undefined>;

type Skill = {
  id?: string;
  name: string;
  description?: string;
  triggers?: string[];
  source?: string;
  instructions?: string;
  body?: string;
  enabled_tools?: string[];
  preferred_model?: string | null;
};

type ToolActivity = {
  name: string;
  appSlug?: string;
  target?: string;
  status: "running" | "done" | "error";
};

type ParallelTask = {
  id: string;
  name: string;
  appSlug?: string;
  target?: string;
  status: "running" | "done" | "error";
};

export interface RunChatStreamTurnOptions {
  // Input context
  messages: Message[];
  userMsg: Message;
  currentFiles: Array<{ type: string; name: string; data: string }>;
  userInput: string;
  localTurnId: string;
  assistantMessageIndex: number;
  conversationId: string | null;
  conversationPromise: Promise<string | null>;
  chatMode: ChatMode;
  searchEnabled: boolean;
  megsyTier: string;
  chatUserId: string | null;
  userName?: string | null;
  computerUseEnabled: boolean;
  selectedAgent: { id?: string } | null | undefined;
  selectedModel: { id: string; label?: string; cost?: number } | null | undefined;
  enabledSkills: Skill[];
  librarySkills: Skill[];
  researchDepth: string;

  // Setters
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setIsLoading: (v: boolean) => void;
  setIsThinking: (v: boolean) => void;
  setSearchStatus: (v: string) => void;
  setActiveResearchJobId: (v: string | null) => void;
  setNarrations: React.Dispatch<React.SetStateAction<string[]>>;
  setClarifyQs: (v: any) => void;
  setToolActivity: React.Dispatch<React.SetStateAction<ToolActivity | null>>;
  setParallelTasks: React.Dispatch<React.SetStateAction<ParallelTask[]>>;

  // Refs
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  presenceChannelRef: React.MutableRefObject<any>;
  ownInsertedIdsRef: React.MutableRefObject<Set<string>>;
  isSubmittingRef: React.MutableRefObject<boolean>;

  // Helpers
  resetToolUi: () => void;
  pushNarration: (text: string) => void;
  saveMessage: SaveMessageFn;
}

export async function runChatStreamTurn(opts: RunChatStreamTurnOptions): Promise<void> {
  const {
    messages,
    userMsg,
    currentFiles,
    userInput,
    localTurnId,
    assistantMessageIndex,
    conversationId,
    conversationPromise,
    chatMode,
    searchEnabled,
    megsyTier,
    chatUserId,
    userName,
    computerUseEnabled,
    selectedAgent,
    selectedModel,
    enabledSkills,
    librarySkills,
    researchDepth,
    setMessages,
    setIsLoading,
    setIsThinking,
    setSearchStatus,
    setActiveResearchJobId,
    setNarrations,
    setClarifyQs,
    setToolActivity,
    setParallelTasks,
    abortControllerRef,
    presenceChannelRef,
    ownInsertedIdsRef,
    isSubmittingRef,
    resetToolUi,
    pushNarration,
    saveMessage,
  } = opts;

  // Broadcast that AI is now busy in this conversation
  if (presenceChannelRef.current && chatUserId) {
    presenceChannelRef.current.send({
      type: "broadcast",
      event: "ai_busy",
      payload: { user_id: chatUserId, name: userName, busy: true },
    });
  }

  let assistantContent = "";
  let deepResearchPlaceholderId: string | null = null;
  let deepResearchPlaceholderPromise: Promise<string | null> | null = null;
  let assistantRenderTimer: ReturnType<typeof setTimeout> | null = null;
  let hasStartedResponse = false;
  let hadStreamError = false;
  const controller = new AbortController();
  abortControllerRef.current = controller;
  let searchImages: string[] = [];
  let generatedVideos: string[] = [];
  let generatedAudios: string[] = [];
  const videoPollPromises: Promise<void>[] = [];
  let videoGenerationActive = false;
  let streamedProducts: ProductResult[] = [];
  let assistantReasoning = "";
  let assistantToolParts: ToolPart[] = [];
  let researchSources: WebSource[] = [];
  const researchTrace: string[] = [];
  const streamStartedAt = Date.now();
  let firstTokenAt: number | null = null;
  const sanitizeStreamChunk = makeLeakedToolStreamSanitizer();
  // Every narration line of this turn, kept so the thinking trace survives
  // leaving and re-entering the conversation.
  const turnNarrations: string[] = [];
  const narrate = (text: string) => {
    const value = String(text || "").trim();
    if (value && turnNarrations[turnNarrations.length - 1] !== value) {
      turnNarrations.push(value);
    }
    pushNarration(text);
  };

  const upsertAssistantToolPart = (part: ToolPart) => {
    const existing = assistantToolParts.findIndex((p) => p.id === part.id);
    if (existing >= 0) {
      assistantToolParts = assistantToolParts.map((p, i) =>
        i === existing ? { ...p, ...part } : p,
      );
      return;
    }
    assistantToolParts = [...assistantToolParts, part];
  };

  const updateAssistantMessage = (update: (message: Message) => Message) => {
    setMessages((prev) => {
      const index = prev.findIndex((message) => message.clientId === `assistant-${localTurnId}`);
      if (index < 0 || prev[index]?.role !== "assistant") return prev;
      const next = prev.slice();
      next[index] = update(prev[index]);
      return next;
    });
  };

  const settleRunningTools = (state: "done" | "error") => {
    assistantToolParts = assistantToolParts.map((part) =>
      part.state === "running" ? { ...part, state } : part,
    );
    updateAssistantMessage((message) => ({
      ...message,
      toolParts: message.toolParts?.map((part) =>
        part.state === "running" ? { ...part, state } : part,
      ),
    }));
  };

  let capturedUsage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null = null;
  let capturedModel: string | null = null;

  const buildAssistantMetadata = (extra?: Record<string, unknown>) => {
    const metadata: Record<string, unknown> = {
      ...(isDeepResearch ? { kind: "deepResearch", mode: "deep-research" } : {}),
      ...(extra || {}),
    };
    if (assistantToolParts.length > 0) metadata.toolParts = assistantToolParts;
    if (assistantReasoning.trim()) metadata.reasoning = assistantReasoning;
    if (turnNarrations.length > 0) metadata.narrations = turnNarrations.slice(-60);
    if (isDeepResearch && researchSources.length > 0) {
      metadata.researchSources = researchSources.slice(0, 40).map((source) => ({
        title: source.title,
        url: source.url,
        snippet: source.snippet,
      }));
    }
    if (isDeepResearch && researchTrace.length > 0) metadata.researchTrace = researchTrace.slice(-40);
    if (generatedVideos.length > 0) metadata.videos = generatedVideos;
    if (generatedAudios.length > 0) metadata.audios = generatedAudios;
    if (selectedModel?.label) metadata.modelLabel = selectedModel.label;
    if (capturedModel) metadata.modelActual = capturedModel;
    if (capturedUsage) metadata.usage = capturedUsage;
    const finishedAt = Date.now();
    const timing: Record<string, number> = {
      startedAt: streamStartedAt,
      finishedAt,
      durationMs: finishedAt - streamStartedAt,
    };
    if (firstTokenAt) {
      timing.firstTokenAt = firstTokenAt;
      timing.ttftMs = firstTokenAt - streamStartedAt;
    }
    metadata.timing = timing;
    return Object.keys(metadata).length > 0 ? metadata : undefined;
  };

  const isToolMarkerChunk = (chunk: string) => {
    const trimmed = chunk.trim();
    return [
      "BROWSE_WEBSITE",
      "WEB_SEARCH",
      "SHOPPING_SEARCH",
      "CONVERT_CURRENCY",
      "GENERATE_IMAGE",
      "GENERATE_VIDEO",
      "GENERATE_VOICE",
      "CANVA_CREATE_SLIDES",
    ].includes(trimmed);
  };

  /** Human readable one-liner for a tool call, used in the thinking badge. */
  const prettyToolLabel = (name?: unknown, target?: unknown) => {
    const n = String(name || "tool").replace(/[_\-.]+/g, " ").trim();
    const t = String(target || "").trim();
    return t ? `${n} · ${t}` : n;
  };


  // ---------------------------------------------------------------------
  // Smooth reveal. Some backend paths (tool / MCP turns) flush the whole
  // answer in a single SSE chunk, which used to make the reply pop in at
  // once after a long "Thinking…". We keep the full received text as the
  // source of truth and reveal it progressively so the UI always types.
  // ---------------------------------------------------------------------
  let revealedLen = 0;
  let revealTimer: ReturnType<typeof setInterval> | null = null;

  const stopReveal = () => {
    if (revealTimer) {
      clearInterval(revealTimer);
      revealTimer = null;
    }
  };

  const displayedContent = () =>
    revealedLen >= assistantContent.length ? assistantContent : assistantContent.slice(0, revealedLen);

  const flushAssistantUpdate = () => {
    assistantRenderTimer = null;
    const nextContent = displayedContent();
    setMessages((prev) => {
      const assistantIndex = prev.findIndex((m) => m.clientId === `assistant-${localTurnId}`);
      const targetIndex = assistantIndex >= 0 ? assistantIndex : prev.length - 1;
      const last = prev[targetIndex];
      if (last?.role === "assistant") {
        if (
          last.content === nextContent &&
          (last.products || streamedProducts) === (last.products ? last.products : streamedProducts)
        )
          return prev;
        const next = prev.slice();
        next[targetIndex] = {
          ...last,
          content: nextContent,
          products: last.products ?? streamedProducts,
          ...(isDeepResearch ? { mode: "deep-research" as const } : {}),
        };
        return next;
      }
      return [
        ...prev,
        {
          role: "assistant",
          content: nextContent,
          products: streamedProducts,
          clientId: `assistant-${localTurnId}`,
          ...(isDeepResearch ? { mode: "deep-research" as const } : {}),
        },
      ];
    });
  };

  const scheduleAssistantUpdate = (immediate = false) => {
    if (immediate) {
      if (assistantRenderTimer) clearTimeout(assistantRenderTimer);
      flushAssistantUpdate();
      return;
    }
    if (assistantRenderTimer) return;
    assistantRenderTimer = setTimeout(flushAssistantUpdate, 33);
  };

  const startReveal = () => {
    if (revealTimer) return;
    revealTimer = setInterval(() => {
      const remaining = assistantContent.length - revealedLen;
      if (remaining <= 0) {
        stopReveal();
        return;
      }
      // Catch up fast on big backlogs, type gently on live token streams.
      const step = Math.max(4, Math.ceil(remaining / 8));
      revealedLen = Math.min(assistantContent.length, revealedLen + step);
      scheduleAssistantUpdate(true);
    }, 28);
  };

  const updateAssistant = (chunk: string) => {
    if (isToolMarkerChunk(chunk)) return;
    const safeChunk = sanitizeStreamChunk(chunk);
    if (!safeChunk.trim()) return;
    if (videoGenerationActive) {
      if (generatedVideos.length > 0) {
        assistantContent = "Here is your video 👇";
        revealedLen = assistantContent.length;
        scheduleAssistantUpdate(true);
      }
      return;
    }
    if (!hasStartedResponse) {
      hasStartedResponse = true;
    }
    if (!firstTokenAt) firstTokenAt = Date.now();
    const wasEmpty = assistantContent.length === 0;
    assistantContent += safeChunk;
    if (wasEmpty) {
      // Show something instantly, then let the reveal loop take over.
      revealedLen = Math.min(assistantContent.length, 12);
      scheduleAssistantUpdate(true);
    }
    startReveal();
  };

  const allMessages = [...messages, userMsg].map((m) => {
    const imgs = m.attachedImages || [];
    const vids = (m as any).attachedVideos || [];
    if (imgs.length > 0 || vids.length > 0) {
      // IMPORTANT: text FIRST so the model sees the question, then media parts.
      const content: any[] = [];
      if (m.content && m.content.trim()) {
        content.push({ type: "text" as const, text: m.content });
      }
      imgs.forEach((imgData: string) => {
        content.push({ type: "image_url" as const, image_url: { url: imgData } });
      });
      vids.forEach((vidUrl: string) => {
        // Qwen-VL video part
        content.push({ type: "video_url" as const, video_url: { url: vidUrl } });
      });
      if (content.length === 0) {
        content.push({ type: "text" as const, text: "Please analyze this media." });
      }
      return { role: m.role, content };
    }
    return {
      role: m.role,
      content:
        m.role === "assistant"
          ? sanitizeLeakedToolText(m.content)
          : chatMode === "learning"
            ? normalizeLearningAnswerForModel(m.content)
            : m.content,
    };
  });

  // Inject any parsed file/document/link text into
  // the last user message so the model can actually READ it. Skip files that
  // are still parsing (placeholder ids) so we never feed the model garbage.
  const readyFiles = currentFiles.filter(
    (f) =>
      (f.type === "file" || f.type === "link") &&
      f.data &&
      !f.data.startsWith("__parsing_") &&
      !f.data.startsWith("__uploading_"),
  );
  if (readyFiles.length > 0) {
    const fileTexts = readyFiles
      .map((f) => `===== ${f.type === "link" ? "Link" : "File"}: ${f.name} =====\n${f.data}`)
      .join("\n\n");
    const header =
      readyFiles.length === 1
        ? `The user attached this source. Read it in full and answer using its actual contents — do NOT say you cannot read attachments.`
        : `The user attached ${readyFiles.length} sources. Read every one of them in full and answer using their actual contents — do NOT say you cannot read attachments.`;
    const lastMsg = allMessages[allMessages.length - 1];
    const merged = `${header}\n\n${fileTexts}`;
    if (typeof lastMsg.content === "string") {
      lastMsg.content = lastMsg.content
        ? `${lastMsg.content}\n\n${merged}`
        : merged;
    } else if (Array.isArray(lastMsg.content)) {
      // Multimodal message (has images/videos): append the file text as a
      // trailing text part so vision + docs work together.
      lastMsg.content.push({ type: "text" as const, text: merged });
    }
  }

  const lastUserText = (userMsg?.content || "").toString();
  // Deep Research mode always uses the agent; in normal chat the main agent
  // delegates to it as a tool whenever the request is a real research task.
  // Normal chat stays on the fast chat path. Deep Research is entered only
  // when the user explicitly selects that service; this also keeps its large
  // agent module out of the first-send bundle.
  const isDeepResearch = chatMode === "deep-research";

  // Short conversation context so follow-up research questions resolve.
  const researchContext = messages
    .slice(-4)
    .map((m) => `${m.role}: ${(m.content || "").toString().slice(0, 500)}`)
    .join("\n");

  const researchPipeline = isDeepResearch
    ? async ({
        onDelta,
        onStatus,
        signal,
      }: {
        onDelta: (chunk: string) => void;
        onStatus: (status: string) => void;
        signal?: AbortSignal;
      }) => {
        const { runDeepResearchTool } = await import("@/lib/research/deepResearchTool");
        await runDeepResearchTool({
          query: lastUserText,
          context: researchContext,
          depth: researchDepth,
          onStatus,
          onDelta,
          onReasoning: (delta) => {
            if (!delta) return;
            assistantReasoning += delta;
            setMessages((prev) => {
              const idx = prev.findIndex((m) => m.clientId === `assistant-${localTurnId}`);
              if (idx < 0 || prev[idx]?.role !== "assistant") return prev;
              const next = prev.slice();
              next[idx] = { ...next[idx], reasoning: assistantReasoning };
              return next;
            });
          },
          onSources: (sources) => {
            const seen = new Set<string>();
            researchSources = [...researchSources, ...sources]
              .filter((source) => {
                if (!source?.url || seen.has(source.url)) return false;
                seen.add(source.url);
                return true;
              })
              .slice(0, 80);
          },
          signal,
        });
      }
    : undefined;


  // Deep Research fetches its own live sources above. Leaving the backend's
  // own web tool on makes the stream hang with zero tokens (verified), so it
  // stays off for research turns.
  const smartSearch = isDeepResearch ? false : shouldUseWebSearch(lastUserText, searchEnabled);

  // Learning Mode is our highest-stakes UX — always route to a strong
  // reasoning model so tap-answer replies stay smart and on-topic.
  // (chat-alibaba is Qwen-only; qwen-max is the strongest available.)
  const LEARNING_SMART_MODEL = DEFAULT_MODEL;
  // Normal chat, learning, deep research and coding all run on the same brain.
  const FORCED_MODEL_MODES = new Set(["learning", "deep-research", "code"]);
  const activeModel =
    isDeepResearch || FORCED_MODEL_MODES.has(String(chatMode))
      ? LEARNING_SMART_MODEL
      : selectedModel?.id || DEFAULT_MODEL;

  let backgroundCid: string | null = conversationId;
  if (isDeepResearch && !backgroundCid) {
    backgroundCid = await conversationPromise;
  }

  // Deep Research: stream a short, model-written reply that explains what is
  // about to be researched BEFORE the report generation starts.
  if (isDeepResearch) {
    try {
      const { generateTurnPreamble } = await import("./turnPreamble");
      const pre = await generateTurnPreamble({
        kind: "deep-research",
        userText: lastUserText || "",
        chatUserId,
        conversationId: backgroundCid || conversationId || undefined,
        onDelta: updateAssistant,
      });
      if (pre) updateAssistant("\n\n");
    } catch {
      /* no preamble — start researching right away */
    }
  }

  await streamChat({
    localPipeline: researchPipeline,
    messages: allMessages,

    model: activeModel,
    tier: megsyTier as "lite" | "pro" | "max",
    searchEnabled: smartSearch,
    searchExplicit: searchEnabled,
    deepResearch: isDeepResearch,
    background: false,
    // Deep Research is handled by our own internal agent now — no external
    // research job, no pending placeholder bubbles.
    onJobStart: undefined,

    // Sending chatMode="deep-research" makes the backend spin up its legacy
    // server-side research agent, which never emits a token (verified: 180s of
    // silence). Our own research pipeline already fetched the sources, so the
    // turn is streamed as a normal chat turn.
    chatMode: isDeepResearch ? "normal" : chatMode,
    user_id: chatUserId || undefined,
    conversation_id: backgroundCid || conversationId || undefined,
    // Computer-use tooling stalls the Deep Research stream on the backend.
    computerUseEnabled: isDeepResearch ? false : computerUseEnabled,

    // Deep Research must NOT activate the legacy server-side research agent —
    // it stalls with no output. Our own research prompt drives the turn instead.
    activeAgent: isDeepResearch
      ? undefined
      : chatMode !== "normal"
        ? chatMode
        : selectedAgent?.id || undefined,

    selectedModel: selectedModel ? { id: selectedModel.id, cost: selectedModel.cost } : undefined,
    activeSkill: undefined,
    availableSkills: isDeepResearch ? [] : [
      ...enabledSkills,
      ...librarySkills.filter((l) => !enabledSkills.some((e) => e.name === l.name)),
    ]
      .slice(0, 16)
      .map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        triggers: s.triggers || [],
        source: s.source,
        // The backend needs the actual playbook + allowed tools, otherwise a
        // matched skill can be named but never executed.
        instructions: (s.instructions || s.body || "").slice(0, 4000),
        enabled_tools: s.enabled_tools || [],
        preferred_model: s.preferred_model || null,
      })),
    onDelta: updateAssistant,
    onReasoning: (delta: string) => {
      if (!delta) return;
      assistantReasoning += delta;
      updateAssistantMessage((message) => ({
        ...message,
        reasoning: (message.reasoning || "") + delta,
      }));
    },
    onUsage: (u) => {
      if (!u) return;
      capturedUsage = {
        prompt_tokens: Number(u.prompt_tokens || 0) || undefined,
        completion_tokens: Number(u.completion_tokens || 0) || undefined,
        total_tokens: Number(u.total_tokens || 0) || undefined,
      };
    },
    onModel: (m) => {
      if (m && typeof m === "string") capturedModel = m;
    },
    onImages: (imgs) => {
      searchImages = imgs;
    },
    onProducts: (products) => {
      streamedProducts = products;
      setMessages((prev) => {
        const assistantIndex = prev.findIndex((m) => m.clientId === `assistant-${localTurnId}`);
        const targetIndex = assistantIndex >= 0 ? assistantIndex : prev.length - 1;
        const last = prev[targetIndex];
        if (last?.role !== "assistant") return prev;
        const next = prev.slice();
        next[targetIndex] = { ...last, products };
        return next;
      });
    },
    onStatus: (status) => {
      const normalizedStatus = normalizeStatusLabel(status);
      if (normalizedStatus) {
        if (isDeepResearch && researchTrace[researchTrace.length - 1] !== normalizedStatus) {
          researchTrace.push(normalizedStatus);
        }
        setSearchStatus(normalizedStatus);
        // Every status also lands in the live activity log so the thinking
        // badge can be expanded to see what actually happened this turn.
        narrate(normalizedStatus);
        setIsThinking(true);
      }
    },
    onBrowser: () => {
      // Browser state no longer tracked in UI
    },
    onEvent: (payload: any) => {
      const ev = payload?.event;
      if (ev === "resume_id") {
        const rid = String(payload?.resumeId || "");
        if (!rid) return;
        updateAssistantMessage((message) => ({ ...message, resumeId: rid }));
        return;
      }
      if (ev === "narration") {
        narrate(String(payload.text || ""));
      } else if (ev === "narration_start") {
        setNarrations((prev) => [...prev, ""]);
      } else if (ev === "narration_chunk") {
        const delta = String(payload.delta || "");
        if (!delta) return;
        setNarrations((prev) => {
          if (prev.length === 0) return [delta];
          const next = prev.slice();
          next[next.length - 1] = (next[next.length - 1] || "") + delta;
          return next;
        });
      } else if (ev === "narration_end") {
        setNarrations((prev) => {
          if (prev.length === 0) return prev;
          const last = (prev[prev.length - 1] || "").trim();
          if (last) return prev;
          return prev.slice(0, -1);
        });
      } else if (ev === "clarify_questions") {
        if (Array.isArray(payload.questions)) setClarifyQs(payload.questions);
      } else if (ev === "tool_event") {
        const t = payload?.type;
        if (t === "tool_call") {
          if (String(payload.name || "") === "generate_video") {
            videoGenerationActive = true;
          }
          const taskId = String(
            payload.call_id || `${payload.name || "tool"}-${Date.now()}-${Math.random()}`,
          );
          narrate(`→ ${prettyToolLabel(payload.name, payload.target)}`);
          setSearchStatus(prettyToolLabel(payload.name, payload.target));
          setToolActivity({
            name: String(payload.name || ""),
            appSlug: payload.app_slug,
            target: payload.target,
            status: "running",
          });
          // Persist tool activity on the assistant message so it survives
          // stream end and re-renders. assistant-ui Tool primitives can
          // later read the same data via the external-store adapter.
          setMessages((prev) => {
            const idx = prev.findIndex((message) => message.clientId === `assistant-${localTurnId}`);
            if (idx < 0 || prev[idx]?.role !== "assistant") return prev;
            const msg = prev[idx];
            const nextParts = [...(msg.toolParts || [])];
            const existing = nextParts.findIndex((p) => p.id === taskId);
            const part = {
              id: taskId,
              name: String(payload.name || ""),
              appSlug: payload.app_slug,
              target: payload.target,
              args: payload.args ?? payload.arguments,
              state: "running" as const,
            };
          upsertAssistantToolPart(part);
            if (existing >= 0) nextParts[existing] = { ...nextParts[existing], ...part };
            else nextParts.push(part);
            const next = prev.slice();
            next[idx] = { ...msg, toolParts: nextParts };
            return next;
          });
          setParallelTasks((prev) => {
            const nextTask = {
              id: taskId,
              name: String(payload.name || ""),
              appSlug: payload.app_slug,
              target: payload.target,
              status: "running" as const,
            };
            const existing = prev.findIndex((task) => task.id === taskId);
            if (existing >= 0) {
              const next = prev.slice();
              next[existing] = nextTask;
              return next;
            }
            return [...prev, nextTask].slice(-8);
          });
          setIsThinking(true);
        } else if (t === "progress") {
          const tool = String(payload.tool || "tool");
          const step = String(payload.step || "step");
          const taskId = `${tool}:${step}`;
          const status =
            payload.status === "done" ? "done" : payload.status === "error" ? "error" : "running";
          const label = String(payload.label || step);
          const target =
            payload.index && payload.total ? `${label} (${payload.index}/${payload.total})` : label;
          setParallelTasks((prev) => {
            const existing = prev.findIndex((task) => task.id === taskId);
            const nextTask = {
              id: taskId,
              name: tool,
              appSlug: tool,
              target,
              status: status as "running" | "done" | "error",
            };
            if (existing >= 0) {
              const next = prev.slice();
              next[existing] = nextTask;
              return next;
            }
            return [...prev, nextTask].slice(-12);
          });
        } else if (t === "tool_result") {
          if (String(payload.name || "") === "generate_video") {
            const result: any = payload?.result;
            if (result?.paywall || result?.error) videoGenerationActive = false;
          }
          narrate(
            `${payload.ok ? "✓" : "✕"} ${prettyToolLabel(payload.name, payload.target)}`,
          );
          setToolActivity((prev) =>
            prev && prev.name === payload.name
              ? { ...prev, status: payload.ok ? "done" : "error" }
              : prev,
          );
          // Persist tool result on the assistant message.
          setMessages((prev) => {
            const idx = prev.findIndex((message) => message.clientId === `assistant-${localTurnId}`);
            if (idx < 0 || prev[idx]?.role !== "assistant") return prev;
            const msg = prev[idx];
            if (!msg.toolParts?.length) return prev;
            const taskId = payload.call_id ? String(payload.call_id) : "";
            let updated = false;
            let updatedLocal = false;
            assistantToolParts = assistantToolParts.map((p) => {
              const matches = taskId ? p.id === taskId : p.name === payload.name && p.state === "running";
              if (!matches || updatedLocal) return p;
              updatedLocal = true;
              return {
                ...p,
                state: (payload.ok ? "done" : "error") as "done" | "error",
                result: payload.result,
              };
            });
            if (!updatedLocal) {
              assistantToolParts = [
                ...assistantToolParts,
                {
                  id: taskId || `${payload.name || "tool"}-${Date.now()}`,
                  name: String(payload.name || ""),
                  state: (payload.ok ? "done" : "error") as "done" | "error",
                  result: payload.result,
                },
              ];
            }
            const nextParts = msg.toolParts.map((p) => {
              const matches = taskId ? p.id === taskId : p.name === payload.name && p.state === "running";
              if (!matches || updated) return p;
              updated = true;
              return {
                ...p,
                state: (payload.ok ? "done" : "error") as "done" | "error",
                result: payload.result,
              };
            });
            if (!updated) return prev;
            const next = prev.slice();
            next[idx] = { ...msg, toolParts: nextParts };
            return next;
          });
          setParallelTasks((prev) => {
            const taskId = payload.call_id ? String(payload.call_id) : "";
            let updated = false;
            const next = prev.map((task) => {
              const matches = taskId
                ? task.id === taskId
                : task.name === payload.name && task.status === "running";
              if (!matches || updated) return task;
              updated = true;
              return { ...task, status: payload.ok ? ("done" as const) : ("error" as const) };
            });
            return next;
          });
          try {
            const result = payload?.result;
            const collected: string[] = [];
            const pushUrl = (u: unknown, forceImage = false) => {
              if (
                typeof u === "string" &&
                /^(https?:\/\/|data:image\/)/i.test(u) &&
                !/\.(mp4|webm|mov)(\?|$)/i.test(u) &&
                (forceImage ||
                  /^data:image\//i.test(u) ||
                  /\.(png|jpe?g|webp|gif|avif|svg)(\?|#|$)/i.test(u))
              ) {
                collected.push(u);
              }
            };
            const walk = (value: unknown, depth = 0) => {
              if (!value || depth > 6) return;
              if (typeof value === "string") {
                pushUrl(value);
                return;
              }
              if (Array.isArray(value)) {
                value.forEach((item) => walk(item, depth + 1));
                return;
              }
              if (typeof value === "object") {
                const obj = value as Record<string, unknown>;
                pushUrl(obj.image_url, true);
                pushUrl(obj.screenshot_url, true);
                pushUrl(obj.screenshot, true);
                pushUrl(obj.image, true);
                pushUrl(obj.thumbnail, true);
                pushUrl(obj.thumb, true);
                pushUrl(obj.cover, true);
                pushUrl(obj.poster, true);
                pushUrl(obj.url);
                pushUrl(obj.output_url, true);
                walk(obj.image_urls, depth + 1);
                walk(obj.images, depth + 1);
                walk(obj.screenshots, depth + 1);
                walk(obj.urls, depth + 1);
                walk(obj.output, depth + 1);
                walk(obj.data, depth + 1);
                walk(obj.response, depth + 1);
                walk(obj.result, depth + 1);
                walk(obj.media, depth + 1);
                walk(obj.assets, depth + 1);
                walk(obj.raw, depth + 1);
              }
            };
            walk(result);
            if (collected.length > 0) {
              const fresh = collected.filter((u) => !searchImages.includes(u));
              if (fresh.length > 0) {
                searchImages = [...searchImages, ...fresh];
                setMessages((prev) => {
                  const assistantIndex = prev.findIndex(
                    (m) => m.clientId === `assistant-${localTurnId}`,
                  );
                  const targetIndex = assistantIndex >= 0 ? assistantIndex : prev.length - 1;
                  const last = prev[targetIndex];
                  if (last?.role !== "assistant") return prev;
                  const next = prev.slice();
                  const existing = Array.isArray(last.images) ? last.images : [];
                  const merged = [...existing, ...fresh.filter((u) => !existing.includes(u))];
                  next[targetIndex] = { ...last, images: merged };
                  return next;
                });
              }
            }
          } catch (e) {
            console.warn("[chat] failed to extract tool image", e);
          }

          // ── Music/audio tool: surface direct audio URL ─────────────────
          try {
            const result: any = payload?.result;
            const toolName = String(payload?.name || "");
            if (result && (toolName === "generate_music" || result.audio_url || result.music_url)) {
              const directUrl: string | undefined =
                (typeof result.audio_url === "string" && result.audio_url) ||
                (typeof result.music_url === "string" && result.music_url) ||
                (typeof result.url === "string" && /\.(mp3|wav|flac|m4a|ogg)(\?|$)/i.test(result.url) && result.url) ||
                undefined;
              if (directUrl) {
                generatedAudios = [...generatedAudios, directUrl].filter((v, i, a) => a.indexOf(v) === i);
                setMessages((prev) => {
                  const idx = prev.findIndex((m) => m.clientId === `assistant-${localTurnId}`);
                  const targetIndex = idx >= 0 ? idx : prev.length - 1;
                  const last = prev[targetIndex];
                  if (!last || last.role !== "assistant") return prev;
                  const existing = Array.isArray((last as any).audios) ? (last as any).audios : [];
                  if (existing.includes(directUrl)) return prev;
                  const next = prev.slice();
                  next[targetIndex] = {
                    ...last,
                    content: last.content?.trim() ? last.content : "Music is ready 👇",
                    audios: [...existing, directUrl],
                  } as any;
                  return next;
                });
              }
            }
          } catch (e) {
            console.warn("[chat] failed to extract tool audio", e);
          }

          // ── Video tool: surface direct video URL OR poll a job_id ─────
          try {
            const result: any = payload?.result;
            const toolName = String(payload?.name || "");
            if (
              result &&
              (toolName === "generate_video" || result.job_id || result.jobId || result.video_url)
            ) {
              const directUrl: string | undefined =
                (typeof result.video_url === "string" && result.video_url) ||
                (typeof result.url === "string" &&
                  /\.(mp4|webm|mov)(\?|$)/i.test(result.url) &&
                  result.url) ||
                undefined;

              const attachVideo = (url: string) => {
                generatedVideos = [...generatedVideos, url].filter((v, i, a) => a.indexOf(v) === i);
                setMessages((prev) => {
                  const idx = prev.findIndex((m) => m.clientId === `assistant-${localTurnId}`);
                  const targetIndex = idx >= 0 ? idx : prev.length - 1;
                  const last = prev[targetIndex];
                  if (!last || last.role !== "assistant") return prev;
                  const existing = Array.isArray(last.videos) ? last.videos : [];
                  if (existing.includes(url)) return prev;
                  const next = prev.slice();
                  next[targetIndex] = {
                    ...last,
                    content: last.content?.trim() ? last.content : "Here is your video 👇",
                    videos: [...existing, url],
                  };
                  return next;
                });
              };

              if (directUrl) {
                attachVideo(directUrl);
              } else {
                const jobId: string | undefined = result.job_id || result.jobId;
                if (jobId) {
                  // Surface the live job id on the assistant message so
                  // <VideoJobProgress> can subscribe to pending_video_jobs.
                  setMessages((prev) => {
                    const idx = prev.findIndex((m) => m.clientId === `assistant-${localTurnId}`);
                    const targetIndex = idx >= 0 ? idx : prev.length - 1;
                    const last = prev[targetIndex];
                    if (!last || last.role !== "assistant") return prev;
                    const next = prev.slice();
                    next[targetIndex] = { ...last, videoJobId: jobId } as any;
                    return next;
                  });
                  const isDurableBgJob = String(jobId).startsWith("bg:");
                  // Poll until the video is actually ready; keep the assistant
                  // message in loading state instead of posting a placeholder.
                  const pollPromise = (async () => {
                    let failedReads = 0;
                    while (!controller.signal.aborted) {
                      await new Promise((r) => setTimeout(r, 4000));
                      try {
                        const { data, error } = await supabase.functions.invoke(
                          "media-video-poll",
                          { body: { job_id: jobId } },
                        );
                        if (error) continue;
                        const status = data?.status;
                        if (
                          status === "complete" ||
                          status === "completed" ||
                          status === "succeeded" ||
                          status === "success"
                        ) {
                          const u = data?.video_url || data?.url || data?.output_url;
                          if (u) attachVideo(String(u));
                          return;
                        }
                        if (status === "failed" || status === "error" || status === "cancelled") {
                          if (isDurableBgJob) {
                            console.warn("[chat] durable video job reported transient failure; keeping poll alive:", data?.error);
                            continue;
                          }
                          // The poll endpoint auto-revives bg jobs that failed
                          // due to rate-limit/transient errors. Keep waiting a
                          // few cycles to give the resume a chance to land.
                          failedReads += 1;
                          if (failedReads >= 6) {
                            console.warn("[chat] video job failed:", data?.error);
                            return;
                          }
                          continue;
                        }
                        failedReads = 0;
                      } catch (e) {
                        console.warn("[chat] video poll error:", e);
                      }
                    }
                  })();
                  videoPollPromises.push(pollPromise);
                }
              }
            }
          } catch (e) {
            console.warn("[chat] failed to handle video tool_result", e);
          }
        }
      }
    },
    onDone: async () => {
      if (hadStreamError) return;
      try {
        const { triggerAha } = await import("@/lib/ahaTracker");
        triggerAha("chat");
      } catch {
        /* noop */
      }
      const tail = sanitizeStreamChunk("", true);
      if (tail.trim()) {
        assistantContent += tail;
      }
      // Detect <SCHEDULE .../> and strip it before render.
      if (assistantContent.includes("<SCHEDULE")) {
        try {
          const { handleScheduleTag } = await import("@/lib/chat/handleScheduleTag");
          assistantContent = await handleScheduleTag(assistantContent);
        } catch { /* noop */ }
      }
      // Detect <MEGSY_MAIL .../> — the assistant's own mailbox tool.
      if (/<MEGSY_MAIL/i.test(assistantContent)) {
        const mailTaskId = `megsy-mail-${localTurnId}`;
        const mailPart: ToolPart = {
          id: mailTaskId,
          name: "megsy_mail",
          appSlug: "email",
          state: "running",
        };
        upsertAssistantToolPart(mailPart);
        setToolActivity({ name: "megsy_mail", appSlug: "email", status: "running" });
        updateAssistantMessage((message) => ({
          ...message,
          toolParts: [...(message.toolParts || []).filter((part) => part.id !== mailTaskId), mailPart],
        }));
        try {
          const { handleMailTag } = await import("@/lib/chat/handleMailTag");
          const res = await handleMailTag(assistantContent);
          assistantContent = res.notes.length
            ? `${res.text}\n\n${res.notes.join("\n")}`.trim()
            : res.text;
          const completed: ToolPart = { ...mailPart, state: "done", result: res.notes };
          upsertAssistantToolPart(completed);
          setToolActivity({ name: "megsy_mail", appSlug: "email", status: "done" });
          updateAssistantMessage((message) => ({
            ...message,
            content: assistantContent,
            toolParts: (message.toolParts || []).map((part) =>
              part.id === mailTaskId ? completed : part,
            ),
          }));
        } catch (error) {
          assistantContent = sanitizeLeakedToolText(assistantContent);
          const failed: ToolPart = {
            ...mailPart,
            state: "error",
            result: error instanceof Error ? error.message : "Mail action failed",
          };
          upsertAssistantToolPart(failed);
          setToolActivity({ name: "megsy_mail", appSlug: "email", status: "error" });
          updateAssistantMessage((message) => ({
            ...message,
            content: assistantContent,
            toolParts: (message.toolParts || []).map((part) =>
              part.id === mailTaskId ? failed : part,
            ),
          }));
        }
      }
      if (assistantRenderTimer) {
        clearTimeout(assistantRenderTimer);
        flushAssistantUpdate();
      }
      if (videoPollPromises.length > 0 && generatedVideos.length === 0) {
        setIsThinking(true);
        await Promise.allSettled(videoPollPromises);
      }
      const hasGeneratedVideo = generatedVideos.length > 0;
      if (hasGeneratedVideo) {
        assistantContent = "Here is your video 👇";
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.clientId === `assistant-${localTurnId}`);
          const targetIndex = idx >= 0 ? idx : prev.length - 1;
          const last = prev[targetIndex];
          if (!last || last.role !== "assistant") return prev;
          const existing = Array.isArray(last.videos) ? last.videos : [];
          const merged = [...existing, ...generatedVideos.filter((u) => !existing.includes(u))];
          const next = prev.slice();
          next[targetIndex] = { ...last, content: assistantContent, videos: merged };
          return next;
        });
      }
      // Safety net: if the model leaked a raw video URL into the text reply,
      // extract it into the videos array and strip the URL/Markdown link.
      try {
        const VIDEO_URL_RE = /(https?:\/\/[^\s)\]]+?\.(?:mp4|webm|mov)(?:\?[^\s)\]]*)?)/gi;
        const found = Array.from(new Set((assistantContent.match(VIDEO_URL_RE) || []).map(String)));
        if (found.length > 0) {
          // Strip Markdown links [..](url) and bare URLs for those videos.
          let cleaned = assistantContent;
          for (const u of found) {
            const esc = u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            cleaned = cleaned
              .replace(new RegExp(`\\[[^\\]]*\\]\\(${esc}\\)`, "g"), "")
              .replace(new RegExp(esc, "g"), "");
          }
          assistantContent = cleaned.replace(/\n{3,}/g, "\n\n").trim();
          // If the model leaked website-style wording into a video reply
          // ("افتح الموقع", "خلال دقيقة", "ready in 1-2 minutes" ...),
          // replace the whole text with a clean single sentence.
          const WEBSITE_LEAK_RE = /(افتح\s*الموقع|خلال\s*دقيق|ready in (?:a|1)?\s*-?\s*\d?\s*minute|open the site|preview_url|سيكون جاهز|متوفر الآن!?\s*افتح)/i;
          if (WEBSITE_LEAK_RE.test(assistantContent)) {
            assistantContent = "Here is your video 👇";
          }
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.clientId === `assistant-${localTurnId}`);
            const targetIndex = idx >= 0 ? idx : prev.length - 1;
            const last = prev[targetIndex];
            if (!last || last.role !== "assistant") return prev;
            const existing = Array.isArray(last.videos) ? last.videos : [];
            const merged = [...existing, ...found.filter((u) => !existing.includes(u))];
            const next = prev.slice();
            next[targetIndex] = { ...last, content: assistantContent, videos: merged };
            return next;
          });
        }
        // Also scrub website-style wording from any assistant message whose
        // videos array already contains a clip (tool returned video_url
        // without leaking it into the text, but model still wrote nonsense).
        else {
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.clientId === `assistant-${localTurnId}`);
            const targetIndex = idx >= 0 ? idx : prev.length - 1;
            const last = prev[targetIndex];
            if (!last || last.role !== "assistant") return prev;
            const hasVideo = Array.isArray(last.videos) && last.videos.length > 0;
            if (!hasVideo) return prev;
            const WEBSITE_LEAK_RE = /(افتح\s*الموقع|خلال\s*دقيق|ready in (?:a|1)?\s*-?\s*\d?\s*minute|open the site|preview_url|سيكون جاهز|متوفر الآن!?\s*افتح)/i;
            if (!WEBSITE_LEAK_RE.test(last.content || "")) return prev;
            const next = prev.slice();
            assistantContent = "Here is your video 👇";
            next[targetIndex] = { ...last, content: assistantContent };
            return next;
          });
        }
      } catch (e) {
        console.warn("[chat] video URL extraction failed", e);
      }
      // Deep Research: append a clean, ordered sources section built from the
      // citations collected during the stream, so the dedicated report page can
      // render the full source list (the normalizer strips it from the body and
      // the page renders it separately). Also drop any trailing sources list the
      // model wrote itself to avoid duplicates.
      if (isDeepResearch && researchSources.length > 0 && assistantContent.trim()) {
        const isArabicReport = /[\u0600-\u06FF]/.test(assistantContent);
        const seenUrls = new Set<string>();
        const sourceLines = researchSources
          .filter((s) => {
            if (!s?.url || seenUrls.has(s.url)) return false;
            seenUrls.add(s.url);
            return true;
          })
          .map((s) => {
            const title = (s.title || "").replace(/[\[\]()]/g, " ").replace(/\s+/g, " ").trim();
            return `- [${title || s.url}](${s.url})`;
          });
        assistantContent = assistantContent
          .replace(
            /\n+#{1,6}\s*(?:sources|references|المصادر|مصادر|المراجع)\s*:?[^\n]*\n[\s\S]*$/i,
            "",
          )
          .trimEnd();
        assistantContent = `${assistantContent}\n\n${isArabicReport ? "## مصادر" : "## Sources"}\n\n${sourceLines.join("\n")}`;
      }
      settleRunningTools("done");
      setIsLoading(false);
      setIsThinking(false);
      resetToolUi();
      isSubmittingRef.current = false;
      if (presenceChannelRef.current && chatUserId) {
        presenceChannelRef.current.send({
          type: "broadcast",
          event: "ai_busy",
          payload: { user_id: chatUserId, busy: false },
        });
      }
      if (!assistantContent && searchImages.length === 0 && streamedProducts.length === 0 && !hasGeneratedVideo) {
        assistantContent =
          "There was a delay generating the response, but your request was received. Try sending it again or make it shorter.";
        setMessages((prev) => {
          const assistantIndex = prev.findIndex((m) => m.clientId === `assistant-${localTurnId}`);
          const targetIndex = assistantIndex >= 0 ? assistantIndex : prev.length - 1;
          const last = prev[targetIndex];
          if (last?.role !== "assistant")
            return [
              ...prev,
              {
                role: "assistant",
                content: assistantContent,
                clientId: `assistant-${localTurnId}`,
              },
            ];
          const next = prev.slice();
          next[targetIndex] = {
            ...last,
            content: assistantContent,
            ...(isDeepResearch ? { mode: "deep-research" as const } : {}),
          };
          return next;
        });
      }
      const resolvedConversationId = await conversationPromise;
      if (resolvedConversationId && assistantContent) {
        if (isDeepResearch && !deepResearchPlaceholderId && deepResearchPlaceholderPromise) {
          deepResearchPlaceholderId = await deepResearchPlaceholderPromise;
        }
        let aId: string | undefined;
        if (isDeepResearch && deepResearchPlaceholderId) {
          const { error } = await supabase
            .from("messages")
            .update({
              content: assistantContent,
              images: searchImages.length > 0 ? searchImages : null,
              metadata: buildAssistantMetadata() ?? null,
            } as any)
            .eq("id", deepResearchPlaceholderId);
          if (error) {
            const insertedId = await saveMessage(
              resolvedConversationId,
              "assistant",
              assistantContent,
              searchImages.length > 0 ? searchImages : undefined,
              buildAssistantMetadata(),
            );
            aId = insertedId;
          } else {
            aId = deepResearchPlaceholderId;
          }
        } else {
          aId = await saveMessage(
            resolvedConversationId,
            "assistant",
            assistantContent,
            searchImages.length > 0 ? searchImages : undefined,
            buildAssistantMetadata(),
          );
        }
        if (aId) ownInsertedIdsRef.current.add(aId);
        const siteIdA = detectSiteBuildId(assistantContent);
        if (siteIdA && aId) {
          void updateMessageMetadata(aId, { siteBuild: { siteId: siteIdA }, kind: "siteBuild" });
        }
        if (isDeepResearch) {
          const user = await getCachedUser();
          if (user) {
            await supabase.from("research_reports").upsert(
              {
                user_id: user.id,
                session_key: `conv_${resolvedConversationId}_${assistantMessageIndex}`,
                query: userInput || "Deep Research",
                report: assistantContent,
                images: (searchImages.length > 0 ? searchImages : []) as any,
                steps: [] as any,
              } as any,
              { onConflict: "user_id,session_key" },
            );
          }
        }
        setMessages((prev) => {
          const assistantIndex = prev.findIndex((m) => m.clientId === `assistant-${localTurnId}`);
          const targetIndex = assistantIndex >= 0 ? assistantIndex : prev.length - 1;
          const last = prev[targetIndex];
          if (last?.role !== "assistant") return prev;
          const next = prev.slice();
          next[targetIndex] = {
            ...last,
            id: aId || last.id,
            images: searchImages.length > 0 ? searchImages : last.images,
            videos: generatedVideos.length > 0 ? generatedVideos : last.videos,
            products: streamedProducts.length > 0 ? streamedProducts : last.products,
            metadata: buildAssistantMetadata() as any,
            siteBuild: siteIdA ? { siteId: siteIdA } : last.siteBuild,
          };
          return next;
        });
        const dbMode =
          (chatMode as string) === "deep-research"
            ? "research"
            : chatMode === "learning"
              ? "learning"
              : chatMode === "shopping"
                ? "shopping"
                : chatMode === "video"
                  ? "videos"
                  : "chat";
        await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString(), mode: dbMode } as any)
          .eq("id", resolvedConversationId);
        window.dispatchEvent(new CustomEvent("megsy:conversations-changed"));
        // Long-term memory extraction runs exactly once per turn, in
        // onComplete via the dedicated `memory-extract` function. The old
        // duplicate call to `openrouter-media` (kind: extract_memory) fired
        // for the same turn, doubling the model cost and racing the other
        // writer for the same facts — removed on purpose.

      }
    },
    onError: (err) => {
      hadStreamError = true;
      if (assistantRenderTimer) clearTimeout(assistantRenderTimer);

      const isGuestQuota = err === GUEST_QUOTA_ERROR;
      if (isGuestQuota) {
        const guestMsg = [
          "**You've used your free message.**",
          "",
          "Create a free account to keep chatting, save your history, and unlock voice, deep research, and more.",
          "",
          "[Create a free account →](/auth)",
        ].join("\n");
        assistantContent = guestMsg;
        setMessages((prev) =>
          prev.map((m) =>
            m.clientId === `assistant-${localTurnId}` ? { ...m, content: guestMsg } : m,
          ),
        );
      } else {
        toast.error(err);
      }
      settleRunningTools("error");
      setIsThinking(false);
      setIsLoading(false);
      resetToolUi();
      if (presenceChannelRef.current && chatUserId) {
        presenceChannelRef.current.send({
          type: "broadcast",
          event: "ai_busy",
          payload: { user_id: chatUserId, busy: false },
        });
      }
      const fallbackContent =
        isDeepResearch && !assistantContent.trim()
          ? "Deep Research stopped before the final report was generated. The request was saved — please try again in a moment."
          : "";
      if (fallbackContent) {
        assistantContent = fallbackContent;
        setMessages((prev) =>
          prev.map((m) =>
            m.clientId === `assistant-${localTurnId}` ? { ...m, content: fallbackContent } : m,
          ),
        );
      } else if (!isGuestQuota && !assistantContent.trim()) {
        assistantContent = err;
        setMessages((prev) =>
          prev.map((m) => (m.clientId === `assistant-${localTurnId}` ? { ...m, content: err } : m)),
        );
      } else if (!isGuestQuota) {
        setMessages((prev) =>
          prev[prev.length - 1]?.role === "assistant" && !prev[prev.length - 1]?.content
            ? prev.slice(0, -1)
            : prev,
        );
      }
      void (async () => {
        const contentToSave = assistantContent.trim();
        const resolvedConversationId = await conversationPromise;
        if (!resolvedConversationId) return;
        if (isDeepResearch && !deepResearchPlaceholderId && deepResearchPlaceholderPromise) {
          deepResearchPlaceholderId = await deepResearchPlaceholderPromise;
        }
        if (!contentToSave) {
          if (isDeepResearch && deepResearchPlaceholderId) {
            void supabase
              .from("messages")
              .delete()
              .eq("id", deepResearchPlaceholderId)
              .then(() => {});
          }
          return;
        }
        let aId: string | undefined;
        if (isDeepResearch && deepResearchPlaceholderId) {
          const { error } = await supabase
            .from("messages")
            .update({
              content: contentToSave,
              images: searchImages.length > 0 ? searchImages : null,
              metadata: buildAssistantMetadata() ?? null,
            } as any)
            .eq("id", deepResearchPlaceholderId);
          if (error) {
            const insertedId = await saveMessage(
              resolvedConversationId,
              "assistant",
              contentToSave,
              searchImages.length > 0 ? searchImages : undefined,
              buildAssistantMetadata(),
            );
            aId = insertedId;
          } else {
            aId = deepResearchPlaceholderId;
          }
        } else {
          aId = await saveMessage(
            resolvedConversationId,
            "assistant",
            contentToSave,
            searchImages.length > 0 ? searchImages : undefined,
            buildAssistantMetadata(),
          );
        }
        if (aId) ownInsertedIdsRef.current.add(aId);
        const siteIdB = detectSiteBuildId(contentToSave);
        if (siteIdB && aId) {
          void updateMessageMetadata(aId, { siteBuild: { siteId: siteIdB }, kind: "siteBuild" });
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aId || m.clientId === `assistant-${localTurnId}`
                ? { ...m, siteBuild: { siteId: siteIdB } }
                : m,
            ),
          );
        }
        if (isDeepResearch && chatUserId) {
          await supabase.from("research_reports").upsert(
            {
              user_id: chatUserId,
              session_key: `conv_${resolvedConversationId}_${assistantMessageIndex}`,
              query: userInput || "Deep Research",
              report: contentToSave,
              images: (searchImages.length > 0 ? searchImages : []) as any,
              steps: [] as any,
            } as any,
            { onConflict: "user_id,session_key" },
          );
        }
        // Fire-and-forget long-term memory extraction. Never blocks chat.
        // Silent on failure; toasts a subtle "🧠 remembered" when facts were saved.
        try {
          void (async () => {
            try {
              const { data } = await supabase.functions.invoke("memory-extract", {
                body: {
                  user_message: userInput || "",
                  assistant_reply: contentToSave,
                  conversation_id: resolvedConversationId,
                  message_id: aId || null,
                },
              });
              const saved = (data as any)?.saved ?? 0;
              const titles: string[] = (data as any)?.titles ?? [];
              if (saved > 0 && typeof window !== "undefined") {
                const { toast } = await import("sonner");
                const preview = titles.slice(0, 2).join(" · ");
                toast(
                  `🧠 ${saved === 1 ? "Remembered" : `Remembered ${saved} facts`}`,
                  { description: preview || undefined, duration: 3000 },
                );
              }
            } catch { /* silent */ }
          })();
        } catch {}
      })();
      isSubmittingRef.current = false;
    },
    signal: controller.signal,
  });
}
