/** @doc Main chat workspace — all modes, all models, attachments, agents and the composer live here. */
import SEOHead from "@/components/common/SEOHead";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import { useState, useRef, useEffect, useCallback, Suspense, lazy, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { animate, m as motion, useMotionValue, useTransform } from "framer-motion";
import { toast } from "sonner";
import { useNavigate, useLocation, type NavigateOptions, type To } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MAX_CHAT_MESSAGE_CHARS } from "@/lib/validation/schemas";
import { Button } from "@/components/ui/button";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

import { getCachedUser } from "@/lib/cachedUser";
import { warmEdgeFunctions } from "@/lib/warmEdgeFunctions";
import AppSidebar from "@/components/layout/AppSidebar";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";
import { useUserLang } from "@/lib/authI18n";
import { isPaidUser } from "@/lib/subscriptionGating";

// Background job helpers and one-off lib utilities that are still referenced
// from the surviving body (cancel/cleanup paths, etc.).
import { failStaleJob } from "@/lib/jobs/client";
import { extractProjectFiles } from "@/lib/extractProjectFiles";
import { useSkills } from "@/hooks/useSkills";

// State + side-effect hooks that drive ChatPage's enormous state graph.
import { useUrlMode } from "./hooks/useUrlMode";
import { prewarmSendPath } from "./lib/prewarmSendPath";

import { useVideoFrames } from "./hooks/useVideoFrames";
import { useShareDialog } from "./hooks/useShareDialog";
import { useChatRename } from "./hooks/useChatRename";
import { useInviteDialog } from "./hooks/useInviteDialog";
import { useChatReactions } from "./hooks/useChatReactions";
import { useChatPresence } from "./hooks/useChatPresence";
import { useStudyMode } from "./hooks/useStudyMode";
import { useToolActivity } from "./hooks/useToolActivity";
import { useChatTier } from "./hooks/useChatTier";
import { usePlusMenu } from "./hooks/usePlusMenu";
import { usePendingQuestions } from "./hooks/usePendingQuestions";
import { useTrendingSuggestions } from "./hooks/useTrendingSuggestions";
import { useChatModeState } from "./hooks/useChatModeState";
import { useAttachments } from "./hooks/useAttachments";
import { useChatMessages } from "./hooks/useChatMessages";
import { useConversationMeta } from "./hooks/useConversationMeta";
import { AuiProvider } from "./adapters/aui/AuiProvider";

const RTL_UI_LANGS = new Set(["ar", "ar-eg", "he", "fa"]);
const SIDEBAR_EDGE_SWIPE_ZONE = 36;
/** A sideways swipe must not steal the gesture from a horizontal scroller
 *  (mode chips, code blocks, tables) or from an element that drags itself. */
function blocksSidebarSwipe(target: EventTarget | null, startX: number, rtl: boolean): boolean {
  let node = target as HTMLElement | null;
  // Anywhere on the surface may start the gesture, but the edge strip always wins.
  const nearEdge = rtl ? startX >= window.innerWidth - SIDEBAR_EDGE_SWIPE_ZONE : startX <= SIDEBAR_EDGE_SWIPE_ZONE;
  if (nearEdge) return false;
  while (node && node !== document.body) {
    if (node.dataset?.noSidebarSwipe === "true") return true;
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) return true;
    const style = window.getComputedStyle(node);
    const overflowX = style.overflowX;
    if ((overflowX === "auto" || overflowX === "scroll") && node.scrollWidth > node.clientWidth + 4)
      return true;
    if (style.touchAction.includes("none") || style.touchAction === "pan-x") return true;
    node = node.parentElement;
  }
  return false;
}
const SIDEBAR_OPEN_SNAP = 0.22;
const SIDEBAR_CLOSE_SNAP = 0.64;
const SIDEBAR_FLING_VELOCITY = 520;
const SIDEBAR_PUSH_SPRING = { type: "spring" as const, stiffness: 240, damping: 34, mass: 1.05 };

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const normalizeAttachedUrls = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[\s,]+/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => (/^https?:\/\//i.test(part) ? part : `https://${part}`))
        .filter((part) => {
          try {
            const url = new URL(part);
            return url.protocol === "http:" || url.protocol === "https:";
          } catch {
            return false;
          }
        }),
    ),
  ).slice(0, 8);

const hostnameFromUrl = (value: string) => {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
};

/** Strict extraction of real links typed inside a chat message. */
const extractUrlsFromText = (value: string) =>
  Array.from(
    new Set(
      (value.match(/\b(?:https?:\/\/|www\.)[^\s<>()[\]{}"']+/gi) || []).map((raw) => {
        const cleaned = raw.replace(/[.,;:!?)\]}]+$/, "");
        return /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
      }),
    ),
  ).slice(0, 6);

import { useMobileGreeting } from "./hooks/useMobileGreeting";
import { useChatHeaderUi } from "./hooks/useChatHeaderUi";
import { useChatIdentity } from "./hooks/useChatIdentity";
import { useMessageEdit } from "./hooks/useMessageEdit";
import { useIntegrationsUi } from "./hooks/useIntegrationsUi";
import { useTypingPresence } from "./hooks/useTypingPresence";
import { useMentionDetection } from "./hooks/useMentionDetection";
import { useUserMusic } from "./hooks/useUserMusic";
import { useComposerUploads } from "./hooks/useComposerUploads";
import { useChatEntryEffects } from "./hooks/useChatEntryEffects";
import { useChatUrlState } from "./hooks/useChatUrlState";
import { useChatSocialActions } from "./hooks/useChatSocialActions";
import { useAuthHydration } from "./hooks/useAuthHydration";
import { useEmbedBackfill } from "./hooks/useEmbedBackfill";
import { useOutsideClickToClose } from "./hooks/useOutsideClickToClose";
import { useChatScroll } from "./hooks/useChatScroll";
import { useChatTableLabels } from "@/hooks/useChatTableLabels";
import { useViewportPersistence } from "@/hooks/useViewportPersistence";
import { useReadsAndReactions } from "./hooks/useReadsAndReactions";
import { useUnreadDocumentTitle } from "./hooks/useUnreadDocumentTitle";
import { useRealtimeMembers } from "./hooks/useRealtimeMembers";
import { usePostSignupPrompt } from "./hooks/usePostSignupPrompt";
import { useRealtimeChat } from "./hooks/useRealtimeChat";
import { useSmartQuestionsParser } from "./hooks/useSmartQuestionsParser";
import { useMessageReactionToggle } from "./hooks/useMessageReactionToggle";
import { useKickMember } from "./hooks/useKickMember";
import { useDeleteConversation } from "./hooks/useDeleteConversation";
import { useMessageDerivations } from "./hooks/useMessageDerivations";
import { useIntegrationsFilter } from "./hooks/useIntegrationsFilter";
import { useChatCancel } from "./hooks/useChatCancel";
import { useChatNewChat, useChatModeActions } from "./hooks/useChatLifecycleActions";
import { useMobileModeBarChange } from "./hooks/useMobileModeBarChange";
import { useConnectIntegration } from "./hooks/useConnectIntegration";
import { useMemberColors } from "./hooks/useMemberColors";

// Utils + per-turn services (operator/media/slides/docs/research/chat stream).
import { playNotificationSound } from "./utils/notificationSound";
import { getSeoMeta } from "./data/seoByMode";
import { rowToMessage } from "./services/rowToMessage";
import { loadConversationMembers } from "./services/loadConversationMembers";
// Heavy turn/resume services — dynamic-imported on demand. These only run
// after the user sends a message or when resuming background jobs, so they
// should never be in the initial /chat chunk. Total savings: ~2500 LOC.
const resumeDocsJobs = (...args: Parameters<typeof import("./services/resumeDocsJobs").resumeDocsJobs>) =>
  import("./services/resumeDocsJobs").then((m) => m.resumeDocsJobs(...args));
const resumeSlidesJobs = (...args: Parameters<typeof import("./services/resumeSlidesJobs").resumeSlidesJobs>) =>
  import("./services/resumeSlidesJobs").then((m) => m.resumeSlidesJobs(...args));
const resumeChatJobs = (...args: Parameters<typeof import("./services/resumeChatJobs").resumeChatJobs>) =>
  import("./services/resumeChatJobs").then((m) => m.resumeChatJobs(...args));
const runOperatorTurn = (...args: Parameters<typeof import("./services/runOperatorTurn").runOperatorTurn>) =>
  import("./services/runOperatorTurn").then((m) => m.runOperatorTurn(...args));
const runComputerTurn = (...args: Parameters<typeof import("./services/runComputerTurn").runComputerTurn>) =>
  import("./services/runComputerTurn").then((m) => m.runComputerTurn(...args));
const runMediaTurn = (...args: Parameters<typeof import("./services/runMediaTurn").runMediaTurn>) =>
  import("./services/runMediaTurn").then((m) => m.runMediaTurn(...args));
const runSlidesTurn = (...args: Parameters<typeof import("./services/runSlidesTurn").runSlidesTurn>) =>
  import("./services/runSlidesTurn").then((m) => m.runSlidesTurn(...args));
const runDocsTurn = (...args: Parameters<typeof import("./services/runDocsTurn").runDocsTurn>) =>
  import("./services/runDocsTurn").then((m) => m.runDocsTurn(...args));
const runChatStreamTurn = (...args: Parameters<typeof import("./services/runChatStreamTurn").runChatStreamTurn>) =>
  import("./services/runChatStreamTurn").then((m) => m.runChatStreamTurn(...args));
import {
  generateShortTitle as apiGenerateShortTitle,
  createOrUpdateConversation as apiCreateOrUpdateConversation,
  saveMessage as apiSaveMessage,
  fetchSlidesNarration as apiFetchSlidesNarration,
} from "./services/conversationApi";

// Composed view components owned by the chat page.
// PlusContent (~991 lines) + DraggablePlusSheet only render when the user
// opens the "+" menu — lazy-load them so their chunk is never in the initial
// chat bundle. Chunk is preloaded on hover of the "+" button (see below).
const PlusContent = lazy(() => import("./components/PlusContent"));
const DraggablePlusSheet = lazy(() =>
  import("./components/DraggablePlusSheet").then((m) => ({ default: m.DraggablePlusSheet })),
);
const preloadPlusMenu = () => {
  void import("./components/PlusContent");
  void import("./components/DraggablePlusSheet");
};
// Interaction-gated components — never in the initial /chat chunk. They only
// mount when the user opens a dialog, service panel, or intro; otherwise
// nothing is fetched. Idle preload is done once for the intro on the first
// paint of a fresh chat so it feels instant when it does open.
const MobileServicePanelRenderer = lazy(() =>
  import("./components/MobileServicePanelRenderer").then((m) => ({ default: m.MobileServicePanelRenderer })),
);
const ChatDialogs = lazy(() =>
  import("./components/ChatDialogs").then((m) => ({ default: m.ChatDialogs })),
);
// ChatHiddenFileInputs stays eager — its refs must be attached to the DOM
// on first paint so the "+" menu's file/camera/image buttons work instantly.
import { ChatHiddenFileInputs } from "./components/ChatHiddenFileInputs";
const MegsyOsIntro = lazy(() =>
  import("./components/MegsyOsIntro").then((m) => ({ default: m.MegsyOsIntro })),
);
const ChatGlobalModals = lazy(() =>
  import("./components/ChatGlobalModals").then((m) => ({ default: m.ChatGlobalModals })),
);

import { MobileChatHeaderMount } from "./components/MobileChatHeaderMount";
import { DesktopChatHeader } from "./components/DesktopChatHeader";
import { ChatArtifactsCanvas } from "./components/ChatArtifactsCanvas";
import { ChatMessagesArea, prewarmTranscript } from "./components/ChatMessagesArea";
import { ChatComposerSection } from "./components/ChatComposerSection";
const InlineCoderRun = lazy(() => import("@/components/coder/InlineCoderRun"));
// Decorative aurora background + empty-state greeting are not needed for
// first paint — the greeting only renders when there's no conversation on
// desktop, and the aurora is a pure visual. Lazy-load both so they never
// block the chat surface from becoming interactive.
const DesktopGreeting = lazy(() =>
  import("./components/DesktopGreeting").then((m) => ({ default: m.DesktopGreeting })),
);
import { usePromoBanner } from "@/components/promo/usePromoBanner";
// Desktop chat background video is loaded directly from CDN below
import { getAgentById } from "@/lib/agentRegistry";
import { pathForZone } from "@/lib/zoneRouting";

import { type Message, type ChatMode } from "./chatConstants";
import { DOCS_STATUS_FALLBACKS } from "./chatUtils";

const ChatPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Warm the Pricing route immediately after the chat surface mounts. The
  // pricing star is a top-level chat action, so waiting for requestIdleCallback
  // can still leave fast mobile taps fetching the PricingPage chunk on click.
  // Keep heavier secondary chunks (+ menu, Settings) on idle.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mobileNow = window.matchMedia?.("(max-width: 767px)").matches ?? false;
    const ric = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout?: number }) => number)
      | undefined;
    const run = () => {
      warmEdgeFunctions();
      // The "+" sheet is the most-tapped mobile action — warm it on idle too so
      // the first tap never waits on a network chunk fetch.
      preloadPlusMenu();
      if (!mobileNow) {
        void import("@/pages/marketing/PricingPage").catch(() => {});
        void import("@/pages/settings/SettingsPage").catch(() => {});
      }
    };

    const id = ric ? ric(run, { timeout: mobileNow ? 6500 : 3000 }) : window.setTimeout(run, mobileNow ? 4500 : 1500);
    return () => {
      if (ric && (window as any).cancelIdleCallback) (window as any).cancelIdleCallback(id);
      else clearTimeout(id as number);
    };
  }, []);

  // Never lock html/body here; stale global scroll locks were freezing
  // navigation targets such as settings, apps, and pricing on mobile.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const body = document.body;
    html.style.overflow = "";
    body.style.overflow = "";
    html.style.height = "";
    body.style.height = "";
    body.style.overscrollBehavior = "";
    body.removeAttribute("data-scroll-locked");
  }, []);

  const zoneNavigate = useCallback(
    (to: To | number, options?: NavigateOptions): void => {
      if (typeof to === "number") {
        navigate(to);
        return;
      }
      if (typeof to === "string") {
        navigate(pathForZone(to, location.pathname), options);
        return;
      }
      navigate(to, options);
    },
    [location.pathname, navigate],
  );
  const {
    input,
    setInput,
    messages,
    setMessages,
    isLoading,
    setIsLoading,
    isThinking,
    setIsThinking,
    messagesEndRef,
    messagesContainerRef,
    abortControllerRef,
  } = useChatMessages();
  const {
    sidebarOpen,
    setSidebarOpen,
    showScrollBtn,
    setShowScrollBtn,
    connectorsOpen,
    setConnectorsOpen,
    directoryOpen,
    setDirectoryOpen,
    chatMenuView,
    setChatMenuView,
    megsyOsIntroOpen,
    setMegsyOsIntroOpen,
  } = useChatHeaderUi();
  const sidebarOpenRef = useRef(sidebarOpen);
  useEffect(() => {
    sidebarOpenRef.current = sidebarOpen;
  }, [sidebarOpen]);
  const [sidebarCollapsed] = useSidebarCollapsed();

  const [coderRuns, setCoderRuns] = useState<{
    id: string;
    prompt: string;
    conversationPromise: Promise<string | null>;
    /** Hosted URLs for media the user attached to this Coder turn. */
    attachments?: Array<{ url: string; name?: string; type?: string }>;
  }[]>([]);

  const [coderProjectFiles, setCoderProjectFiles] = useState<Record<string, { path: string; content: string }[]>>({});
  const savedCoderRunIdsRef = useRef<Set<string>>(new Set());

  // A Coder run can end before the model calls `finish` (iteration/token cap).
  // The inline card then offers "Continue", which starts a follow-up run that
  // reuses the accumulated project files as context.
  useEffect(() => {
    const onContinue = (e: Event) => {
      const detail = (e as CustomEvent).detail as { prompt?: string } | undefined;
      const promptText = (detail?.prompt || "Continue the previous build and finish the remaining tasks.").trim();
      const runId = `coder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const conversationPromise = createOrUpdateConversation(promptText).catch(() => null);
      setMessages((prev) => [
        ...prev,
        { role: "user", clientId: `user-coder-${Date.now()}`, content: promptText, mode: "code" } as Message,
      ]);
      setCoderRuns((prev) => [...prev, { id: runId, prompt: promptText, conversationPromise }]);
      void (async () => {
        const cid = await conversationPromise;
        if (!cid) return;
        const insertedId = await saveMessage(cid, "user", promptText).catch(() => undefined);
        if (insertedId) ownInsertedIdsRef.current.add(insertedId);
      })();
    };
    window.addEventListener("megsy:coder-continue", onContinue as EventListener);
    return () => window.removeEventListener("megsy:coder-continue", onContinue as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const isSidebarExpanded = !sidebarCollapsed;
  const desktopSidebarWidth = isSidebarExpanded ? 320 : 60;
  const { plusMenuOpen, setPlusMenuOpen, plusView, setPlusView } =
    usePlusMenu();
  const isMobileViewport = useIsMobile();
  const userLang = useUserLang();
  // Sidebar reveal width for the Claude-style push (mobile). The chat surface
  // translates by this many pixels when the sidebar is opened.
  const [sidebarRevealX, setSidebarRevealX] = useState(0);
  const isRtlUi = RTL_UI_LANGS.has(userLang);
  const sidebarPushX = isRtlUi ? -sidebarRevealX : sidebarRevealX;
  const sidebarX = useMotionValue(0);
  const sidebarProgress = useTransform(sidebarX, (latest) =>
    sidebarRevealX > 0 ? clamp(Math.abs(latest) / sidebarRevealX, 0, 1) : 0,
  );
  const sidebarScale = useTransform(sidebarProgress, [0, 1], [1, 0.94]);
  const sidebarRadius = useTransform(sidebarProgress, [0, 1], [0, 32]);
  const sidebarShadow = useTransform(sidebarProgress, (progress) =>
    progress > 0.02
      ? `0 30px 90px -20px rgba(0,0,0,${0.36 + progress * 0.34}), 0 0 0 1px rgba(255,255,255,${progress * 0.06})`
      : "0 0 0 rgba(0,0,0,0)",
  );
  const sidebarAnimationRef = useRef<{ stop: () => void } | null>(null);
  const edgeDraggingSidebarRef = useRef(false);
  const edgePointerRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    started: boolean;
  } | null>(null);
  const animateSidebarTo = useCallback(
    (open: boolean) => {
      sidebarAnimationRef.current?.stop();
      sidebarAnimationRef.current = animate(
        sidebarX,
        isMobileViewport && open ? sidebarPushX : 0,
        open ? SIDEBAR_PUSH_SPRING : { type: "spring", stiffness: 360, damping: 42, mass: 0.9 },
      );
    },
    [isMobileViewport, sidebarPushX, sidebarX],
  );

  useEffect(() => {
    if (edgeDraggingSidebarRef.current) return;
    animateSidebarTo(sidebarOpen);
    return () => sidebarAnimationRef.current?.stop();
  }, [animateSidebarTo, sidebarOpen]);

  const beginSidebarEdgeDrag = useCallback((pointerId: number, x: number, y: number) => {
    if (!isMobileViewport || sidebarOpenRef.current) return;
    edgePointerRef.current = { pointerId, startX: x, startY: y, lastX: x, started: false };
  }, [isMobileViewport]);

  const updateSidebarEdgeDrag = useCallback((pointerId: number, x: number, y: number) => {
    const drag = edgePointerRef.current;
    if (!drag || drag.pointerId !== pointerId) return false;
    const dx = x - drag.startX;
    const dy = Math.abs(y - drag.startY);
    const directionalDistance = isRtlUi ? -dx : dx;
    drag.lastX = x;

    if (dy > 42 || directionalDistance < -10) {
      edgePointerRef.current = null;
      edgeDraggingSidebarRef.current = false;
      animateSidebarTo(false);
      return false;
    }

    if (!drag.started && directionalDistance > 10 && dy < 22) {
      drag.started = true;
      edgeDraggingSidebarRef.current = true;
      sidebarAnimationRef.current?.stop();
      setSidebarOpen(true);
    }

    if (drag.started) {
      const nextDistance = clamp(directionalDistance, 0, sidebarRevealX);
      sidebarX.set(isRtlUi ? -nextDistance : nextDistance);
      return true;
    }

    return false;
  }, [animateSidebarTo, isRtlUi, setSidebarOpen, sidebarRevealX, sidebarX]);

  const endSidebarEdgeDrag = useCallback((pointerId: number) => {
    const drag = edgePointerRef.current;
    if (!drag || drag.pointerId !== pointerId) return;
    if (drag.started) {
      const dx = drag.lastX - drag.startX;
      const directionalDistance = isRtlUi ? -dx : dx;
      const shouldOpen = directionalDistance >= sidebarRevealX * SIDEBAR_OPEN_SNAP;
      edgeDraggingSidebarRef.current = false;
      setSidebarOpen(shouldOpen);
      animateSidebarTo(shouldOpen);
    }
    edgePointerRef.current = null;
  }, [animateSidebarTo, isRtlUi, setSidebarOpen, sidebarRevealX]);
  useEffect(() => {
    const compute = () =>
      setSidebarRevealX(Math.min(Math.round(window.innerWidth * 0.82), 320));
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);
  // Edge-swipe to open the sidebar is owned by MobilePushShell.
  // A second copy used to run here and fought it for every touch,
  // which made buttons need two taps. Keep exactly one gesture owner.
  // Mobile mode bar visibility. Visible by default on a fresh chat; auto-hides
  // the moment the first user message is sent so the transcript has room.
  // The chevron toggle in the composer lets the user bring it back manually.

  // Dynamic trending suggestions per selected agent. Re-rolled on each agent change.
  const { trendingItems, setTrendingItems, trendingAgentId, setTrendingAgentId } =
    useTrendingSuggestions();
  // Stable greeting per chat-page mount (random index + random accent color)
  const { mobileGreeting, mobileGreetingColor, returningGreetingIdx } = useMobileGreeting();
  // First visit = show original English playful greetings. Subsequent visits = Arabic time-of-day rotation.
  // Source of truth is profiles.chat_greeted (DB). We default to "returning" to avoid flashing
  // the first-time greeting on subsequent visits while the DB lookup is in flight.
  const {
    conversationId,
    setConversationId,
    conversationTitle,
    setConversationTitle,
    isFirstVisit,
    setIsFirstVisit,
    loadingMessages,
    setLoadingMessages,
  } = useConversationMeta();
  // Web search is always enabled. UI toggle removed; setter is a no-op so
  // legacy call sites don't break.
  const searchEnabled = true;
  const setSearchEnabled = (_v: boolean) => {};
  const { mySkills, librarySkills, enabledSkills, toggleEnabled } = useSkills();
  const {
    megsyTier,
    setMegsyTier,
    userPlan,
    setUserPlan,
    selectedModel,
    setSelectedModel,
    tierMenuOpen,
    setTierMenuOpen,
    researchDepth,
    setResearchDepth,
    researchDepthOpen,
    setResearchDepthOpen,
    selectedAgent,
    setSelectedAgent,
  } = useChatTier();
  const {
    chatMode,
    setChatMode,
    operatorRunId,
    setOperatorRunId,
    slidesTemplate,
    setSlidesTemplate,
    slidesPickerOpen,
    setSlidesPickerOpen,
    mediaModel,
    setMediaModel,
    computerUseEnabled,
    setComputerUseEnabled,
  } = useChatModeState();

  // Consume a launch request coming from the /apps page. Reads a one-shot
  // sessionStorage payload set by AppsPage.launch() and applies it as an
  // active chat mode or agent selection.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem("megsy_launch_app");
      if (!raw) return;
      sessionStorage.removeItem("megsy_launch_app");
      const parsed = JSON.parse(raw) as
        | { kind: "mode"; mode: string }
        | { kind: "agent"; agent: string };
      if (parsed?.kind === "mode" && typeof parsed.mode === "string") {
        setSelectedAgent(null);
        setChatMode(parsed.mode as any);
      } else if (parsed?.kind === "agent" && typeof parsed.agent === "string") {
        const agent = getAgentById(parsed.agent);
        if (agent) {
          setChatMode("normal");
          setSelectedAgent(agent);
        }
      }
    } catch {
      /* ignore malformed launch payload */
    }
    // Only run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Agent picked from the model menu ("Agent" entry) — activate the Computer Agent.
  useEffect(() => {
    const onPick = (e: Event) => {
      const id = (e as CustomEvent).detail?.id;
      const agent = id ? getAgentById(id) : null;
      if (!agent) return;
      setChatMode("normal");
      setSelectedAgent(agent);
      setSelectedModel(null);
    };
    window.addEventListener("megsy:select-agent", onPick);
    return () => window.removeEventListener("megsy:select-agent", onPick);
  }, [setChatMode, setSelectedAgent, setSelectedModel]);

  const {
    videoStartEndMode,
    setVideoStartEndMode,
    videoDurationSec,
    setVideoDurationSec,
    startFrameUrl,
    setStartFrameUrl,
    endFrameUrl,
    setEndFrameUrl,
    frameUploading,
    setFrameUploading,
  } = useVideoFrames();
  const { upload: uploadFrame } = useMediaUpload();
  const { attachedFiles, setAttachedFiles, fileInputRef, cameraInputRef, imageInputRef } =
    useAttachments();
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const handleAddLinks = useCallback(
    (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const urls = normalizeAttachedUrls(linkInput);
      if (urls.length === 0) {
        toast.error("Enter a valid link");
        return;
      }
      setAttachedFiles((prev) => {
        const seen = new Set(prev.filter((item) => item.type === "link").map((item) => item.data));
        const nextLinks = urls
          .filter((url) => !seen.has(url))
          .map((url) => ({ name: hostnameFromUrl(url), type: "link", data: url }));
        return [...prev, ...nextLinks];
      });
      setLinkInput("");
      setLinkDialogOpen(false);
    },
    [linkInput, setAttachedFiles],
  );
  const {
    searchStatus,
    setSearchStatus,
    toolActivity,
    setToolActivity,
    parallelTasks,
    setParallelTasks,
    narrations,
    setNarrations,
    clarifyQs,
    setClarifyQs,
  } = useToolActivity();
  const docsStatusTimerRef = useRef<number | null>(null);
  const {
    shareDialogOpen,
    setShareDialogOpen,
    shareMode,
    setShareMode,
    isShared,
    setIsShared,
    shareId,
    setShareId,
    generatedShareUrl,
    setGeneratedShareUrl,
  } = useShareDialog();
  const {
    isRenaming,
    setIsRenaming,
    renameValue,
    setRenameValue,
    isPinned,
    setIsPinned,
    isDeleting,
    setIsDeleting,
  } = useChatRename();
  const {
    pendingQuestions,
    setPendingQuestions,
    activeResearchJobId,
    setActiveResearchJobId,
  } = usePendingQuestions();
  const {
    inviteDialogOpen,
    setInviteDialogOpen,
    inviteEmail,
    setInviteEmail,
    inviteLoading,
    setInviteLoading,
    inviteLink,
    setInviteLink,
    members,
    setMembers,
  } = useInviteDialog();
  const {
    conversationOwnerId,
    setConversationOwnerId,
    chatUserId,
    setChatUserId,
    userName,
    setUserName,
  } = useChatIdentity();
  const {
    typingUsers,
    setTypingUsers,
    remoteAiBusy,
    setRemoteAiBusy,
    onlineUsers,
    setOnlineUsers,
    systemEvents,
    setSystemEvents,
    unreadCount,
    setUnreadCount,
    newMessagesCount,
    setNewMessagesCount,
    originalTitleRef,
    presenceChannelRef,
    markedReadRef,
  } = useChatPresence();

  const {
    messageReads,
    setMessageReads,
    messageReactions,
    setMessageReactions,
    reactionPickerFor,
    setReactionPickerFor,
  } = useChatReactions();
  // Mentions handled by useMentionDetection (declared after members are ready below).

  const {
    studyMusic,
    setStudyMusic,
    readAloud,
    setReadAloud,
    studyTimers,
    setStudyTimers,
    timerInputMin,
    setTimerInputMin,
    studyAudioRef,
    musicFileInputRef,
  } = useStudyMode();
  const {
    userTracks,
    uploadingMusic,
    loadUserTracks,
    playUserTrack,
    handleMusicUpload,
    deleteUserTrack,
  } = useUserMusic({
    studyAudioRef,
    studyMusicKind: studyMusic.kind,
    setStudyMusic,
  });
  const {
    userIntegrations,
    setUserIntegrations,
    refreshIntegrations,
    connectingApp,
    setConnectingApp,
    integrationsQuery,
    setIntegrationsQuery,
    integrationsCategory,
    setIntegrationsCategory,
    brokenLogos,
    setBrokenLogos,
  } = useIntegrationsUi();

  // Megsy OS is restricted to Pro plans and above.
  const isProPlusPlan = useCallback(
    () => isPaidUser(userPlan),
    [userPlan],
  );

  const tryActivateMegsyOs = useCallback(() => {
    if (!isProPlusPlan()) {
      toast.info("Megsy OS is available on Pro plans and above");
      setPlusMenuOpen(false);
      setMegsyOsIntroOpen(true);
      return false;
    }
    const seen =
      typeof window !== "undefined" && localStorage.getItem("megsy_os_intro_seen") === "1";
    if (!seen) {
      setPlusMenuOpen(false);
      setMegsyOsIntroOpen(true);
      return false;
    }
    handleModeChange("operator");
    setPlusMenuOpen(false);
    return true;
  }, [isProPlusPlan, navigate]);

  const resetToolUi = useCallback(() => {
    setSearchStatus("");
    setToolActivity(null);
    setParallelTasks([]);
  }, []);

  const stopDocsStatusFallback = useCallback(() => {
    if (docsStatusTimerRef.current !== null) {
      window.clearInterval(docsStatusTimerRef.current);
      docsStatusTimerRef.current = null;
    }
  }, []);

  const slidesTimeoutsRef = useRef<Record<string, number>>({});
  const slidesGenerationTokenRef = useRef(0);
  const clearSlidesTimeout = useCallback((jobId: string) => {
    const timer = slidesTimeoutsRef.current[jobId];
    if (timer) window.clearTimeout(timer);
    delete slidesTimeoutsRef.current[jobId];
  }, []);

  const startDocsStatusFallback = useCallback(() => {
    stopDocsStatusFallback();
    let index = 0;
    setSearchStatus(DOCS_STATUS_FALLBACKS[index]);
    docsStatusTimerRef.current = window.setInterval(() => {
      index = Math.min(index + 1, DOCS_STATUS_FALLBACKS.length - 1);
      setSearchStatus(DOCS_STATUS_FALLBACKS[index]);
    }, 4500);
  }, [stopDocsStatusFallback]);

  useEffect(
    () => () => {
      stopDocsStatusFallback();
      Object.values(slidesTimeoutsRef.current).forEach((timer) => window.clearTimeout(timer));
      slidesTimeoutsRef.current = {};
    },
    [stopDocsStatusFallback],
  );

  const pushNarration = useCallback((text: string) => {
    const t = String(text || "").trim();
    if (!t) return;
    setNarrations((prev) => (prev[prev.length - 1] === t ? prev : [...prev, t]));
  }, []);

  const buildInitialResearchNarration = useCallback((text: string) => {
    const topic = (text || "Deep Research").trim().replace(/\s+/g, " ").slice(0, 90);
    return `On it — digging into "${topic}" now. I'll pull real sources and walk you through what I find.`;
  }, []);

  const buildFinalResearchNarration = useCallback((_text: string) => {
    return "Done — sources gathered, cross-checked, and written up. Open the preview to read it.";
  }, []);

  // Fetch user info for memory + welcome message
  useAuthHydration({
    setChatUserId,
    setUserName,
    setUserPlan,
    setIsFirstVisit,
    setMegsyTier,
  });

  // Reset plus menu sub-view whenever it closes
  useEffect(() => {
    if (!plusMenuOpen) {
      setPlusView("main");
    }
  }, [plusMenuOpen]);

  // One-time semantic backfill for legacy data (no-op after the first run).
  useEmbedBackfill();

  // Hydrate HITL approval cache from Supabase once we know the user id.
  useEffect(() => {
    if (!chatUserId) return;
    void import("./hitl/hitlStorage").then((m) => m.hydrateHitlCache(chatUserId));
  }, [chatUserId]);

  // Close the plus-menu on any outside click (desktop popover + mobile sheet).
  useOutsideClickToClose({
    open: plusMenuOpen,
    onClose: () => setPlusMenuOpen(false),
    keepOpenSelectors: ["[data-plus-menu]", "[data-plus-trigger]", "[data-vaul-drawer]"],
    modes: ["click"],
  });

  // Close the tier menu on any outside click.
  useOutsideClickToClose({
    open: tierMenuOpen,
    onClose: () => setTierMenuOpen(false),
    keepOpenSelectors: ["[data-tier-menu]", "[data-tier-trigger]"],
    modes: ["click"],
  });

  const { setHidden: setPromoBannerHidden } = usePromoBanner();

  // Hide the promo banner inside any active conversation (existing or newly
  // started) and restore it when the user leaves an empty chat so it remains
  // visible on other routes.
  useEffect(() => {
    setPromoBannerHidden(Boolean(conversationId) || messages.length > 0);
    return () => setPromoBannerHidden(false);
  }, [conversationId, messages.length, setPromoBannerHidden]);

  // Reactive aurora: map chat activity onto a body[data-chat-state] so the
  // background colors visibly respond when the user sends a message, the
  // assistant is thinking, or media is being generated.
  useEffect(() => {
    const body = document.body;
    if (isMobileViewport) {
      body.removeAttribute("data-chat-state");
      body.setAttribute("data-chat-mode", chatMode || "normal");
      return () => {
        body.removeAttribute("data-chat-state");
        body.removeAttribute("data-chat-mode");
      };
    }
    let state: "idle" | "sending" | "thinking" | "generating" = "idle";
    if (isThinking) state = "thinking";
    else if (isLoading) {
      const m = chatMode;
      state = m === "images" || m === "video" || m === "slides" || m === "slides-images"
        ? "generating"
        : "sending";
    }
    if (state === "idle") body.removeAttribute("data-chat-state");
    else body.setAttribute("data-chat-state", state);
    body.setAttribute("data-chat-mode", chatMode || "normal");
    return () => {
      body.removeAttribute("data-chat-state");
      body.removeAttribute("data-chat-mode");
    };
  }, [isLoading, isThinking, chatMode, isMobileViewport]);

  const { handleScroll, scrollToBottom } = useChatScroll({
    messages,
    isLoading,
    messagesContainerRef,
    messagesEndRef,
    setShowScrollBtn,
    setNewMessagesCount,
  });

  // Universal markdown-table label injection (mobile stacked cards) and
  // scroll-position persistence across viewport / orientation changes so
  // switching mobile ↔ desktop keeps the user on the same message.
  useChatTableLabels(messagesContainerRef);
  useViewportPersistence(messagesContainerRef);

  // Thin wrappers around services/conversationApi.ts so call sites stay terse
  // and the page is not littered with supabase plumbing.
  const generateShortTitle = useCallback(
    (firstMessage: string, convId: string) =>
      apiGenerateShortTitle(firstMessage, convId, setConversationTitle),
    [setConversationTitle],
  );

  const createOrUpdateConversation = useCallback(
    (firstMessage: string) =>
      apiCreateOrUpdateConversation(firstMessage, {
        conversationId,
        chatMode,
        setConversationId,
        setConversationTitle,
      }),
    [conversationId, chatMode, setConversationId, setConversationTitle],
  );

  const saveMessage = useCallback(apiSaveMessage, []);
  const fetchSlidesNarration = useCallback(apiFetchSlidesNarration, []);

  /**
   * Inserts a freeform assistant narration into the transcript (slides plan/summary).
   * Persists to DB and updates local state, optionally before a placeholder bubble
   * so chronological order (user → plan → placeholder) is preserved.
   */
  const insertAssistantNarration = useCallback(
    async (
      convId: string | null,
      content: string,
      beforeClientId?: string,
      meta?: { slidesOutline?: import("@/lib/slidesOutlineParser").SlidesOutline } & Record<
        string,
        any
      >,
    ) => {
      if (!content?.trim()) return;
      const text = content.trim();
      let id: string | undefined;
      if (convId) {
        id = await saveMessage(convId, "assistant", text, undefined, meta);
        if (id) ownInsertedIdsRef.current.add(id);
      }
      const newMsg = {
        id: id || `narration-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role: "assistant",
        content: text,
        ...(meta || {}),
      } as Message;
      setMessages((prev) => {
        if (!beforeClientId) return [...prev, newMsg];
        const idx = prev.findIndex((m) => m.clientId === beforeClientId);
        if (idx < 0) return [...prev, newMsg];
        return [...prev.slice(0, idx), newMsg, ...prev.slice(idx)];
      });
    },
    [saveMessage, setMessages],
  );

  /**
   * Generates the actual deck from an approved plan (outline + deep-research
   * findings + imported file data + reviewed content).
   */
  const startSlidesFromPlan = useCallback(
    async (plan: import("@/lib/slides/planTypes").SlidesPlanState) => {
      const { buildSlidesBrief } = await import("@/lib/slides/buildBrief");
      const localTurnId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "", clientId: `assistant-${localTurnId}`, mode: "slides" },
      ]);
      setIsLoading(true);
      setIsThinking(true);
      await runSlidesTurn({
        userInput: plan.topic,
        localTurnId,
        chatUserId,
        slidesTemplate: plan.templateId || slidesTemplate,
        setChatMode,
        setSearchEnabled,
        setIsLoading,
        setIsThinking,
        resetToolUi,
        setMessages,
        setSearchStatus,
        createOrUpdateConversation,
        saveMessage,
        ownInsertedIdsRef,
        fetchSlidesNarration,
        insertAssistantNarration,
        clearSlidesTimeout,
        slidesTimeoutsRef,
        slidesGenerationTokenRef,
        skipUserSave: true,
        brief: buildSlidesBrief(plan),
        plan,
      });
      setIsLoading(false);
      setIsThinking(false);
    },
    [
      chatUserId,
      slidesTemplate,
      setChatMode,
      setSearchEnabled,
      setIsLoading,
      setIsThinking,
      resetToolUi,
      setMessages,
      setSearchStatus,
      createOrUpdateConversation,
      saveMessage,
      fetchSlidesNarration,
      insertAssistantNarration,
      clearSlidesTimeout,
    ],
  );

  // The plan card asks for generation through a window event so the deep
  // component tree doesn't need prop drilling.
  useEffect(() => {
    const onGenerate = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        plan?: import("@/lib/slides/planTypes").SlidesPlanState;
      };
      if (detail?.plan) void startSlidesFromPlan(detail.plan);
    };
    window.addEventListener("megsy:slides-generate", onGenerate);
    return () => window.removeEventListener("megsy:slides-generate", onGenerate);
  }, [startSlidesFromPlan]);
  /**
   * Returns the HTML of the most recent document generated in this
   * conversation, so follow-up edits keep the same file instead of starting
   * from scratch. Falls back to the local artifact cache.
   */
  const getLastDocHtml = useCallback(async (): Promise<string | null> => {
    const last = [...messages].reverse().find((m) => m.docsArtifact);
    if (!last?.docsArtifact) return null;
    if (last.docsArtifact.html) return last.docsArtifact.html;
    try {
      const { loadDocHtml } = await import("@/lib/agent/docs/htmlCache");
      return loadDocHtml(last.docsArtifact.artifactId) || null;
    } catch {
      return null;
    }
  }, [messages]);


  /**
   * Step 4 of the docs workflow: writes the real file from an approved plan
   * (outline + deep-research references + imported file data + reviewed text),
   * revising the previously generated document when there is one.
   */
  const startDocsFromPlan = useCallback(
    async (plan: import("@/lib/docs/planTypes").DocsPlanState) => {
      const { buildDocsBrief } = await import("@/lib/docs/buildBrief");
      const localTurnId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "", clientId: `assistant-${localTurnId}` },
      ]);
      setIsLoading(true);
      setIsThinking(true);
      const previousHtml = await getLastDocHtml();
      await runDocsTurn({
        userInput: plan.topic,
        localTurnId,
        chatUserId,
        navigate: zoneNavigate,
        messages,
        setMessages,
        setSearchStatus,
        setIsLoading,
        setIsThinking,
        resetToolUi,
        startDocsStatusFallback,
        stopDocsStatusFallback,
        createOrUpdateConversation,
        saveMessage,
        ownInsertedIdsRef,
        skipUserSave: true,
        brief: buildDocsBrief(plan, previousHtml || undefined),
        previousHtml: previousHtml || undefined,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatUserId, messages, zoneNavigate],
  );

  useEffect(() => {
    const onDocsGenerate = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        plan?: import("@/lib/docs/planTypes").DocsPlanState;
      };
      if (detail?.plan) void startDocsFromPlan(detail.plan);
    };
    window.addEventListener("megsy:docs-generate", onDocsGenerate);
    return () => window.removeEventListener("megsy:docs-generate", onDocsGenerate);
  }, [startDocsFromPlan]);


  /**
   * "عدّل السلايد 3 …" — rewrites a single slide of the latest plan and
   * regenerates the deck from the updated plan, preserving everything else.
   */
  const runSlidesSlideEdit = useCallback(
    async (
      intent: { slideNumber: number; instruction: string },
      plan: import("@/lib/slides/planTypes").SlidesPlanState,
      localTurnId: string,
    ) => {
      const idx = intent.slideNumber - 1;
      const step = plan.outline?.steps?.[idx];
      if (!step) {
        toast.error(
          plan.language === "ar"
            ? `There is no slide number ${intent.slideNumber}`
            : `There is no slide ${intent.slideNumber}`,
        );
        setIsLoading(false);
        setIsThinking(false);
        return;
      }
      const { reviseSingleSlide } = await import("@/lib/slides/generateOutline");
      const revised = await reviseSingleSlide({
        slideNumber: intent.slideNumber,
        currentTitle: step.title,
        currentBody: plan.content?.[idx]?.body || (step.items || []).join(" "),
        instruction: intent.instruction,
        topic: plan.topic,
        language: plan.language,
        userId: chatUserId || undefined,
      }).catch(() => null);
      if (!revised) {
        toast.error(plan.language === "ar" ? "Could not edit that slide" : "Could not edit that slide");
        setIsLoading(false);
        setIsThinking(false);
        return;
      }
      const nextPlan: import("@/lib/slides/planTypes").SlidesPlanState = {
        ...plan,
        outline: {
          ...plan.outline,
          steps: plan.outline.steps.map((s, i) =>
            i === idx ? { title: revised.title, items: [revised.body] } : s,
          ),
        },
        content: plan.content?.length
          ? plan.content.map((c, i) => (i === idx ? revised : c))
          : undefined,
      };
      setMessages((prev) =>
        prev.map((m) =>
          m.clientId === `assistant-${localTurnId}`
            ? {
                ...m,
                content:
                  plan.language === "ar"
                    ? `Updated slide ${intent.slideNumber} and regenerated the deck with the rest unchanged.`
                    : `Updated slide ${intent.slideNumber} and regenerating the deck.`,
                slidesPlan: { ...nextPlan, stage: "generating" },
                mode: "slides",
              }
            : m,
        ),
      );
      await startSlidesFromPlan(nextPlan);
    },
    [chatUserId, setMessages, setIsLoading, setIsThinking, startSlidesFromPlan],
  );


  // Stable per-user color palette resolver (hash → palette).
  const colorForUser = useMemberColors();

  const handleLikeMessage = useCallback(
    (index: number, liked: boolean | null) => {
      setMessages((prev) => {
        const msg = prev[index];
        if (msg) {
          // Fire-and-forget persistence to message_feedback (RLS scopes to auth.uid()).
          (async () => {
            try {
              const { data: userData } = await supabase.auth.getUser();
              const uid = userData?.user?.id;
              const messageId = msg.id || msg.clientId;
              if (!uid || !messageId) return;
              const projectId = conversationId || "chat";
              if (liked === null) {
                await supabase
                  .from("message_feedback")
                  .delete()
                  .eq("user_id", uid)
                  .eq("project_id", projectId)
                  .eq("message_id", messageId);
              } else {
                await supabase.from("message_feedback").upsert(
                  {
                    user_id: uid,
                    project_id: projectId,
                    message_id: messageId,
                    value: liked ? "up" : "down",
                  },
                  { onConflict: "user_id,project_id,message_id" },
                );
              }
            } catch {
              /* best effort */
            }
          })();
        }
        return prev.map((m, i) => (i === index ? { ...m, liked } : m));
      });
    },
    [conversationId],
  );

  const loadConversation = async (id: string) => {
    setConversationId(id);
    resetToolUi();
    setPendingQuestions([]);
    setNarrations([]);
    setClarifyQs(null);
    setLoadingMessages(true);
    setMessages([]);
    setSystemEvents([]);
    const { data: conv } = await supabase
      .from("conversations")
      .select("title, is_shared, share_id, is_pinned, mode, user_id")
      .eq("id", id)
      .single();
    if (conv) {
      setConversationTitle(conv.title || "Untitled");
      setIsShared(conv.is_shared || false);
      setShareId(conv.share_id || null);
      setShareMode(conv.is_shared ? "public" : "private");
      setIsPinned(!!conv.is_pinned);
      setConversationOwnerId((conv as any).user_id || null);
      const m = (conv as any).mode as string | undefined;
      if (m === "research") setChatMode("deep-research");
      else if (m === "learning") setChatMode("learning");
      else if (m === "shopping") setChatMode("shopping");
      else if (m === "slides") setChatMode("slides");
      else setChatMode("normal");
    }
    // Bump conversation to top of recent list (works for owner and members via RPC)
    supabase.rpc("bump_conversation" as any, { p_conversation_id: id }).then(() => {});
    const { data: msgs } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });
    if (msgs) {
      const senderIds = Array.from(new Set(msgs.map((m: any) => m.user_id).filter(Boolean)));
      const senderMap: Record<string, { name: string | null; avatar: string | null }> = {};
      if (senderIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", senderIds as string[]);
        (profs || []).forEach((p: any) => {
          senderMap[p.id] = { name: p.display_name, avatar: p.avatar_url };
        });
      }
      const messageIds = msgs.map((m: any) => m.id).filter(Boolean);
      const feedbackByMessageId: Record<string, boolean | null> = {};
      if (messageIds.length > 0) {
        const { data: feedbackRows } = await supabase
          .from("message_feedback")
          .select("message_id, value")
          .eq("project_id", id)
          .in("message_id", messageIds as string[]);
        (feedbackRows || []).forEach((row: any) => {
          feedbackByMessageId[row.message_id] = row.value === "up" ? true : row.value === "down" ? false : null;
        });
      }
      setMessages(
        msgs
          .map((m: any) => rowToMessage(m, senderMap, (conv as any)?.mode, feedbackByMessageId))
          .filter(Boolean) as Message[],
      );
      setTimeout(() => scrollToBottom(), 150);

      // Re-attach to any in-flight background jobs (docs / slides / chat).
      void resumeDocsJobs({ msgs, setMessages });
      void resumeSlidesJobs({
        msgs,
        setMessages,
        slidesTimeoutsRef,
        clearSlidesTimeout,
      });
      void resumeChatJobs({
        conversationId: id,
        msgs,
        setMessages,
        ownInsertedIdsRef,
        saveMessage,
      });
    }
    // Load members so sender names/avatars render correctly.
    setMembers(await loadConversationMembers(id));
    setLoadingMessages(false);
  };

  // Cross-component "open this conversation" bridge (used by Continue-last-chat
  // card, share/remix flows). Keeps ContinueLastChatCard decoupled from ChatPage.
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail?.id as string | undefined;
      if (id) void loadConversation(id);
    };
    window.addEventListener("megsy:open-conversation", handler as EventListener);
    return () => window.removeEventListener("megsy:open-conversation", handler as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prefill composer bridge — used by Coder "Fix with AI" runtime error banner
  // and other cards that need to hand text to the composer.
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent).detail?.text as string | undefined;
      if (typeof text === "string" && text.length) {
        setInput(text);
        // Put the caret in the composer so the handed-over text is obviously
        // editable and one Enter away from being sent.
        requestAnimationFrame(() => {
          const el = document.querySelector<HTMLTextAreaElement>("textarea[data-chat-composer], form textarea");
          el?.focus();
          try { el?.setSelectionRange(text.length, text.length); } catch { /* ignore */ }
        });
      }
    };
    window.addEventListener("megsy:prefill-composer", handler as EventListener);
    return () => window.removeEventListener("megsy:prefill-composer", handler as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Remix handoff from SharedChatPage: read the shared prompt from
  // sessionStorage on mount when the URL carries `?remix=1`, pre-fill the
  // composer, then clean up so a page reload doesn't repopulate.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("remix") !== "1") return;
    try {
      const prompt = sessionStorage.getItem("megsy:remix-prompt");
      if (prompt) {
        setInput(prompt);
        sessionStorage.removeItem("megsy:remix-prompt");
        // Strip the query param without navigating.
        params.delete("remix");
        const next = window.location.pathname + (params.toString() ? `?${params}` : "");
        window.history.replaceState({}, "", next);
      }
    } catch { /* storage disabled */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the URL in sync with the open conversation (`/chat?c=<id>`) so a
  // refresh, a shared link or a restored tab reopens the same thread — which
  // is what preserves Coder project files and context across reloads.
  useEffect(() => {
    if (typeof window === "undefined" || !conversationId) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("c") === conversationId) return;
    params.set("c", conversationId);
    window.history.replaceState({}, "", `${window.location.pathname}?${params}`);
  }, [conversationId]);

  // On first mount, reopen the conversation referenced by `?c=<id>`.
  const restoredFromUrlRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined" || restoredFromUrlRef.current) return;
    const id = new URLSearchParams(window.location.search).get("c");
    if (!id || id === conversationId) return;
    restoredFromUrlRef.current = true;
    void loadConversation(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);







  const handleCancel = useChatCancel({
    abortControllerRef,
    activeResearchJobId,
    setActiveResearchJobId,
    chatMode,
    setChatMode,
    setSearchEnabled,
    messages,
    setMessages,
    slidesGenerationTokenRef,
    clearSlidesTimeout,
    failStaleJob,
    conversationId,
    setIsLoading,
    setIsThinking,
    resetToolUi,
    saveMessage,
  });

  const { handleModeChange, handleSearchToggle } = useChatModeActions({
    chatMode,
    setChatMode,
    setStudyTimers,
    setStudyMusic,
    setSearchEnabled,
    searchEnabled,
    mediaModel,
    setMediaModel,
    setTierMenuOpen,
    setPlusMenuOpen,
  });

  // Sync chatMode with `?mode=` deep links — extracted to ./hooks/useUrlMode.
  useUrlMode({ chatMode, setChatMode, setSearchEnabled });

  const handleStructuredAction = useCallback((text: string) => {
    if (text.startsWith("Connect:")) {
      setConnectorsOpen(true);
      return;
    }
    if (text.trim().startsWith("[LEARN_ANSWER]") || text.trim().startsWith("[LEARN_CHOICE]")) {
      void sendWithTextRef.current?.(text);
      return;
    }
    setInput(text);
    setTimeout(() => {
      setInput(text);
      void sendWithTextRef.current?.(text);
    }, 50);
  }, []);

  // Parse JSON "questions" blocks from the latest assistant message.
  useSmartQuestionsParser({ messages, isLoading, setPendingQuestions });

  const handleQuestionAnswer = (answer: string) => {
    setPendingQuestions([]);
    handleSendWithText(answer);
  };

  const handleQuestionSkip = () => {
    setPendingQuestions([]);
  };

  const isSubmittingRef = useRef(false);
  // Timestamp of the current send lock. If any branch forgets to release the
  // lock (thrown error, early return), the composer used to stay frozen until
  // a reload — the "send button hangs" bug. A stale lock is now ignored.
  const submitLockAtRef = useRef(0);
  const sendWithTextRef = useRef<((overrideText?: string) => Promise<void>) | undefined>(undefined);

  const ownInsertedIdsRef = useRef<Set<string>>(new Set());

  // Last message that expressed a "do this on a real computer" intent, so a
  // short follow-up like "تمام يلا" still launches the computer task.
  const pendingComputerIntentRef = useRef<string | null>(null);

  // Unified service router: holds the message that should be re-sent as soon
  // as the routed mode is applied (setChatMode is async).
  const pendingAutoSendRef = useRef<{ text: string; mode: ChatMode } | null>(null);


  const handleSendWithText = async (overrideText?: string) => {
    try {
      await handleSendWithTextInner(overrideText);
    } catch (err) {
      // Any unhandled failure must still release the composer.
      isSubmittingRef.current = false;
      console.error("[send] unhandled error", err);
      toast.error("حصلت مشكلة أثناء الإرسال. جرّب تاني.");
    }
  };

  const handleSendWithTextInner = async (overrideText?: string) => {
    const text = overrideText || input;
    const isLearningAnswer =
      chatMode === "learning" &&
      (text.trim().startsWith("[LEARN_ANSWER]") || text.trim().startsWith("[LEARN_CHOICE]"));
    const hasFrames = chatMode === "video" && videoStartEndMode && !!startFrameUrl && !!endFrameUrl;
    if (!text.trim() && attachedFiles.length === 0 && !hasFrames) return;
    if (isLoading) return;
    if (isSubmittingRef.current) {
      // Release locks older than a minute instead of blocking forever.
      if (Date.now() - submitLockAtRef.current < 60_000) return;
      isSubmittingRef.current = false;
    }
    // Streak/achievement bookkeeping is telemetry, not part of the send path.
    // It used to be `await`ed here, which meant the user's own bubble could not
    // render until two lazy chunks finished downloading — the single biggest
    // cause of "the first message takes seconds to appear". Now it runs
    // detached so the UI reacts on the same frame as the tap.
    void (async () => {
      try {
        const [{ bumpStreak }, { track }] = await Promise.all([
          import("@/lib/streaks"),
          import("@/lib/achievements"),
        ]);
        try {
          const lang = (typeof navigator !== "undefined" && navigator.language) || "en";
          track("message_sent", { lang: lang.split("-")[0] });
        } catch {}
        try {
          if (chatMode === "images") track("image_generated");
          else if (chatMode === "deep-research") track("research_started");
          else if (chatMode === "code") track("code_ran");
          else if (chatMode === "slides" || chatMode === "slides-images") track("slides_created");
        } catch {}
        bumpStreak();
      } catch { /* non-fatal */ }
    })();

    // Guard: oversized prompts are almost always a paste accident — refuse
    // early with a clear message instead of letting the request fail server-side.
    if (text.length > MAX_CHAT_MESSAGE_CHARS) {
      toast.error(
        `Message is too long (${text.length.toLocaleString()} chars). Max is ${MAX_CHAT_MESSAGE_CHARS.toLocaleString()}.`,
      );
      return;
    }





    // Premium modes require an authenticated user. Normal/learning/shopping
    // chat stays fully public so anyone can try the product without sign-up.
    const PROTECTED_MODES: ChatMode[] = [
      "deep-research",
      "slides",
      "slides-images",
      "operator",
      "images",
      "video",
    ];
    if (PROTECTED_MODES.includes(chatMode) && !chatUserId) {
      toast.error("Please sign in to use this feature.");
      zoneNavigate(
        `/auth?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      );
      return;
    }

    // Code mode → run the inline Megsy Coder agent (Replit/Lovable style) inside the chat feed.
    if (chatMode === "code" && text.trim()) {
      // Subscribers-only gate for the Coder builder — uses the single source
      // of truth for paid-plan membership (`intentActions.isPaidPlan`) so
      // gates never drift out of sync across the chat surface.
      if (!isPaidUser(userPlan)) {

        if (!chatUserId) {
          toast.error("Sign in and subscribe to use Coder mode.");
          zoneNavigate(
            `/auth?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`,
          );
          return;
        }
        setMessages((prev) => [
          ...prev,
          {
            role: "user",
            clientId: `user-code-paywall-${Date.now()}`,
            content: text,
            mode: "code",
          } as Message,
          {
            role: "assistant",
            clientId: `assist-code-paywall-${Date.now()}`,
            content:
              "🔒 Coder mode is available to subscribers only. Upgrade your plan to start building full sites and apps inside chat.",
            mode: "code",
            paywall: { feature: "code" },
          } as Message,
        ]);
        setInput("");
        zoneNavigate("/pricing");
        return;
      }

      const promptText = text.trim();
      const runId = `coder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const userClientId = `user-coder-${Date.now()}`;
      const conversationPromise = createOrUpdateConversation(promptText).catch(() => null);
      const userMsg: Message = {
        role: "user",
        clientId: userClientId,
        content: promptText,
        mode: "code",
      } as Message;
      setMessages((prev) => [...prev, userMsg]);
      // Host any attached media so Coder can embed the real URLs in the site.
      let coderAttachments: Array<{ url: string; name?: string; type?: string }> = [];
      if (attachedFiles.length > 0) {
        const { uploadAttachmentDataUrl } = await import("@/lib/coderAssets");
        const uploaded = await Promise.all(
          attachedFiles
            .filter((f) => f.type === "image" || f.type === "video")
            .map(async (f) => {
              const url = await uploadAttachmentDataUrl(f.data, f.name);
              return url ? { url, name: f.name, type: f.type } : null;
            }),
        );
        coderAttachments = uploaded.filter(Boolean) as typeof coderAttachments;
        setAttachedFiles([]);
      }
      setCoderRuns((prev) => [
        ...prev,
        { id: runId, prompt: promptText, conversationPromise, attachments: coderAttachments },
      ]);
      setInput("");

      void (async () => {
        const resolvedConversationId = await conversationPromise;
        if (!resolvedConversationId) return;
        const insertedId = await saveMessage(resolvedConversationId, "user", promptText).catch(() => undefined);
        if (insertedId) {
          ownInsertedIdsRef.current.add(insertedId);
          window.dispatchEvent(new CustomEvent("megsy:conversations-changed"));
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.clientId === userClientId);
            if (idx < 0) return prev;
            const next = [...prev];
            next[idx] = { ...next[idx], id: insertedId, user_id: chatUserId || undefined };
            return next;
          });
        }
      })();
      return;
    }


    // Subscribers-only gate for media generation (images / video). Uses the
    // shared `isPaidPlan` helper so this list stays in one place.
    const SUBSCRIBER_MODES: ChatMode[] = ["video"];
    const isPaidPlan = isPaidUser(userPlan);


    // ── No auto-routing in normal chat ───────────────────────────────
    // A normal-mode message stays in normal mode. When the user asks for
    // images, video or deep research inside a plain chat, the model's own
    // tools handle it — we never flip the service chips, re-send the text or
    // interrupt the turn with a routing toast. Service modes are only entered
    // when the user explicitly taps a chip.


    if (SUBSCRIBER_MODES.includes(chatMode) && !isPaidPlan) {
      const feature: "images" | "video" | "code" =
        chatMode === "video" ? "video" : chatMode === "images" ? "images" : "code";
      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          clientId: `user-paywall-${Date.now()}`,
          content: text,
          mode: chatMode,
        } as Message,
        {
          role: "assistant",
          clientId: `assist-paywall-${Date.now()}`,
          content: "",
          mode: chatMode,
          paywall: { feature },
        } as Message,
      ]);
      setInput("");
      isSubmittingRef.current = false;
      return;
    }

    if (chatMode === "images" && (mediaModel as any)?.isPremium && !isPaidPlan) {
      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          clientId: `user-image-premium-paywall-${Date.now()}`,
          content: text,
          mode: chatMode,
        } as Message,
        {
          role: "assistant",
          clientId: `assist-image-premium-paywall-${Date.now()}`,
          content: "",
          mode: chatMode,
          paywall: { feature: "images" },
        } as Message,
      ]);
      setInput("");
      isSubmittingRef.current = false;
      return;
    }

    isSubmittingRef.current = true;
    submitLockAtRef.current = Date.now();

    const pendingAttachments = attachedFiles.filter(
      (f) => f.data.startsWith("__parsing_") || f.data.startsWith("__uploading_"),
    );
    if (pendingAttachments.length > 0) {
      toast.info("Please wait until attachments finish processing");
      isSubmittingRef.current = false;
      return;
    }

    const imageAttachments = attachedFiles.filter((f) => f.type === "image");
    const videoAttachments = attachedFiles.filter(
      (f) => f.type === "video" && !f.data.startsWith("__uploading_"),
    );
    const fileAttachments = attachedFiles.filter((f) => f.type === "file");
    const linkAttachments = attachedFiles.filter((f) => f.type === "link");
    const localTurnId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
    const userMsg: Message = {
      role: "user",
      clientId: `user-${localTurnId}`,
      content:
        text || (attachedFiles.length > 0 ? `[${attachedFiles.length} attachment(s)]` : ""),
      attachedImages: imageAttachments.map((f) => f.data),
      attachedVideos: videoAttachments.map((f) => f.data),
      attachedFiles: [
        ...fileAttachments.map((f) => ({ name: f.name, type: f.type })),
        ...linkAttachments.map((f) => ({ name: f.name, type: f.type, data: f.data })),
      ],
      mode: chatMode,
      hiddenFromTranscript: isLearningAnswer,
    };

    // ── Dev Agent: builds/edits real React projects in a cloud VM (@dev) ──
    if (selectedAgent?.id === "dev") {
      try {
        const { runDevTurn } = await import("./services/runDevTurn");
        await runDevTurn({
          text,
          userMsg,
          localTurnId,
          setMessages,
          setInput,
          setAttachedFiles,

          setIsLoading,
          createOrUpdateConversation,
          saveMessage,
          ownInsertedIdsRef,
        });
      } finally {
        isSubmittingRef.current = false;
      }
      return;
    }

    // Build/edit requests always go through the real VM + private GitHub
    // workspace. The generic Computer Agent's write_file tool only creates
    // downloadable artifacts and cannot maintain a runnable project tree.
    if (!selectedAgent) {
      const { shouldUseDevAgent } = await import("@/lib/computer/shouldUseComputer");
      if (shouldUseDevAgent(text)) {
        try {
          const { runDevTurn } = await import("./services/runDevTurn");
          await runDevTurn({
            text,
            userMsg,
            localTurnId,
            setMessages,
            setInput,
            setAttachedFiles,
            setIsLoading,
            createOrUpdateConversation,
            saveMessage,
            ownInsertedIdsRef,
          });
        } finally {
          isSubmittingRef.current = false;
        }
        return;
      }
    }

    // ── Computer Agent: explicit @computer / Agent pick, or model-routed "needs a real computer" requests ──
    {
      const agentRequested = selectedAgent?.id === "computer";
      let intent: { use: boolean; task: string } = { use: agentRequested, task: text };
      if (chatMode !== "operator" && !agentRequested) {
        const { routeComputerIntent } = await import("@/lib/computer/classifyIntent");
        intent = await routeComputerIntent(text, pendingComputerIntentRef.current);
      }
      if (intent.use) pendingComputerIntentRef.current = intent.task || text;
      if (chatMode !== "operator" && intent.use) {
        const { canRunComputerTask, recordComputerTask, computerDailyLimit } = await import(
          "@/lib/computer/usageLimits"
        );
        if (!canRunComputerTask(userPlan)) {
          toast.error(
            `Agent daily limit reached (${computerDailyLimit(userPlan)} tasks/day). Upgrade for more.`,
          );
          isSubmittingRef.current = false;
          return;
        }
        recordComputerTask();
        try {
          await runComputerTurn({
            text: intent.task || text,
            userMsg,
            localTurnId,
            attachments: imageAttachments.map((f) => f.data),
            setMessages,
            setInput,
            setAttachedFiles,
            createOrUpdateConversation,

            saveMessage,
            ownInsertedIdsRef,
          });
        } finally {
          isSubmittingRef.current = false;
        }
        return;
      }
    }


    // ── Operator mode: keep the normal chat flow; render operator output as the assistant reply ──
    if (chatMode === "operator") {
      try {
        await runOperatorTurn({
          text,
          userMsg,
          localTurnId,
          setMessages,
          setInput,
          setAttachedFiles,
          setPendingQuestions,
          setNarrations,
          setClarifyQs,
          setOperatorRunId,
          createOrUpdateConversation,
          saveMessage,
          ownInsertedIdsRef,
        });
      } finally {
        isSubmittingRef.current = false;
      }
      return;
    }

    // ── Auto-route plain "اعملي صورة / make me a video" asks typed in normal mode ──
    let autoMediaMode: "images" | "video" | null = null;
    let autoMediaModel: typeof mediaModel = null;
    if (chatMode === "normal" && text.trim()) {
      try {
        const { detectMediaIntent, pickDefaultMediaModel } = await import(
          "@/lib/media/autoMediaIntent"
        );
        const intent = detectMediaIntent(text);
        if (intent) {
          const picked =
            mediaModel && mediaModel.type === intent
              ? mediaModel
              : await pickDefaultMediaModel(intent);
          if (picked) {
            autoMediaMode = intent === "video" ? "video" : "images";
            autoMediaModel = picked;
            setMediaModel(picked);
          }
        }
      } catch {
        /* auto-routing is best-effort — fall back to a normal chat turn */
      }
    }

    // ── Images / Video mode: plan first, then generation ──
    if (chatMode === "images" || chatMode === "video" || autoMediaMode) {
      const activeMediaMode = autoMediaMode ?? (chatMode as "images" | "video");
      const activeMediaModel = autoMediaModel ?? mediaModel;
      const expectedMediaType = activeMediaMode === "video" ? "video" : "image";
      if (!activeMediaModel || activeMediaModel.type !== expectedMediaType) {
        toast.error(
          activeMediaMode === "video" ? "Choose a video model first" : "Choose an image model first",
        );
        isSubmittingRef.current = false;
        return;
      }
      const isStartEnd = activeMediaMode === "video" && videoStartEndMode;
      if (isStartEnd && (!startFrameUrl || !endFrameUrl)) {
        toast.error("Upload both the first and last frame first");
        isSubmittingRef.current = false;
        return;
      }
      try {
        // آخر صورة مولّدة في المحادثة — تُستخدم تلقائيًا عند طلب تعديل عليها.
        let lastImageUrl: string | null = null;
        let lastImagePrompt: string | null = null;
        for (let i = messages.length - 1; i >= 0 && !lastImageUrl; i--) {
          const m: any = messages[i];
          const res = Array.isArray(m?.mediaResults) ? m.mediaResults : [];
          const hit = [...res].reverse().find(
            (r: any) => r?.type === "image" && r?.status === "done" && r?.url,
          );
          if (hit) {
            lastImageUrl = hit.url;
            lastImagePrompt =
              m?.mediaPlan?.originalPrompt || m?.mediaPlan?.summary || null;
          }
        }
        await runMediaTurn({
          text,
          lastImageUrl,
          lastImagePrompt,
          userMsg,
          localTurnId,
          chatMode: activeMediaMode,
          mediaModel: activeMediaModel,
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
        });
      } finally {
        isSubmittingRef.current = false;
      }
      return;
    }

    const assistantMessageIndex = editingIndex !== null ? editingIndex + 1 : messages.length + 1;
    if (editingIndex !== null) {
      // Snapshot the current tail (edited user message + its reply) onto the
      // preceding pivot so the pre-edit conversation survives as a branch.
      const { snapshotAndTruncateForEdit } = await import("./branching/branchHistory");
      const { updateMessageMetadata } = await import("./services/conversationApi");
      snapshotAndTruncateForEdit(setMessages, editingIndex, {
        persist: (pivot) => {
          if (pivot.id) {
            void updateMessageMetadata(pivot.id, {
              altBranches: pivot.altBranches || [],
              branchPosition: pivot.branchPosition ?? null,
            });
          }
        },
      });
    }
    setMessages((prev) => [
      ...prev,
      userMsg,
      { role: "assistant", content: "", clientId: `assistant-${localTurnId}`, mode: chatMode, modelLabel: selectedModel?.label ?? undefined },
    ]);
    if (editingIndex !== null) {
      setEditingIndex(null);
      setEditingOriginal("");
    }
    const userInput = text;
    setInput("");
    let currentFiles = [...attachedFiles];
    // Any URL typed directly in the message is treated as a source by default —
    // no need to attach it manually through the link dialog.
    const inlineUrls = extractUrlsFromText(userInput).filter(
      (url) => !currentFiles.some((f) => f.type === "link" && f.data === url),
    );
    if (inlineUrls.length > 0) {
      const inlineLinks = inlineUrls.map((url) => ({
        name: hostnameFromUrl(url),
        type: "link" as const,
        data: url,
      }));
      currentFiles = [...currentFiles, ...inlineLinks];
      linkAttachments.push(...inlineLinks);
    }
    const readableLinks = linkAttachments.map((f) => f.data).filter(Boolean);

    if (readableLinks.length > 0) {
      try {
        const response = await authenticatedFetch("/api/read-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls: readableLinks, maxChars: 7000 }),
        });
        if (response.ok) {
          const payload = (await response.json()) as {
            pages?: Array<{ url: string; title?: string; text?: string; error?: string }>;
          };
          const pageMap = new Map((payload.pages || []).map((page) => [page.url, page]));
          currentFiles = currentFiles.map((file) => {
            if (file.type !== "link") return file;
            const page = pageMap.get(file.data);
            const title = page?.title?.trim() || file.name;
            const textContent = page?.text?.trim();
            return {
              ...file,
              name: title,
              data: textContent
                ? `URL: ${file.data}\nTitle: ${title}\n\n${textContent}`
                : `URL: ${file.data}\n${page?.error ? `Read error: ${page.error}` : "No readable page text was extracted."}`,
            };
          });
        } else {
          toast.error("Could not read the attached link");
        }
      } catch {
        toast.error("Could not read the attached link");
      }
    }
    setAttachedFiles([]);
    setIsLoading(true);
    setIsThinking(true);
    setPendingQuestions([]);
    resetToolUi();
    setNarrations([]);
    setClarifyQs(null);
    if (chatMode === "deep-research") {
      setNarrations([]);
    }

    // Slides + Images mode is now routed through the internal premium deck
    // pipeline (chat-slides-stream) further below. The previous external
    // 2slides.com fallback was removed — it depended on a separate paid pool
    // and was unreliable.

    // ── Auto-route to Slides only for explicit creation requests.
    // Mentioning/cancelling slides should remain a normal chat message.
    const SLIDES_KEYWORD_RE =
      /(\b(slides?|presentation|pr[ée]sentation|presentaci[óo]n|pr[äa]sentation|deck|pitch\s*deck|powerpoint|pptx?|keynote|diapositiv[aoe]s?|folien)\b|عرض\s*تقديمي|بريزنتيش?ن|برزنتيش?ن|شرائح|شريحة|سلايد(?:ز|س|ات)?|بوربوينت|كانفا|عرض\s*شرائح)/i;
    const SLIDES_CREATE_RE =
      /(\b(create|generate|make|build|design|prepare|draft|need|want|give\s*me)\b|اعمل|إعمل|اعملي|إعملي|اعملى|انشئ|أنشئ|اصنع|صمم|جهز|حضّر|حضر|عايز|عاوز|عايزة|عاوزة|محتاج|محتاجة|اريد|أريد|ابغى|سوي|سوّي|هات|هاتلي|ابعت|ابعتلي|طلب|اطلب)/i;
    const SLIDES_NEGATION_RE =
      /(\b(cancel(?:led)?|stop|don't|do not|not|without)\b|لغيت|الغيت|إلغ|الغاء|إلغاء|وقف|اوقف|مش\s*عايز|مش\s*عاوز|لا\s*تعمل|متعملش|بلاش)/i;
    // Auto-route to slides whenever a slides keyword appears with clear
    // creation intent OR when the message is longer than a short mention
    // (so bare "اعمل سلايدس عن ..." or "make slides about ..." always fires
    //  the slides tool instead of the model narrating slides in prose).
    const _hasSlidesKeyword = SLIDES_KEYWORD_RE.test(userInput);
    const _hasCreateIntent = SLIDES_CREATE_RE.test(userInput);
    const _isNegated = SLIDES_NEGATION_RE.test(userInput);
    const _looksLikeSlidesAsk =
      _hasSlidesKeyword && (_hasCreateIntent || userInput.trim().length >= 12);
    const shouldAutoStartSlides =
      chatMode === "normal" && _looksLikeSlidesAsk && !_isNegated;
    if (shouldAutoStartSlides) {
      setChatMode("slides");
    }

    // ── Slides mode: plan first (outline + imported data), generate after approval ─
    if (chatMode === "slides" || chatMode === "slides-images" || shouldAutoStartSlides) {
      try {
        // Follow-up like "عدّل السلايد 3 …" edits one slide of the last plan
        // instead of re-planning the whole deck.
        const { parseSlideEditIntent } = await import("@/lib/slides/slideEditIntent");
        const editIntent = parseSlideEditIntent(userInput);
        const lastPlanMsg = editIntent
          ? [...messages].reverse().find((m) => m.slidesPlan)
          : undefined;
        if (editIntent && lastPlanMsg?.slidesPlan) {
          await runSlidesSlideEdit(editIntent, lastPlanMsg.slidesPlan, localTurnId);
          return;
        }

        const docFiles = currentFiles.filter(
          (f) => (f.type === "file" || f.type === "link") && f.data && !f.data.startsWith("__"),
        );
        const attachedFilesText = docFiles
          .map((f) => `### ${f.type === "link" ? "Link" : "File"}: ${f.name}\n${f.data}`)
          .join("\n\n")
          .slice(0, 24000);

        await runSlidesTurn({
          userInput,
          localTurnId,
          chatUserId,
          slidesTemplate,
          setChatMode,
          setSearchEnabled,
          setIsLoading,
          setIsThinking,
          resetToolUi,
          setMessages,
          setSearchStatus,
          createOrUpdateConversation,
          saveMessage,
          ownInsertedIdsRef,
          fetchSlidesNarration,
          insertAssistantNarration,
          clearSlidesTimeout,
          slidesTimeoutsRef,
          slidesGenerationTokenRef,
          planOnly: false,
          brief: attachedFilesText
            ? `${userInput}\n\n--- Source material ---\n${attachedFilesText}`
            : undefined,
          attachedFilesText: attachedFilesText || undefined,
          attachedFileMeta: docFiles.map((f) => ({ name: f.name, chars: f.data.length })),
        });
      } finally {
        isSubmittingRef.current = false;
      }
      return;
    }


    // ── @docs agent: plan → research → review → clean writing ───────────
    if (selectedAgent?.id === "docs") {
      try {
        const docFiles = currentFiles.filter(
          (f) => (f.type === "file" || f.type === "link") && f.data && !f.data.startsWith("__"),
        );
        const attachedFilesText = docFiles
          .map((f) => `### ${f.type === "link" ? "Link" : "File"}: ${f.name}\n${f.data}`)
          .join("\n\n")
          .slice(0, 24000);

        // Follow-up edits on an already generated document: tweak specific
        // wording in place instead of regenerating the whole file.
        const lastDocMsg = [...messages].reverse().find((m) => m.docsArtifact);
        if (lastDocMsg?.docsArtifact) {
          const { parseDocsEditIntent, replaceTextInHtml } = await import(
            "@/lib/docs/textEditIntent"
          );
          const intent = parseDocsEditIntent(userInput);
          const baseHtml = await getLastDocHtml();
          if (intent && baseHtml && (intent.kind === "replace" || intent.kind === "snippet")) {
            const ar = /[\u0600-\u06FF]/.test(userInput);
            let nextHtml: string | null = null;
            if (intent.kind === "replace") {
              const res = replaceTextInHtml(baseHtml, intent.from, intent.to);
              if (res.count > 0) nextHtml = res.html;
            } else {
              const { rewriteSnippet } = await import("@/lib/docs/generatePlan");
              const rewritten = await rewriteSnippet({
                snippet: intent.snippet,
                instruction: intent.instruction,
                language: "en",
                userId: chatUserId || undefined,
              });
              if (rewritten) {
                const res = replaceTextInHtml(baseHtml, intent.snippet, rewritten);
                if (res.count > 0) nextHtml = res.html;
              }
            }
            if (nextHtml) {
              const { saveDocHtml, newArtifactId } = await import("@/lib/agent/docs/htmlCache");
              const artifactId = newArtifactId();
              saveDocHtml(artifactId, nextHtml);
              const docsArtifact = {
                artifactId,
                title: lastDocMsg.docsArtifact.title,
                docType: lastDocMsg.docsArtifact.docType,
                html: nextHtml,
              };
              const note = "Updated that text in the same document — nothing else was regenerated.";
              setMessages((prev) =>
                prev.map((m) =>
                  m.clientId === `assistant-${localTurnId}`
                    ? { ...m, content: note, docsArtifact }
                    : m,
                ),
              );
              const cid = await createOrUpdateConversation(userInput).catch(() => null);
              if (cid) {
                await saveMessage(cid, "user", userInput).catch(() => undefined);
                const savedId = await saveMessage(cid, "assistant", note, undefined, {
                  kind: "docsArtifact",
                  docsArtifact,
                }).catch(() => undefined);
                if (savedId) ownInsertedIdsRef.current.add(savedId);
              }
              setIsLoading(false);
              setIsThinking(false);
              resetToolUi();
              return;
            }
          }
        }

        // Bigger changes on an existing document keep it as the base version.
        const previousHtml = lastDocMsg ? await getLastDocHtml() : null;
        const isRevision = !!previousHtml && !!lastDocMsg;

        const handled = await runDocsTurn({
          userInput,
          localTurnId,
          chatUserId,
          navigate: zoneNavigate,
          messages,
          setMessages,
          setSearchStatus,
          setIsLoading,
          setIsThinking,
          resetToolUi,
          startDocsStatusFallback,
          stopDocsStatusFallback,
          createOrUpdateConversation,
          saveMessage,
          ownInsertedIdsRef,
          planOnly: !isRevision,
          attachedFilesText: attachedFilesText || undefined,
          attachedFileMeta: docFiles.map((f) => ({ name: f.name, chars: f.data.length })),
          previousHtml: previousHtml || undefined,
        });
        if (handled) return;
        return;
      } finally {
        isSubmittingRef.current = false;
      }
    }


    const conversationPromise = createOrUpdateConversation(
      userInput || (currentFiles.length > 0 ? `[${currentFiles.length} file(s)]` : "New chat"),
    ).catch(() => null);

    void conversationPromise.then(async (resolvedConversationId) => {
      if (!resolvedConversationId) return;
      const insertedId = await saveMessage(
        resolvedConversationId,
        "user",
        userInput || `[${currentFiles.length} file(s) attached]`,
        undefined,
        isLearningAnswer ? { kind: "learnAnswer", hiddenFromTranscript: true } : undefined,
      );
      if (insertedId) {
        ownInsertedIdsRef.current.add(insertedId);
        window.dispatchEvent(new CustomEvent("megsy:conversations-changed"));
        // Attach id to last user message locally so dedup by id works for echo
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.clientId === `user-${localTurnId}`);
          if (idx < 0) return prev;
          const next = [...prev];
          next[idx] = { ...next[idx], id: insertedId, user_id: chatUserId || undefined };
          return next;
        });
      }
      // Notify mentioned members
      if (members.length > 0 && userInput) {
        const mentions = Array.from(
          new Set(
            (userInput.match(/@([A-Za-z0-9_]+)/g) || []).map((m) => m.slice(1).toLowerCase()),
          ),
        );
        if (mentions.length > 0) {
          for (const mb of members) {
            if (!mb.name || mb.id === chatUserId) continue;
            const safe = mb.name.replace(/\s+/g, "_").toLowerCase();
            if (mentions.includes(safe)) {
              await supabase.rpc("create_notification" as any, {
                p_user_id: mb.id,
                p_type: "mention",
                p_title: `${userName || "Someone"} mentioned you`,
                p_message: userInput.slice(0, 140),
                p_metadata: { conversation_id: resolvedConversationId },
              });
            }
          }
        }
      }
    });

    await runChatStreamTurn({
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
    });
  };

  useEffect(() => {
    sendWithTextRef.current = handleSendWithText;
  });

  // Once the router's target mode is actually applied, re-send the original
  // message through that service's normal flow.
  useEffect(() => {
    const pending = pendingAutoSendRef.current;
    if (!pending || pending.mode !== chatMode) return;
    pendingAutoSendRef.current = null;
    const t = setTimeout(() => {
      void sendWithTextRef.current?.(pending.text);
    }, 0);
    return () => clearTimeout(t);
  }, [chatMode]);


  const handleSend = () => handleSendWithText();

  // Warm the modules the send path imports so the FIRST send is as fast as
  // every later one (see prewarmSendPath docs).
  useEffect(() => {
    prewarmSendPath();
    prewarmTranscript();
  }, []);


  // After signup, auto-send the prompt the user typed on the landing page.
  usePostSignupPrompt(handleSendWithText);

  const handleNewChat = useChatNewChat({
    slidesGenerationTokenRef,
    slidesTimeoutsRef,
    studyAudioRef,
    setStudyTimers,
    setStudyMusic,
    setMessages,
    setConversationId,
    setConversationTitle,
    setIsLoading,
    setIsThinking,
    setAttachedFiles,
    resetToolUi,
    setChatMode,
    setSearchEnabled,
    setComputerUseEnabled,
    setIsShared,
    setShareId,
    setShareMode,
    setIsPinned,
    setPendingQuestions,
    setSelectedModel,
    setSelectedAgent,
    isSubmittingRef,
  });

  // Keep the open conversation + mode in the URL so reload restores the exact
  // place, and Back/Forward move between conversations.
  useChatUrlState({
    conversationId,
    chatMode,
    loadConversation,
    onNewChat: handleNewChat,
  });



  useEffect(() => {
    if (chatMode === "learning") return;
    if (studyAudioRef.current) {
      studyAudioRef.current.pause();
      studyAudioRef.current.src = "";
    }
    setStudyMusic({ kind: null });
    setStudyTimers([]);
  }, [chatMode]);

  const { handleFileUpload, handleImageUpload, handleCameraCapture } = useComposerUploads({
    attachedFiles,
    setAttachedFiles,
    conversationId,
    createOrUpdateConversation,
  });

  const {
    handleShare,
    handleCreateShareLink,
    handleCopyShareLink,
    handleRename,
    handleTogglePin,
    performTogglePin,
    handleInvite,
    handleSendInviteEmail,
    handleGenerateInviteLink,
    handleCopyInviteLink,
  } = useChatSocialActions({
    conversationId,
    shareMode,
    shareId,
    isShared,
    generatedShareUrl,
    setShareDialogOpen,
    setIsShared,
    setShareId,
    setGeneratedShareUrl,
    renameValue,
    setConversationTitle,
    setIsRenaming,
    isPinned,
    setIsPinned,
    inviteEmail,
    inviteLink,
    setInviteDialogOpen,
    setInviteLink,
    setInviteEmail,
    setInviteLoading,
    setMembers,
  });

  const composerModeBarChange = useMobileModeBarChange({
    selectedAgent,
    setSelectedAgent,
    setSelectedModel,
    setChatMode,
    handleModeChange,
    tryActivateMegsyOs,
  });

  const openInviteFlow = useCallback(async () => {
    if (!conversationId) {
      toast.error("Start a conversation first");
      return;
    }
    setInviteLink(null);
    setInviteEmail("");
    const user = await getCachedUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("conversation_invites")
      .insert({ conversation_id: conversationId, invited_by: user.id } as any)
      .select("invite_token")
      .single();
    if (!error && data) {
      setInviteLink(`${window.location.origin}/invite/${(data as any).invite_token}`);
    }
  }, [conversationId, setInviteLink, setInviteEmail]);

  useChatEntryEffects({
    conversationId,
    location,
    navigate: zoneNavigate,
    loadConversation,
    setConversationId,
    setConversationTitle,
    setMessages,
  });

  useRealtimeMembers({
    conversationId,
    chatUserId,
    setMembers,
    setSystemEvents,
    onSelfRemoved: handleNewChat,
  });

  // playNotificationSound extracted into ./utils/notificationSound

  useRealtimeChat({
    conversationId,
    chatUserId,
    messagesContainerRef,
    ownInsertedIdsRef,
    presenceChannelRef,
    scrollToBottom,
    playNotificationSound,
    setMessages,
    setNewMessagesCount,
    setUnreadCount,
    setTypingUsers,
    setRemoteAiBusy,
    setOnlineUsers,
  });

  // Throttled typing broadcast (extracted into hook).
  useTypingPresence({ input, chatUserId, userName, presenceChannelRef });

  const handleKickMember = useKickMember({ conversationId, members, setMembers });

  const {
    memberMap,
    readersByMessageId,
    lastMessageIdx,
    lastAssistantIdx,
    showReadersIdx,
    hasMembers,
  } = useMessageDerivations({
    members,
    chatUserId,
    userName,
    messages,
    messageReads,
  });
  const dismissOperatorRun = useCallback(() => setOperatorRunId(null), [setOperatorRunId]);

  // Load reactions + reads for current conversation, subscribe to realtime
  useReadsAndReactions({
    conversationId,
    chatUserId,
    messages,
    markedReadRef,
    setMessageReads,
    setMessageReactions,
  });

  // Mirror unread count into the document title while the tab is hidden.
  useUnreadDocumentTitle({ unreadCount, originalTitleRef, setUnreadCount });

  const toggleReaction = useMessageReactionToggle({
    conversationId,
    chatUserId,
    messageReactions,
    setMessageReactions,
    setReactionPickerFor,
  });

  // Mention detection + insertion (extracted into hook).
  const { mentionQuery, insertMention } = useMentionDetection({
    input,
    setInput,
    membersCount: members.length,
  });

  const confirmDelete = useDeleteConversation({
    conversationId,
    setIsDeleting,
    onDeleted: () => handleNewChat(),
  });

  const {
    editingIndex,
    setEditingIndex,
    editingOriginal,
    setEditingOriginal,
    handleEditUserMessageAt,
    cancelEdit,
  } = useMessageEdit({ setInput, userId: chatUserId, conversationId });


  const hasConversation = messages.length > 0;
  const showDesktopEmptyVideo = messages.length === 0 && !loadingMessages;
  // The desktop landing background is a 7 MB mp4. Mounting it during the first
  // render makes the browser open that download while it is still painting the
  // chat shell, which is the single biggest first-paint cost on this route.
  // Mount it after the browser goes idle, and never on mobile (where it is
  // display:none anyway but still fetched).
  const [showLandingVideo, setShowLandingVideo] = useState(false);
  useEffect(() => {
    if (isMobileViewport) return;
    const ric: typeof window.requestIdleCallback | undefined = window.requestIdleCallback;
    let id = 0;
    const start = () => setShowLandingVideo(true);
    if (typeof ric === "function") id = ric(start, { timeout: 2500 }) as unknown as number;
    else id = window.setTimeout(start, 800);
    return () => {
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(id);
      else window.clearTimeout(id);
    };
  }, [isMobileViewport]);

  const { integrationCategories, filteredIntegrations } = useIntegrationsFilter(
    integrationsQuery,
    integrationsCategory,
  );
  // integrationGradient extracted into ./utils/integrationGradient
  const connectIntegration = useConnectIntegration({
    connectingApp,
    setConnectingApp,
    setPlusMenuOpen,
    navigate,
    setUserIntegrations: setUserIntegrations as any,
    refreshIntegrations,
  });

  const renderPlusContent = () => (
    <Suspense fallback={null}>
    <PlusContent
      plusView={plusView as any}
      setPlusView={setPlusView as any}
      setPlusMenuOpen={setPlusMenuOpen}
      chatMode={chatMode}
      cameraInputRef={cameraInputRef}
      imageInputRef={imageInputRef}
      fileInputRef={fileInputRef}
      musicFileInputRef={musicFileInputRef}
      studyAudioRef={studyAudioRef}
      searchEnabled={searchEnabled}
      handleSearchToggle={handleSearchToggle}
      studyMusic={studyMusic}
      setStudyMusic={setStudyMusic}
      userTracks={userTracks}
      uploadingMusic={uploadingMusic}
      playUserTrack={playUserTrack}
      deleteUserTrack={deleteUserTrack}
      handleMusicUpload={handleMusicUpload}
      timerInputMin={timerInputMin}
      setTimerInputMin={setTimerInputMin}
      setStudyTimers={setStudyTimers}
      scrollToBottom={scrollToBottom}
      megsyTier={megsyTier as any}
      setMegsyTier={setMegsyTier as any}
      userPlan={userPlan}
      chatUserId={chatUserId}
      mySkills={mySkills}
      librarySkills={librarySkills}
      toggleEnabled={toggleEnabled}
      navigate={zoneNavigate}
      integrationCategories={integrationCategories}
      integrationsCategory={integrationsCategory}
      setIntegrationsCategory={setIntegrationsCategory}
      integrationsQuery={integrationsQuery}
      filteredIntegrations={filteredIntegrations}
      userIntegrations={userIntegrations as any}
      connectingApp={connectingApp}
      brokenLogos={brokenLogos}
      setBrokenLogos={setBrokenLogos}
      connectIntegration={connectIntegration}
      onAddLink={() => setLinkDialogOpen(true)}
      onModeChange={(m) => handleModeChange(m as any)}
      onAgentSelect={(agentId) => {
        const agent = getAgentById(agentId);
        setChatMode("normal");
        setSelectedAgent(agent || null);
        setSelectedModel(null);
      }}
      onWebsiteStart={() => {
        setChatMode("normal");
        setSelectedAgent(getAgentById("dev") || null);
        setSelectedModel(null);
      }}
    />
    </Suspense>
  );

  // Desktop popover + mobile anchored popover. Mobile opens from the + button
  // itself instead of a full draggable sheet to avoid the old snap/blur lag.
  const composerRef = useRef<HTMLDivElement>(null);
  const renderPlusMenu = () => {
    const openUp = hasConversation || messages.length > 0;
    const r = composerRef.current?.getBoundingClientRect();
    if (isMobileViewport) {
      const vh = window.innerHeight;
      const composerTop = r?.top ?? vh - 96;
      const composerH = r ? Math.max(0, vh - composerTop) : 96;
      const isBigView = plusView === "skills" || plusView === "tools";
      // Manus-style sheet: opens compact but shows header + first rows,
      // then expands upward as the user scrolls.
      const expandedCap = isBigView ? vh * 0.9 : vh * 0.5;
      const minH = isBigView ? 400 : 215;
      const collapsedH = Math.max(minH, Math.min(isBigView ? vh * 0.6 : vh * 0.42, composerTop - 16));
      const expandedH = Math.max(collapsedH, Math.min(expandedCap, vh - 40));
      const collapsedY = expandedH - collapsedH;


      return createPortal(
        <Suspense fallback={null}>
          <DraggablePlusSheet
            height={expandedH}
            collapsedY={collapsedY}
            bottomOffset={0}
            onClose={() => setPlusMenuOpen(false)}
            initialExpanded={plusView === "skills" || plusView === "tools"}
            view={plusView}
          >
            {renderPlusContent()}
          </DraggablePlusSheet>
        </Suspense>,
        document.body,
      );

    }



    const menuWidth = plusView === "skills" ? Math.min(420, window.innerWidth - 24) : 300;
    const left = r ? Math.max(12, Math.min(window.innerWidth - menuWidth - 12, r.left + 8)) : 24;
    const bottom = r ? window.innerHeight - r.top + 8 : 96;
    const availableAbove = r ? Math.max(260, r.top - 16) : 600;
    const maxMenuHeight = Math.min(600, availableAbove);
    return createPortal(
      <>
        {/* Desktop: backdrop to close on outside click */}
        <div
          className="hidden md:block fixed inset-0 z-[55]"
          onClick={() => setPlusMenuOpen(false)}
        />
        {/* Desktop: anchored popover below input — fixed so it never shifts the composer */}
        <motion.div
          initial={{ opacity: 0, y: openUp ? 6 : -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: openUp ? 6 : -6, scale: 0.98 }}
          transition={{ duration: 0.16, ease: [0.22, 0.9, 0.3, 1] }}
          data-plus-menu
          onClick={(e) => e.stopPropagation()}
          className={`hidden md:flex origin-bottom-left z-overlay rounded-2xl border overflow-y-auto overscroll-contain p-2 flex-col unified-menu-surface`}
          style={{
            position: "fixed",
            left,
            bottom,
            width: menuWidth,
            maxHeight: maxMenuHeight,
            color: "hsl(var(--foreground))",
            backdropFilter: "blur(22px) saturate(160%)",
            background: "hsl(var(--card) / 0.92)",
            borderColor: "hsl(var(--border))",
            borderTop: "1px solid hsl(var(--border))",
            borderRight: 0,
            borderBottom: 0,
            borderLeft: 0,
            boxShadow:
              "inset 0 1px 0 hsl(var(--foreground) / 0.06), 0 22px 60px -18px hsl(var(--foreground) / 0.18)",
          }}
        >
          {renderPlusContent()}
        </motion.div>
      </>,
      document.body,
    );
  };

  const removeAttachment = useCallback(
    (index: number) => setAttachedFiles((prev) => prev.filter((_, idx) => idx !== index)),
    [setAttachedFiles],
  );

  // Image tools now live inside the model settings panel; it talks back via window events.
  useEffect(() => {
    const onAttach = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) setAttachedFiles((prev) => [...prev, detail as any]);
    };
    const onCharacter = (e: Event) => {
      const c = (e as CustomEvent).detail as { name?: string } | null;
      if (!c?.name) return;
      setInput((prev) => (prev.trim() ? `${prev.trim()} (${c.name})` : `${c.name} — `));
    };
    window.addEventListener("megsy:image-tool-attach", onAttach);
    window.addEventListener("megsy:image-tool-character", onCharacter);
    return () => {
      window.removeEventListener("megsy:image-tool-attach", onAttach);
      window.removeEventListener("megsy:image-tool-character", onCharacter);
    };
  }, [setAttachedFiles, setInput]);


  const seoMeta = getSeoMeta(chatMode);

  const renderMobileServicePanel = () => (
    <Suspense fallback={null}>
      <MobileServicePanelRenderer
        selectedAgent={selectedAgent}
        chatMode={chatMode}
        setChatMode={setChatMode}
        setSelectedAgent={setSelectedAgent}
        setSelectedModel={setSelectedModel}
        slidesTemplate={slidesTemplate}
        setSlidesPickerOpen={setSlidesPickerOpen}
        videoStartEndMode={videoStartEndMode}
        setVideoStartEndMode={setVideoStartEndMode}
        startFrameUrl={startFrameUrl}
        endFrameUrl={endFrameUrl}
        setStartFrameUrl={setStartFrameUrl}
        setEndFrameUrl={setEndFrameUrl}
        frameUploading={frameUploading}
        setFrameUploading={setFrameUploading}
        uploadFrame={uploadFrame}
        setVideoDurationSec={setVideoDurationSec}
        tierMenuOpen={tierMenuOpen}
        setTierMenuOpen={setTierMenuOpen}
        selectedModel={selectedModel}
        megsyTier={megsyTier}
        setMegsyTier={setMegsyTier}
        userPlan={userPlan}
        mediaModel={mediaModel}
        setMediaModel={setMediaModel}
        researchDepth={researchDepth}
        setResearchDepth={setResearchDepth}
      />
    </Suspense>
  );

  // All previously-full-panel modes (images, video, slides, deep-research,
  // learning, docs) now render only the single ActiveServicePill strip inside
  // the composer, so the mobile landing should keep showing the normal
  // MobileModeBar chip strip. `renderMobileServicePanel` returns null for
  // every one of them — treating `hasMobileServicePanel` as always false here
  // prevents the landing from swapping the chip strip for an empty slot.
  const hasMobileServicePanel = false;

  return (
    <AuiProvider
      key={conversationId ?? "new"}
      messages={messages}
      isRunning={isLoading || isThinking}
      onNew={(text) => handleSendWithText(text)}
      onCancel={() => handleCancel()}
      onFeedback={handleLikeMessage}
      attachedFiles={attachedFiles}
    >

      <SEOHead title={seoMeta.title} description={seoMeta.description} path={seoMeta.path} />


      {/* Megsy Operator now renders as a tiny inline pill above the input — see below. */}
      <div
        data-shell="megsy"
        data-skin="claude"
        data-chat-empty={showDesktopEmptyVideo ? "true" : "false"}
        className="theme-fixed flex bg-background overflow-hidden relative"
        style={{ height: "calc(100dvh - var(--promo-banner-h, 0px))" }}
      >
        {/* Flat unified surface — no video / aurora backdrop. */}
        {/* Desktop persistent sidebar */}
        <aside
          data-chat-sidebar="true"
          style={{
            width: desktopSidebarWidth,
            minWidth: desktopSidebarWidth,
            flexBasis: desktopSidebarWidth,
            backgroundColor: "transparent",
            borderRightColor: "transparent",
          }}
          className="theme-fixed relative z-40 hidden md:flex shrink-0 overflow-hidden border-e transition-[width,min-width,flex-basis] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        >
          <AppSidebar
            inline
            open
            forceExpanded={isSidebarExpanded}
            onClose={() => {}}
            onNewChat={handleNewChat}
            onSelectConversation={loadConversation}
            activeConversationId={conversationId}
            currentMode={
              chatMode === "learning"
                ? "learning"
                : chatMode === "deep-research"
                  ? "research"
                  : chatMode === "shopping"
                    ? "shopping"
                    : chatMode === "slides" || chatMode === "slides-images"
                      ? "slides"
                      : chatMode === "images"
                        ? "images"
                        : chatMode === "video"
                          ? "videos"
                          : (chatMode as string) === "website" ||
                              (chatMode as string) === "coding" ||
                              (chatMode as string) === "code"
                            ? "code"
                            : "chat"
            }
          />
        </aside>

        {/* Mobile Claude-style underlay sidebar — sits beneath the chat surface. */}
        <div className="md:hidden">
          <AppSidebar
            underlay
            mobileSide={isRtlUi ? "right" : "left"}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            onNewChat={handleNewChat}
            onSelectConversation={loadConversation}
            activeConversationId={conversationId}
            currentMode={
              chatMode === "learning"
                ? "learning"
                : chatMode === "deep-research"
                  ? "research"
                  : chatMode === "shopping"
                    ? "shopping"
                    : chatMode === "slides" || chatMode === "slides-images"
                      ? "slides"
                      : chatMode === "images"
                        ? "images"
                        : chatMode === "video"
                          ? "videos"
                          : (chatMode as string) === "website" ||
                              (chatMode as string) === "coding" ||
                              (chatMode as string) === "code"
                            ? "code"
                            : "chat"
            }
          />
        </div>

        {/* The former left/right edge strip (z-80, touch-none) had no gesture
            handler attached and only swallowed taps near the screen edge. */}


        <motion.div
          data-chat-main="true"
          data-chat-empty={messages.length === 0 && !loadingMessages ? "true" : "false"}
          data-sidebar-open={sidebarOpen ? "true" : "false"}
          style={{
            x: sidebarX,
            scale: sidebarScale,
            borderRadius: sidebarRadius,
            boxShadow: sidebarShadow,
            transformOrigin: isRtlUi ? "right center" : "left center",
            touchAction: "pan-y",
          }}
          onPointerDown={(event) => {
            if (event.pointerType === "mouse") return;
            if (blocksSidebarSwipe(event.target, event.clientX, isRtlUi)) return;
            beginSidebarEdgeDrag(event.pointerId, event.clientX, event.clientY);
          }}
          onPointerMove={(event) => {
            if (event.pointerType === "mouse") return;
            updateSidebarEdgeDrag(event.pointerId, event.clientX, event.clientY);
          }}
          onPointerUp={(event) => endSidebarEdgeDrag(event.pointerId)}
          onPointerCancel={(event) => endSidebarEdgeDrag(event.pointerId)}
          drag={isMobileViewport && sidebarOpen ? "x" : false}
          dragDirectionLock
          dragConstraints={
            isRtlUi ? { left: -sidebarRevealX, right: 0 } : { left: 0, right: sidebarRevealX }
          }
          dragElastic={isRtlUi ? { left: 0.03, right: 0.14 } : { left: 0.14, right: 0.03 }}
          dragMomentum={false}
          onDragEnd={(_, info) => {
            if (!sidebarOpen) return;
            const shouldClose = isRtlUi
              ? info.offset.x > Math.max(72, sidebarRevealX * (1 - SIDEBAR_CLOSE_SNAP)) ||
                info.velocity.x > SIDEBAR_FLING_VELOCITY
              : info.offset.x < -Math.max(72, sidebarRevealX * (1 - SIDEBAR_CLOSE_SNAP)) ||
                info.velocity.x < -SIDEBAR_FLING_VELOCITY;
            setSidebarOpen(!shouldClose);
            animateSidebarTo(!shouldClose);
          }}
          role="main"
          aria-label="Chat"
          className="theme-fixed chat-surface-dark flex-1 flex flex-col min-w-0 relative overflow-hidden bg-background text-foreground max-md:z-[2]"
        >




          {/* Tap-to-close overlay while the underlay sidebar is revealed. */}
          <motion.div
            className={`md:hidden absolute inset-0 z-[60] ${
              sidebarOpen
                ? "pointer-events-auto"
                : "pointer-events-none"
            }`}
            style={{ background: "rgba(0,0,0,0.42)", opacity: sidebarProgress }}
            onClick={() => setSidebarOpen(false)}
            aria-hidden={!sidebarOpen}
          />


          <ChatArtifactsCanvas conversationId={conversationId} />

          {/* Mobile-only header — Luma Neutral */}
          <MobileChatHeaderMount
            conversationTitle={conversationTitle}
            conversationId={conversationId}
            hasConversation={hasConversation}
            isPinned={isPinned}
            isDeleting={isDeleting}
            setSidebarOpen={setSidebarOpen}
            handleNewChat={handleNewChat}
            handleShare={handleShare}
            handleInvite={handleInvite}
            setRenameValue={setRenameValue}
            performTogglePin={performTogglePin}
            confirmDelete={confirmDelete}
            chatMode={chatMode}
            tierMenuOpen={tierMenuOpen}
            setTierMenuOpen={setTierMenuOpen}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            megsyTier={megsyTier}
            setMegsyTier={setMegsyTier}
            userPlan={userPlan}
            mediaModel={mediaModel}
            setMediaModel={setMediaModel}
            chatUserId={chatUserId}
            renameValue={renameValue}
            handleRename={handleRename}
            inviteEmail={inviteEmail}
            setInviteEmail={setInviteEmail}
            inviteLink={inviteLink}
            setInviteLink={setInviteLink}
            inviteLoading={inviteLoading}
            handleSendInviteEmail={handleSendInviteEmail}
            handleCopyInviteLink={handleCopyInviteLink}
            shareMode={shareMode}
            setShareMode={setShareMode}
            generatedShareUrl={generatedShareUrl}
            setGeneratedShareUrl={setGeneratedShareUrl}
            handleCreateShareLink={handleCreateShareLink}
            handleCopyShareLink={handleCopyShareLink}
            setChatMode={setChatMode}
            setVideoDurationSec={setVideoDurationSec}
            researchDepth={researchDepth}
            scrollContainerRef={messagesContainerRef}

            setResearchDepth={setResearchDepth}
          />

          {/* Desktop/mobile combined header: title dropdown, Unlock Pro, options */}
          <DesktopChatHeader
            chatMode={chatMode}
            hasConversation={hasConversation}
            userPlan={userPlan}
            navigate={zoneNavigate}
            setSidebarOpen={setSidebarOpen}
            conversationId={conversationId}
            conversationTitle={conversationTitle}
            isPinned={isPinned}
            isDeleting={isDeleting}
            renameValue={renameValue}
            setRenameValue={setRenameValue}
            inviteEmail={inviteEmail}
            setInviteEmail={setInviteEmail}
            inviteLink={inviteLink}
            inviteLoading={inviteLoading}
            shareMode={shareMode}
            setShareMode={setShareMode}
            generatedShareUrl={generatedShareUrl}
            setGeneratedShareUrl={setGeneratedShareUrl}
            chatMenuView={chatMenuView}
            setChatMenuView={setChatMenuView}
            onNewChat={handleNewChat}
            onTogglePin={performTogglePin}
            onRename={handleRename}
            onSendInvite={handleSendInviteEmail}
            onCopyInviteLink={handleCopyInviteLink}
            onCopyShareLink={handleCopyShareLink}
            onCreateShareLink={handleCreateShareLink}
            onOpenInvite={openInviteFlow}
            onConfirmDelete={confirmDelete}
            tierMenuOpen={tierMenuOpen}
            setTierMenuOpen={setTierMenuOpen}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            megsyTier={megsyTier}
            setMegsyTier={setMegsyTier}
            mediaModel={mediaModel}
            setMediaModel={setMediaModel}
            chatUserId={chatUserId}
            setChatMode={setChatMode}
            setVideoDurationSec={setVideoDurationSec}
          />

          {/* Scrollable messages area (welcome → loading → transcript) */}
          <ChatMessagesArea
            ref={messagesEndRef}
            loadingMessages={loadingMessages}
            messages={messages}
            messagesContainerRef={messagesContainerRef}
            handleScroll={handleScroll}
            showScrollBtn={showScrollBtn}
            newMessagesCount={newMessagesCount}
            scrollToBottom={scrollToBottom}
            userName={userName}
            isFirstVisit={isFirstVisit}
            returningGreetingIdx={returningGreetingIdx}
            emptyGreeting={
              <Suspense fallback={null}>
                <DesktopGreeting
                  userName={userName}
                  isFirstVisit={isFirstVisit}
                  returningGreetingIdx={returningGreetingIdx}
                />
              </Suspense>
            }
            plusMenuOpen={plusMenuOpen}
            renderPlusMenu={renderPlusMenu}
            mobileLandingProps={{
              input,
              setInput,
              handleSend,
              isLoading,
              activeResearchJobId,
              selectedModel,
              setSelectedModel,
              megsyTier,
              userPlan,
              userName,
              plusMenuOpen,
              setPlusMenuOpen,
              setPlusView,
              hasMobileServicePanel,
              renderMobileServicePanel,
              chatMode,
              selectedAgent,
              setSelectedAgent,
              setChatMode,
              handleModeChange,
              tryActivateMegsyOs,
              setSlidesPickerOpen,
            }}
            messagesListProps={{
              messages,
              editingIndex,
              chatMode,
              studyTimers,
              setStudyTimers,
              systemEvents,
              typingUsers,
              colorForUser,
              chatUserId,
              conversationId,
              conversationTitle,
              isLoading,
              isThinking,
              searchStatus,
              toolActivity,
              parallelTasks,
              narrations,
              hasMembers,
              messageReactions,
              readersByMessageId,
              showReadersIdx,
              lastMessageIdx,
              handleLikeMessage,
              handleStructuredAction,
              handleEditUserMessageAt,
              dismissOperatorRun,
              toggleReaction,
              setMessages,
              setInput,
              setIsLoading,
              setIsThinking,
              setSearchStatus,
              setChatMode,
              resetToolUi,
              startDocsStatusFallback,
              stopDocsStatusFallback,
              saveMessage,
              handleSendWithText,
            }}
            slotAfterMessages={
              coderRuns.length > 0 ? (
                <Suspense fallback={null}>
                  <div className="space-y-3">
                    {(() => {
                      // Compute previousFiles + history once per messages change, not per run.
                      const previousFiles: { path: string; content: string }[] = [];
                      const history: { role: "user" | "assistant"; content: string }[] = [];
                      const fileMap = new Map<string, string>();
                      for (const m of messages) {
                        if (m.role !== "user" && m.role !== "assistant") continue;
                        if (typeof m.content !== "string") continue;
                        history.push({ role: m.role, content: m.content });
                        if (m.role === "assistant" && m.content.includes("```")) {
                          try {
                            for (const f of extractProjectFiles(m.content)) fileMap.set(f.path, f.content);
                          } catch {/* ignore */}
                        }
                      }
                      for (const runFiles of Object.values(coderProjectFiles)) {
                        for (const f of runFiles) if (f?.path) fileMap.set(f.path, f.content ?? "");
                      }
                      for (const [path, content] of fileMap) previousFiles.push({ path, content });
                      return coderRuns.map((run) => (
                      <InlineCoderRun
                        key={run.id}
                        runId={run.id}
                        prompt={run.prompt}
                        previousFiles={previousFiles}
                        history={history}
                        attachments={run.attachments}

                        onClose={() => setCoderRuns((prev) => prev.filter((r) => r.id !== run.id))}
                        onFinish={(files, summary) => {
                          if (savedCoderRunIdsRef.current.has(run.id)) return;
                          savedCoderRunIdsRef.current.add(run.id);
                          setCoderProjectFiles((prev) => ({ ...prev, [run.id]: files }));
                          const projectText = files
                            .map((file) => {
                              const ext = (file.path.split(".").pop() || "txt").toLowerCase();
                              return `\`\`\`${ext} ${file.path}\n${file.content}\n\`\`\``;
                            })
                            .join("\n\n");
                          const content = [
                            "Megsy Coder finished the build.",
                            summary?.trim() ? summary.trim() : "",
                            projectText,
                          ]
                            .filter(Boolean)
                            .join("\n\n");
                          void (async () => {
                            const resolvedConversationId = await run.conversationPromise;
                            if (!resolvedConversationId) return;
                            const insertedId = await saveMessage(resolvedConversationId, "assistant", content).catch(() => undefined);
                            if (insertedId) {
                              ownInsertedIdsRef.current.add(insertedId);
                              window.dispatchEvent(new CustomEvent("megsy:conversations-changed"));
                            }
                          })();
                        }}
                      />
                      ));
                    })()}
                  </div>
                </Suspense>
              ) : null
            }
          />


          {/* Floating bottom composer dock with attachments + mode bar + chips */}
          <ChatComposerSection
            composerRef={composerRef}
            sidebarCollapsed={!isSidebarExpanded}
            sidebarOffset={desktopSidebarWidth}
            loadingMessages={loadingMessages}
            messagesLength={messages.length}
            attachedFiles={attachedFiles}
            removeAttachment={removeAttachment}
            remoteAiBusy={remoteAiBusy}
            plusMenuOpen={plusMenuOpen}
            renderPlusMenu={renderPlusMenu}
            mentionQuery={mentionQuery}
            members={members}
            onlineUsers={onlineUsers}
            colorForUser={colorForUser}
            insertMention={insertMention}
            navigate={zoneNavigate}
            desktopGreeting={
              <Suspense fallback={null}>
                <DesktopGreeting
                  userName={userName}
                  isFirstVisit={isFirstVisit}
                  returningGreetingIdx={returningGreetingIdx}
                />
              </Suspense>
            }
            composerMobileModeBarProps={{
              selectedAgent,
              chatMode,
              editingIndex,
              hasMobileServicePanel,
              renderMobileServicePanel,
              composerModeBarChange,
            }}
            composerAnimatedInputProps={{
              input,
              setInput,
              handleSend,
              handleCancel,
              plusMenuOpen,
              setPlusMenuOpen,
              setPlusView,
              isLoading,
              remoteAiBusy,
              activeResearchJobId,
              pendingQuestions,
              handleQuestionAnswer,
              handleQuestionSkip,
              chatMode,
              setChatMode,
              selectedAgent,
              setSelectedAgent,
              selectedModel,
              setSelectedModel,
              setSearchEnabled,
              handleModeChange,
              tryActivateMegsyOs,
              editingIndex,
              cancelEdit,
              isMobileViewport,
              tierMenuOpen,
              setTierMenuOpen,
              megsyTier,
              setMegsyTier,
              userPlan,
              mediaModel,
              setMediaModel,
              chatUserId,
              slidesTemplate,
              setSlidesPickerOpen,
              researchDepth,
              setResearchDepth,
              researchDepthOpen,
              setResearchDepthOpen,
              setVideoDurationSec,
            }}
            desktopModeChipsProps={{
              chatMode,
              selectedAgent,
              handleModeChange,
              setChatMode,
              setSelectedAgent,
              tryActivateMegsyOs,
              setInput,
              onAgentSelect: (agentId: string) => {
                const agent = getAgentById(agentId);
                setChatMode("normal");
                setSelectedAgent(agent || null);
                setSelectedModel(null);
              },
              mediaModel,
              setMediaModel,
              slidesTemplate,
              setSlidesPickerOpen,
            }}
          />

          <ChatHiddenFileInputs
            fileInputRef={fileInputRef}
            cameraInputRef={cameraInputRef}
            imageInputRef={imageInputRef}
            handleFileUpload={handleFileUpload}
            handleCameraCapture={handleCameraCapture}
            handleImageUpload={handleImageUpload}
          />

          <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
            <DialogContent className="max-w-md rounded-2xl">
              <form onSubmit={handleAddLinks} className="space-y-4">
                <DialogHeader>
                  <DialogTitle>Add links</DialogTitle>
                  <DialogDescription>
                    Paste one or more links. Megsy will read them and attach their content to this turn.
                  </DialogDescription>
                </DialogHeader>
                <Textarea
                  value={linkInput}
                  onChange={(event) => setLinkInput(event.target.value)}
                  placeholder="https://example.com/article"
                  className="min-h-28 resize-none rounded-xl"
                  autoFocus
                />
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setLinkDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Attach links</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {(connectorsOpen || directoryOpen || slidesPickerOpen) && (
            <Suspense fallback={null}>
              <ChatGlobalModals
                connectorsOpen={connectorsOpen}
                setConnectorsOpen={setConnectorsOpen}
                directoryOpen={directoryOpen}
                setDirectoryOpen={setDirectoryOpen}
                slidesPickerOpen={slidesPickerOpen}
                setSlidesPickerOpen={setSlidesPickerOpen}
                slidesTemplate={slidesTemplate}
                setSlidesTemplate={setSlidesTemplate}
                navigate={navigate}
              />
            </Suspense>
          )}

          {(shareDialogOpen || isRenaming || inviteDialogOpen) && (
            <Suspense fallback={null}>
              <ChatDialogs
                shareDialogOpen={shareDialogOpen}
                setShareDialogOpen={setShareDialogOpen}
                shareMode={shareMode}
                setShareMode={setShareMode}
                generatedShareUrl={generatedShareUrl}
                setGeneratedShareUrl={setGeneratedShareUrl}
                handleCreateShareLink={handleCreateShareLink}
                handleCopyShareLink={handleCopyShareLink}
                isRenaming={isRenaming}
                setIsRenaming={setIsRenaming}
                renameValue={renameValue}
                setRenameValue={setRenameValue}
                handleRename={handleRename}
                inviteDialogOpen={inviteDialogOpen}
                setInviteDialogOpen={setInviteDialogOpen}
                inviteEmail={inviteEmail}
                setInviteEmail={setInviteEmail}
                inviteLink={inviteLink}
                setInviteLink={setInviteLink}
                inviteLoading={inviteLoading}
                handleSendInviteEmail={handleSendInviteEmail}
                handleCopyInviteLink={handleCopyInviteLink}
                members={members}
                chatUserId={chatUserId}
                conversationOwnerId={conversationOwnerId}
                onlineUsers={onlineUsers}
                colorForUser={colorForUser}
                handleKickMember={handleKickMember}
              />
            </Suspense>
          )}
        </motion.div>
      </div>
      {megsyOsIntroOpen && (
        <Suspense fallback={null}>
          <MegsyOsIntro
            open={megsyOsIntroOpen}
            onClose={() => setMegsyOsIntroOpen(false)}
            isProPlusPlan={isProPlusPlan}
            navigate={zoneNavigate}
            handleModeChange={handleModeChange}
          />
        </Suspense>
      )}
    </AuiProvider>
  );
};

export default ChatPage;
