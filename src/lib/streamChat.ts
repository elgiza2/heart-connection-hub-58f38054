import { startJob, subscribeJob, resumeJob } from "@/lib/jobs/client";
import { getAnonFingerprint } from "@/lib/anonFingerprint";
import { isFastLaneEligible, tryFastChat } from "@/lib/chat/fastChat";

export const GUEST_QUOTA_ERROR = "GUEST_QUOTA_EXCEEDED";

type MsgContent = string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
type Msg = { role: "user" | "assistant"; content: MsgContent };

type BrowserPayload = {
  currentUrl?: string;
  liveUrl?: string;
  screenshotUrl?: string;
  currentStep?: string;
};

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-alibaba`;

// Lightweight session-token cache so we don't hit auth/v1/user on every send.
// The access_token in supabase-js is already cached in localStorage; we just
// memoize the synchronous read for a few seconds to avoid the network call.
let _cachedToken: { token: string; exp: number } | null = null;
async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (_cachedToken && _cachedToken.exp > now + 5_000) return _cachedToken.token;
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const expSec = data.session?.expires_at || 0;
    if (token) {
      _cachedToken = { token, exp: expSec ? expSec * 1000 : now + 60_000 };
      return token;
    }
  } catch {
    /* ignore */
  }
  return import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
}

async function refreshAccessToken(): Promise<string> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.refreshSession();
    const token = data.session?.access_token;
    if (token) {
      _cachedToken = {
        token,
        exp: data.session?.expires_at ? data.session.expires_at * 1000 : Date.now() + 60_000,
      };
      return token;
    }
  } catch {
    /* fall back to the publishable key for guest chat */
  }
  _cachedToken = null;
  return import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
}

export async function streamChat({
  messages,
  model,
  tier,
  searchEnabled,
  searchExplicit,
  deepResearch,
  chatMode,
  user_id,
  conversation_id,
  computerUseEnabled,
  activeAgent,
  selectedModel,
  activeSkill,
  availableSkills,
  background,
  onJobStart,
  onDelta,
  onDone,
  onError,
  onImages,
  onProducts,
  onStatus,
  onBrowser,
  onEvent,
  onReasoning,
  onUsage,
  onModel,
  localPipeline,

  signal,
}: {
  messages: Msg[];
  model?: string;
  tier?: "lite" | "pro" | "max";
  searchEnabled?: boolean;
  /** User explicitly toggled web search on for this turn. */
  searchExplicit?: boolean;
  deepResearch?: boolean;
  chatMode?: string;
  user_id?: string;
  conversation_id?: string;
  computerUseEnabled?: boolean;
  activeAgent?: string;
  selectedModel?: { id: string; cost: number };
  activeSkill?: {
    id?: string;
    name: string;
    instructions: string;
    enabled_tools?: string[];
    preferred_model?: string | null;
  } | null;
  availableSkills?: Array<{
    id?: string;
    name: string;
    description: string;
    triggers?: string[];
    source?: string;
    instructions?: string;
    enabled_tools?: string[];
    preferred_model?: string | null;
  }>;
  /** When true, run on the server as a background job that survives the user closing the tab. */
  background?: boolean;
  /** Called as soon as the background jobId is known so the caller can persist it for resume. */
  onJobStart?: (jobId: string) => void;
  onDelta: (deltaText: string) => void;
  onDone: () => void | Promise<void>;
  onError?: (error: string) => void;
  onImages?: (images: string[]) => void;
  onProducts?: (products: any[]) => void;
  onStatus?: (status: string) => void;
  onBrowser?: (browser: BrowserPayload) => void;
  onEvent?: (payload: { event: string; [k: string]: any }) => void;
  onReasoning?: (deltaText: string) => void;
  /** Fires with token usage stats whenever the upstream sends them. */
  onUsage?: (usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }) => void;
  /** Fires once with the actual model id that produced the response (from x-model-used header or first SSE frame). */
  onModel?: (model: string) => void;
  signal?: AbortSignal;
  /**
   * Local agent pipeline (Deep Research). When provided, the turn is produced
   * entirely by our own agent instead of the backend chat stream, but all the
   * caller's callbacks (delta / status / done / error) behave identically.
   */
  localPipeline?: (handles: {
    onDelta: (chunk: string) => void;
    onStatus: (status: string) => void;
    signal?: AbortSignal;
  }) => Promise<void>;
}) {
  if (localPipeline) {
    try {
      await localPipeline({
        onDelta,
        onStatus: (s) => onStatus?.(s),
        signal,
      });
      await onDone();
    } catch (e: any) {
      if (e?.name === "AbortError") {
        await onDone();
        return;
      }
      onError?.(e?.message || "Deep Research failed. Please try again.");
      await onDone();
    }
    return;
  }

  // ── Background job mode ─────────────────────────────────────────────────
  // Server creates a background_jobs row and streams progress into it. We
  // subscribe via Realtime; closing the tab no longer interrupts the answer.
  if (background) {
    try {
      const { jobId } = await startJob("chat", {
        messages,
        model,
        tier,
        searchEnabled,
        deepResearch,
        chatMode,
        user_id,
        conversation_id,
        computerUseEnabled,
        activeAgent,
        selectedModel,
        activeSkill,
        availableSkills,
        background: true,
      });
      onJobStart?.(jobId);
      const seenEvents = new Set<string>();
      let unsub: (() => void) | null = null;
      let settled = false;
      unsub = subscribeJob(jobId, {
        onStatus: (t) => onStatus?.(t),
        onDelta: (chunk) => onDelta(chunk),
        onMeta: (meta) => {
          if (Array.isArray(meta?.images)) onImages?.(meta.images);
          if (Array.isArray(meta?.products)) onProducts?.(meta.products);
          if (meta?.browser) onBrowser?.(meta.browser);
          if (Array.isArray(meta?.events)) {
            for (const ev of meta.events) {
              const key = JSON.stringify(ev);
              if (seenEvents.has(key)) continue;
              seenEvents.add(key);
              onEvent?.(ev);
            }
          }
        },
        onDone: () => {
          if (settled) return;
          settled = true;
          try {
            unsub?.();
          } catch {}
          void onDone();
        },
        onError: (m) => {
          if (settled) return;
          settled = true;
          try {
            unsub?.();
          } catch {}
          onError?.(m);
          void onDone();
        },
      });
      if (signal) {
        signal.addEventListener(
          "abort",
          () => {
            if (settled) return;
            settled = true;
            try {
              unsub?.();
            } catch {}
            void onDone();
          },
          { once: true },
        );
      }
      return;
    } catch (e: any) {
      onError?.(e?.message || "Background job failed to start.");
      await onDone();
      return;
    }
  }

  let receivedAnyContent = false;
  const origOnDelta = onDelta;
  onDelta = (chunk: string) => {
    if (chunk) receivedAnyContent = true;
    origOnDelta(chunk);
  };

  // Rescue: the full chat path can stall before it emits a single byte (heavy
  // build/task prompts). Rather than leaving the user on an endless
  // "Thinking…", we stream the answer from the fast Alibaba model instead.
  const rescueWithFastChat = async (): Promise<boolean> => {
    if (receivedAnyContent) return false;
    try {
      const outcome = await tryFastChat({
        messages,
        authToken: await getAccessToken(),
        fingerprint: getAnonFingerprint(),
        signal,
        onDelta,
        onModel,
        onUsage,
        force: true,
      });
      return outcome === "answered" && receivedAnyContent;
    } catch {
      return false;
    }
  };


  // ── Fast lane ───────────────────────────────────────────────────────────
  // Simple, tool-free turns go to the lightweight `chat-fast` function first
  // (no turn-context pre-flight). The fast model escalates by itself when the
  // turn actually needs tools/tasks, and we then fall through to the full path.
  try {
    if (
      isFastLaneEligible({
        messages,
        chatMode,
        deepResearch,
        searchExplicit,
        computerUseEnabled,
        activeAgent,
        activeSkill,
      })
    ) {
      const outcome = await tryFastChat({
        messages,
        authToken: await getAccessToken(),
        fingerprint: getAnonFingerprint(),
        signal,
        onDelta,
        onModel,
        onUsage,
      });
      if (outcome === "answered") {
        await onDone();
        return;
      }
    }
  } catch (e: any) {
    if (e?.name === "AbortError") {
      await onDone();
      return;
    }
    if (receivedAnyContent) {
      onError?.("The reply was interrupted. You can ask me to continue.");
      await onDone();
      return;
    }
    /* fall through to the full chat path */
  }

  try {

    let completed = false;
    // Everything below is pre-flight work: it must all finish before the first
    // byte can be requested, so it runs in parallel instead of sequentially.
    const tokenPromise = getAccessToken();
    const turnCtxModPromise = import("@/lib/chat/turnContext");
    const promptsModPromise = import("@/lib/modelSystemPrompts");
    const capabilitiesModPromise = import("@/lib/chat/capabilities");
    const fingerprint = getAnonFingerprint();
    // Per-mode + per-model system prompt override (learning mode, model
    // voices, depth/language rules). The edge function uses customSystem
    // verbatim when present.
    // User-configured context (knowledge, tool servers, connected apps,
    // browser session preferences) — collected once per turn.
    let turnCtx: Awaited<ReturnType<typeof import("@/lib/chat/turnContext").fetchTurnContext>> | null = null;
    let turnCtxBrief = "";
    let turnCtxPayload: Record<string, unknown> = {};
    let authToken = await tokenPromise;
    try {
      const mod = await turnCtxModPromise;
      turnCtx = await mod.fetchTurnContext();
      turnCtxBrief = mod.buildTurnContextBrief(turnCtx);
      turnCtxPayload = mod.turnContextPayload(turnCtx);
    } catch {
      turnCtx = null;
    }
    let customSystem: string | null = null;
    try {
      const mod = await promptsModPromise;
      // In Learning mode, inject a compact live-learner signal so the
      // tutor actually adapts (streak, XP, Bloom rung, accuracy, topic).
      let learnState: string | null = null;
      if (chatMode === "learning") {
        try {
          const sp = await import("@/lib/studyProgress");
          learnState = sp.formatStudyStateForPrompt();
        } catch {
          learnState = null;
        }
      }
      // Deep Research is streamed as a "normal" turn to the backend (its own
      // research agent stalls), but the PROMPT must still be the research one —
      // otherwise the model answers like the plain site assistant.
      const promptMode = deepResearch ? "deep-research" : chatMode;
      customSystem = mod.buildCustomSystem(promptMode, selectedModel?.id, learnState);
      const { CAPABILITIES_BRIEF, buildDateBrief, SUPERVISOR_BRIEF } =
        await capabilitiesModPromise;
      customSystem = `${customSystem || ""}\n\n${buildDateBrief()}\n\n${CAPABILITIES_BRIEF}\n\n${SUPERVISOR_BRIEF}`.trim();
      if (turnCtxBrief) customSystem = `${customSystem}\n\n${turnCtxBrief}`.trim();
      if (chatMode !== "images" && chatMode !== "video") {
        const { chatModelPreferenceHint } = await import("@/lib/chatModelPreferences");
        const preferenceHint = chatModelPreferenceHint();
        if (preferenceHint) customSystem = `${customSystem || ""}\n${preferenceHint}`.trim();
      }
    } catch {
      customSystem = null;
    }
    // Assign a fresh resume id per turn so the server can persist stream
    // chunks and the client can fetch the tail after a network drop.
    const resumeId =
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `r-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
    try { onEvent?.({ event: "resume_id", resumeId }); } catch { /* ignore */ }
    const requestBody = JSON.stringify({
        // Deep Research streams straight through: the server-side resume
        // buffer stalls long research turns, so we skip it in that mode.
        resume_id: deepResearch ? undefined : resumeId,

        messages,
        model,
        tier,
        // Deep Research runs fully inside our own agent: we already fetched and
        // injected the live sources, so the backend web tool stays OFF (it
        // stalls long research turns).
        searchEnabled,
        chatMode,
        user_id,
        conversation_id,
        computerUseEnabled,
        activeAgent,
        selectedModel,
        activeSkill,
        availableSkills,
        customSystem,
        ...turnCtxPayload,
        zone: (typeof window !== "undefined" && (window as any).__MEGSY_ZONE__) || "megsy",
      });
    let resp: Response | null = null;
    // Headers watchdog: if the full chat function does not even answer with
    // headers in time, stop waiting and let the fast lane rescue the turn.
    const HEADERS_TIMEOUT_MS = deepResearch ? 120_000 : 30_000;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const headersCtl = new AbortController();
      const onOuterAbort = () => headersCtl.abort();
      signal?.addEventListener("abort", onOuterAbort, { once: true });
      const headersTimer = setTimeout(() => headersCtl.abort(), HEADERS_TIMEOUT_MS);
      try {
        resp = await fetch(CHAT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${authToken}`,
            "x-anon-fingerprint": fingerprint,
          },
          body: requestBody,
          signal: headersCtl.signal,
        });
        if (resp.status === 401 && attempt === 0) {
          authToken = await refreshAccessToken();
          continue;

        }
        if (resp.status >= 500 && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
          continue;
        }
        break;
      } catch (error) {
        if (signal?.aborted) throw error;
        if (headersCtl.signal.aborted) {
          // Full path never answered — rescue with the fast model.
          if (await rescueWithFastChat()) {
            await onDone();
            return;
          }
          throw new Error("IDLE_TIMEOUT");
        }
        if (attempt === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
      } finally {
        clearTimeout(headersTimer);
        signal?.removeEventListener("abort", onOuterAbort);
      }
    }
    if (!resp) throw new Error("NETWORK_UNAVAILABLE");


    if (resp.status === 429) {
      onError?.("Rate limit exceeded. Please wait a moment and try again.");
      await onDone();
      return;
    }
    if (resp.status === 403) {
      // Guest-quota or auth-required errors come back as JSON with a code.
      const errBody = await resp.json().catch(() => ({}) as any);
      if (errBody?.code === "guest_quota_exceeded" || errBody?.code === "auth_required") {
        onError?.(GUEST_QUOTA_ERROR);
        await onDone();
        return;
      }
      onError?.(errBody?.error || "Access denied.");
      await onDone();
      return;
    }
    if (resp.status === 401) {
      onError?.(GUEST_QUOTA_ERROR);
      await onDone();
      return;
    }
    if (resp.status === 402) {
      onError?.("Insufficient balance. Please top up to continue.");
      await onDone();
      return;
    }
    if (resp.status === 503) {
      onError?.("Chat service is temporarily unavailable. Please try again.");
      await onDone();
      return;
    }
    if (!resp.ok || !resp.body) {
      const errorText = await resp.text().catch(() => "");
      const genericError = /^(request|fetch) failed$/i.test(errorText.trim());
      const msg =
        (!genericError && errorText) ||
        (resp.status >= 500
          ? "Chat request failed before streaming. Please try again."
          : "Chat request failed.");
      onError?.(msg);
      await onDone();
      return;
    }

    try {
      const hdrModel = resp.headers.get("x-model-used");
      if (hdrModel) onModel?.(hdrModel);
    } catch { /* ignore */ }

    const handlePayload = (parsed: any) => {
      if (parsed.error) {
        onError?.(String(parsed.error));
        return;
      }
      if (parsed.event && typeof parsed.event === "string") onEvent?.(parsed);
      // Surface tool activity (tool_call / tool_result) as a synthetic event
      // so the chat UI can render brand icons + action text inline.
      if (parsed.tool_event && typeof parsed.tool_event === "object") {
        onEvent?.({ event: "tool_event", ...parsed.tool_event });
      }
      if (parsed.status && typeof parsed.status === "string") onStatus?.(parsed.status);
      if (parsed.images && Array.isArray(parsed.images)) onImages?.(parsed.images);
      if (parsed.products && Array.isArray(parsed.products)) onProducts?.(parsed.products);
      if (parsed.browser && typeof parsed.browser === "object") onBrowser?.(parsed.browser);
      if (parsed.usage && typeof parsed.usage === "object") onUsage?.(parsed.usage);
      if (parsed.model && typeof parsed.model === "string") onModel?.(parsed.model);
      const delta = parsed.choices?.[0]?.delta;
      const reasoning =
        (delta?.reasoning_content as string | undefined) ??
        (delta?.reasoning as string | undefined) ??
        (parsed.reasoning as string | undefined);
      if (reasoning) onReasoning?.(reasoning);
      const content = delta?.content as string | undefined;
      if (content) onDelta(content);
    };

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = "";
    let streamDone = false;

    // Idle timeout: if NO bytes arrive within this window we treat the
    // connection as dead and surface a friendly retry message instead of an
    // infinite spinner. Heartbeats from the server (`: keep-alive ...`) keep
    // this alive even during long tool flows. Deep Research jobs do many
    // long-running steps (search → fetch → synthesize) and often take 1-3
    // minutes between visible deltas, so we use a much larger window for them.
    const isVideoTurn =
      String(chatMode || "").toLowerCase() === "video" ||
      messages.some((m) => {
        const content = Array.isArray(m.content)
          ? m.content.map((p) => p.text || "").join(" ")
          : String(m.content || "");
        return /(video|clip|animate|animation|motion|فيديو|فديو|ڤيديو|تحريك|حرك)/i.test(content);
      });
    const IDLE_TIMEOUT_MS = deepResearch ? 240_000 : isVideoTurn ? 10 * 60_000 : 60_000;
    const idleAbort = new AbortController();
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    // Before the first visible token we are much less patient: a silent
    // stream means the turn is stuck, and the fast lane can rescue it.
    // The server heartbeats every 5s while planning/researching, and every
    // heartbeat resets this timer — so this window only has to cover a truly
    // silent stream, not the whole pre-work phase.
    const FIRST_CONTENT_TIMEOUT_MS = deepResearch ? 240_000 : isVideoTurn ? 10 * 60_000 : 45_000;
    const resetIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(
        () => idleAbort.abort(),
        receivedAnyContent ? IDLE_TIMEOUT_MS : FIRST_CONTENT_TIMEOUT_MS,
      );
    };
    resetIdle();

    try {
      while (!streamDone) {
        const readPromise = reader.read();
        const idlePromise = new Promise<never>((_, reject) => {
          idleAbort.signal.addEventListener("abort", () => reject(new Error("IDLE_TIMEOUT")), {
            once: true,
          });
        });
        const { done, value } = await Promise.race([readPromise, idlePromise]);
        if (done) break;
        resetIdle();
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            completed = true;
            streamDone = true;
            break;
          }

          try {
            handlePayload(JSON.parse(jsonStr));
          } catch {
            continue;
          }
        }
      }
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
    }

    if (textBuffer.trim()) {
      for (let raw of textBuffer.split("\n")) {
        if (!raw) continue;
        if (raw.endsWith("\r")) raw = raw.slice(0, -1);
        if (raw.startsWith(":") || raw.trim() === "") continue;
        if (!raw.startsWith("data: ")) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === "[DONE]") {
          completed = true;
          continue;
        }
        try {
          handlePayload(JSON.parse(jsonStr));
        } catch {
          continue;
        }
      }
    }

    if (!completed && deepResearch && !receivedAnyContent) {
      onError?.("Deep Research stopped before the report finished. Please try again.");
      return;
    }

    await onDone();
  } catch (e: any) {
    if (e?.name === "AbortError") {
      await onDone();
      return;
    }
    if (e?.message === "IDLE_TIMEOUT") {
      if (!receivedAnyContent && (await rescueWithFastChat())) {
        await onDone();
        return;
      }
      onError?.(
        receivedAnyContent
          ? "Reply was cut off — the connection stalled. You can ask me to continue."
          : "Chat took too long to start streaming. Please try again.",
      );
      await onDone();
      return;
    }
    console.error("Stream error:", e);
    const isNetworkError =
      !navigator.onLine ||
      e?.message?.includes("Failed to fetch") ||
      e?.message?.includes("NetworkError") ||
      e?.message?.includes("ERR_NETWORK");
    if (isNetworkError) {
      onError?.(
        receivedAnyContent
          ? "Connection dropped mid-reply — the answer above may be incomplete. Ask me to continue when you're back online."
          : "Connection error. Please check your internet and try again.",
      );
    } else {
      onError?.(
        receivedAnyContent
          ? "The reply was interrupted. You can ask me to continue."
          : "Something went wrong. Please try again.",
      );
    }
    await onDone();
  }
}
