import { Suspense, lazy, memo } from "react";
import { useNavigate } from "react-router-dom";
import ChatMessage from "@/components/chat/ChatMessage";
import { VideoJobProgress } from "@/components/chat/VideoJobProgress";
import MediaGenerationSkeleton from "@/components/chat/MediaGenerationSkeleton";
import {
  SlidesDeckCard,
  StandardSlidesCard,
  ImageSlidesCard,
  SlidesOutlineCard,
  DocsPlanCard,
  OperatorInlineBubbleLazy,
  DocsArtifactCard,
} from "../lazyComponents";
// Media / docs-clarify blocks only render for a small % of assistant
// messages (image plans, doc drafting). Lazy-load them so the base
// message-item chunk stays lean.
const AssistantMediaBlock = lazy(() => import("./AssistantMediaBlock"));
const ComputerTaskCardLazy = lazy(() => import("@/components/chat/ComputerTaskCard"));
const ComputerPreviewLazy = lazy(() =>
  import("@/components/computer/ComputerPreview").then((m) => ({ default: m.ComputerPreview })),
);
const SiteBuildCard = lazy(() => import("@/components/chat/site/SiteBuildCard"));
const UpgradeRequiredCard = lazy(() => import("@/components/chat/UpgradeRequiredCard"));
const AssistantDocsClarifyBlock = lazy(() => import("./AssistantDocsClarifyBlock"));
import { type Message, EMPTY_READERS, EMPTY_REACTIONS } from "../chatConstants";
import {
  snapshotAndTruncateForRegenerate,
  computeBranchInfo,
} from "../branching/branchHistory";
import { updateMessageMetadata } from "../services/conversationApi";
import { trackChatInteraction } from "../services/trackInteraction";


// Persist branching state on the pivot user message's metadata JSONB so
// altBranches survive page reload / re-open. Best-effort — never throws.
const persistBranchOnPivot = (pivot: Message) => {
  if (!pivot.id) return;
  void updateMessageMetadata(pivot.id, {
    altBranches: pivot.altBranches || [],
    branchPosition: pivot.branchPosition ?? null,
  });
};

interface SharedHandlers {
  messages: Message[];
  chatUserId: string | null;
  conversationId: string | null;
  conversationTitle: string;
  isLoading: boolean;
  isThinking: boolean;
  searchStatus: unknown;
  toolActivity: unknown;
  parallelTasks: unknown;
  narrations: unknown;
  hasMembers: boolean;
  messageReactions: Record<string, unknown>;
  readersByMessageId: Record<string, unknown>;
  showReadersIdx: number | null;
  lastMessageIdx: number;
  handleLikeMessage: (index: number, liked: boolean | null) => void;
  handleStructuredAction: (text: string) => void;
  handleEditUserMessageAt: (...args: any[]) => void;
  dismissOperatorRun: (...args: any[]) => void;
  colorForUser: (userId?: string | null) => { bg: string; text: string } | null | undefined;
  toggleReaction: (...args: unknown[]) => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setInput: (v: string) => void;
  setIsLoading: (v: boolean) => void;
  setIsThinking: (v: boolean) => void;
  setSearchStatus: (v: unknown) => void;
  setChatMode: (...args: any[]) => void;
  resetToolUi: () => void;
  startDocsStatusFallback: () => void;
  stopDocsStatusFallback: () => void;
  saveMessage: (...args: unknown[]) => Promise<unknown>;
  handleSendWithText: (text?: string) => Promise<void>;
}

interface ChatMessageItemProps extends SharedHandlers {
  msg: Message;
  i: number;
}

const ChatMessageItemImpl = ({
  msg,
  i,
  messages,
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
  colorForUser,
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
}: ChatMessageItemProps) => {
  const navigate = useNavigate();
  // Hide the synthetic "[LEARN_ANSWER] …" user bubble that the LearnCard
  // dispatches when the learner taps an option — the tap itself and the
  // card's visual feedback are already the UI acknowledgement. Rendering
  // the raw marker as a chat bubble is noise and confuses learners.
  if (
    msg.role === "user" &&
    typeof msg.content === "string" &&
    (msg.content.trim().startsWith("[LEARN_ANSWER]") ||
      msg.content.trim().startsWith("[LEARN_CHOICE]"))
  ) {
    return null;
  }
  const isOther =
    msg.role === "user" && !!msg.user_id && !!chatUserId && msg.user_id !== chatUserId;
  const isLast = i === lastMessageIdx;
  const isLastAssistant = isLast && msg.role === "assistant";
  const hasRunningTool = !!msg.toolParts?.some((part) => part.state === "running");
  const isStreamingThis = (isLoading && isLastAssistant) || hasRunningTool;
  // While media is generating we show a single skeleton tile — the thinking
  // bubble is suppressed so the user never sees two stacked loading boxes.
  const showMediaSkeleton =
    msg.role === "assistant" &&
    isStreamingThis &&
    !msg.content &&
    (msg.mode === "images" || msg.mode === "video") &&
    !(msg.images && msg.images.length > 0) &&
    !(msg.videos && msg.videos.length > 0) &&
    !(msg.audios && msg.audios.length > 0) &&
    !msg.videoJobId;
  const content = (
    <>
      {showMediaSkeleton ? null : msg.role === "assistant" && msg.longRunId ? (
        <div className="flex flex-col gap-2">
          {typeof msg.content === "string" && msg.content.trim() ? (
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{msg.content}</p>
          ) : null}
          <Suspense fallback={null}>
            <ComputerPreviewLazy runId={msg.longRunId} plan={msg.computerPlan} />
          </Suspense>
        </div>
      ) : msg.role === "assistant" && msg.computerTaskId ? (
        <Suspense fallback={null}>
          <ComputerTaskCardLazy taskId={msg.computerTaskId} />
        </Suspense>
      ) : msg.role === "assistant" && msg.operatorRunId ? (
        <Suspense fallback={null}>
          <OperatorInlineBubbleLazy runId={msg.operatorRunId} onDismiss={dismissOperatorRun} />
        </Suspense>
      ) : (
        <ChatMessage
          messageIndex={i}
          role={msg.role}
          content={msg.content}
          images={msg.images}
          videos={msg.videos}
          audios={msg.audios}
          products={msg.products}
          attachedImages={msg.attachedImages}
          attachedFiles={msg.attachedFiles}
          isStreaming={isStreamingThis}
          isThinking={isThinking && isLastAssistant}
          searchStatus={isLastAssistant ? (searchStatus as any) : undefined}
          toolActivity={isLastAssistant ? (toolActivity as any) : null}
          parallelTasks={isLastAssistant ? (parallelTasks as any) : undefined}
          toolParts={msg.toolParts}
          reasoning={msg.reasoning}
          interrupted={msg.interrupted}
          timing={msg.timing}
          modelLabel={msg.modelLabel}
          metadata={(msg as any).metadata}

          liked={msg.liked}
          onLikeMessage={handleLikeMessage}
          onShare={undefined}
          onStructuredAction={handleStructuredAction}
          onEditUserMessageAt={msg.role === "user" ? handleEditUserMessageAt : undefined}
          onRegenerate={
            msg.role === "assistant" &&
            !isStreamingThis &&
            i > 0 &&
            messages[i - 1]?.role === "user" &&
            typeof messages[i - 1]?.content === "string" &&
            messages[i - 1].content.trim().length > 0
              ? () => {
                  const prevText = messages[i - 1].content;
                  trackChatInteraction("regenerate", {
                    userId: chatUserId,
                    conversationId,
                    messageId: msg.id,
                    metadata: { modelLabel: msg.modelLabel },
                  });
                  snapshotAndTruncateForRegenerate(setMessages, i, {
                    persist: persistBranchOnPivot,
                  });
                  void handleSendWithText(prevText);
                }
              : undefined
          }

          onResume={
            msg.role === "assistant" && !isStreamingThis && msg.interrupted
              ? () => {
                  // Continuation: don't truncate. Nudge the model to pick up
                  // exactly where it stopped, then clear the interrupted flag
                  // optimistically so the banner disappears.
                  setMessages((prev) =>
                    prev.map((m, idx) =>
                      idx === i ? { ...m, interrupted: false } : m,
                    ),
                  );
                  void handleSendWithText(
                    "Continue exactly where you stopped; do not repeat or summarize any previous part.",
                  );
                }
              : undefined
          }
          branchInfo={
            msg.role === "assistant" && !isStreamingThis
              ? computeBranchInfo(messages, i, setMessages, {
                  persist: persistBranchOnPivot,
                })
              : null
          }
          onBranch={
            msg.role === "assistant" && !isStreamingThis && conversationId
              ? async () => {
                  const { toast } = await import("sonner");
                  const { branchConversation } = await import(
                    "../services/branchConversation"
                  );
                  const tId = toast.loading("Branching conversation…");
                  try {
                    const newId = await branchConversation(conversationId, i);
                    if (!newId) {
                      toast.error("Failed to branch", { id: tId });
                      return;
                    }
                    toast.success("Branch created", { id: tId });
                    navigate("/chat", {
                      replace: true,
                      state: { loadConversationId: newId },
                    });
                  } catch {
                    toast.error("Failed to branch", { id: tId });
                  }
                }
              : undefined
          }
          isDeepResearch={msg.mode === "deep-research" && msg.role === "assistant"}
          isSlidesMode={msg.mode === "slides" && msg.role === "assistant"}
          isLearningMode={msg.mode === "learning" && msg.role === "assistant"}
          researchQuery={
            msg.role === "assistant" && i > 0 && messages[i - 1]?.role === "user"
              ? messages[i - 1].content
              : undefined
          }
          researchSessionKey={
            msg.role === "assistant" && conversationId ? `conv_${conversationId}_${i}` : undefined
          }
          narrations={isLastAssistant ? (narrations as any) : undefined}
          senderName={hasMembers ? msg.senderName || undefined : undefined}
          senderAvatar={hasMembers ? msg.senderAvatar || undefined : undefined}
          isOtherMember={isOther}
          bubbleColor={isOther ? colorForUser(msg.user_id!) : null}
          messageId={msg.id}
          currentUserId={chatUserId || undefined}
          reactions={
            (msg.id ? messageReactions[msg.id] || EMPTY_REACTIONS : EMPTY_REACTIONS) as any
          }
          onToggleReaction={msg.id ? (toggleReaction as any) : undefined}
          readers={(msg.id ? readersByMessageId[msg.id] || EMPTY_READERS : EMPTY_READERS) as any}
          showReaders={
            hasMembers && msg.role === "user" && msg.user_id === chatUserId && i === showReadersIdx
          }
          bottomSlot={
            msg.role === "assistant" && msg.docsArtifact ? (
              <Suspense fallback={null}>
                <DocsArtifactCard
                  artifactId={msg.docsArtifact.artifactId}
                  title={msg.docsArtifact.title}
                  docType={msg.docsArtifact.docType}
                  html={msg.docsArtifact.html}
                />
              </Suspense>
            ) : undefined
          }
          hideActions={msg.role === "assistant" && (!!msg.docsClarify || hasRunningTool)}
        />
      )}
      {msg.role === "assistant" && msg.docsPlan && (
        <div className="px-3 md:px-12">
          <Suspense fallback={null}>
            <DocsPlanCard
              plan={msg.docsPlan}
              messageId={msg.id}
              conversationId={conversationId}
              userId={chatUserId}
              status={
                msg.docsPlan.stage === "done"
                  ? "done"
                  : msg.docsPlan.stage === "generating"
                    ? "generating"
                    : "planning"
              }
            />
          </Suspense>
        </div>
      )}
      {msg.role === "assistant" && msg.videoJobId && !(msg.videos && msg.videos.length > 0) && (
        <div className="px-3 md:px-12">
          <VideoJobProgress jobId={msg.videoJobId} className="mb-2" />
        </div>
      )}
      {showMediaSkeleton && (
        <div className="px-3 md:px-12">
          <MediaGenerationSkeleton
            kind={msg.mode === "video" ? "video" : "images"}
          />
        </div>
      )}
      {msg.role === "assistant" && (msg.slidesOutline || msg.slidesPlan) && (
        <div className="px-3 md:px-12">
          <Suspense fallback={null}>
            <SlidesOutlineCard
              outline={msg.slidesPlan?.outline || msg.slidesOutline!}
              plan={msg.slidesPlan}
              messageId={msg.id}
              conversationId={conversationId}
              userId={chatUserId}
              status={msg.slidesDeck || msg.standardSlides || msg.imageSlides ? "done" : msg.slidesJobId ? "generating" : "planning"}
            />
          </Suspense>
        </div>
      )}
      {msg.role === "assistant" && msg.slidesDeck && (
        <div className="px-3 md:px-12">
          <Suspense fallback={null}>
            <SlidesDeckCard deck={msg.slidesDeck} />
          </Suspense>
        </div>
      )}
      {msg.role === "assistant" && msg.standardSlides && (
        <div className="px-3 md:px-12">
          <Suspense fallback={null}>
            <StandardSlidesCard
              title={msg.standardSlides.title}
              templateName={msg.standardSlides.templateName}
              url={msg.standardSlides.url}
              colors={msg.standardSlides.colors}
              slides={msg.standardSlides.slides}
              chatName={conversationTitle}
            />
          </Suspense>
        </div>
      )}
      {msg.role === "assistant" && msg.imageSlides && (
        <div className="px-3 md:px-12">
          <Suspense fallback={null}>
            <ImageSlidesCard
              title={msg.imageSlides.title}
              url={msg.imageSlides.url}
              slideCount={msg.imageSlides.slideCount}
              chatName={conversationTitle}
            />
          </Suspense>
        </div>
      )}
      {msg.role === "assistant" && msg.siteBuild?.siteId && (
        <div className="px-3 md:px-12">
          <Suspense fallback={null}>
            <SiteBuildCard siteId={msg.siteBuild.siteId} />
          </Suspense>
        </div>
      )}
      {msg.role === "assistant" && msg.paywall && (
        <div className="px-3 md:px-12">
          <Suspense fallback={null}>
            <UpgradeRequiredCard feature={msg.paywall.feature} />
          </Suspense>
        </div>
      )}
      {msg.role === "assistant" && msg.mediaPlan && (
        <Suspense fallback={null}>
          <AssistantMediaBlock
            msg={msg as any}
            setMessages={setMessages as any}
            setInput={setInput}
            setIsLoading={setIsLoading}
            setIsThinking={setIsThinking}
          />
        </Suspense>
      )}
      {msg.role === "assistant" && msg.docsClarify && (
        <Suspense fallback={null}>
          <AssistantDocsClarifyBlock
            msg={msg as any}
            conversationId={conversationId}
            setMessages={setMessages as any}
            setIsLoading={setIsLoading}
            setIsThinking={setIsThinking}
            setSearchStatus={setSearchStatus as any}
            resetToolUi={resetToolUi}
            startDocsStatusFallback={startDocsStatusFallback}
            stopDocsStatusFallback={stopDocsStatusFallback}
            saveMessage={saveMessage as any}
          />
        </Suspense>
      )}
      {msg.role === "assistant" &&
        msg.mode === "slides" &&
        !msg.slidesDeck &&
        !msg.standardSlides &&
        !msg.slidesJobId &&
        !msg.content?.trim() &&
        !isLoading && (
          <div className="px-3 md:px-12 mt-3">
            <div className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur-xl p-4 max-w-xl">
              <div className="text-[13px] font-medium text-foreground mb-1">
                Slides not available
              </div>
              <div className="text-[12px] text-muted-foreground mb-3">
                Slide generation was interrupted before completing. You can regenerate it.
              </div>
              <button
                onClick={() => {
                  const topic =
                    msg.slidesPendingTopic ||
                    (i > 0 && messages[i - 1]?.role === "user" ? messages[i - 1].content : "");
                  if (topic) {
                    setChatMode("slides");
                    handleSendWithText(topic);
                  }
                }}
                className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-foreground text-background text-[12.5px] font-semibold hover:opacity-90 transition"
              >
                Regenerate slides
              </button>
            </div>
          </div>
        )}
    </>
  );

  if (!isLast && !isStreamingThis) {
    return <div>{content}</div>;
  }

  return (
    <div
      key={msg.clientId || msg.id || `idx-${i}`}
      className={isStreamingThis ? undefined : "chat-message-enter"}
    >
      {content}
    </div>
  );
};

// Wrap in React.memo so a new message (or state change on ChatPage) doesn't
// re-render every existing bubble. Custom compare: re-render only when the
// message reference itself changes, when its index changes, or when this
// specific item is the streaming/editing target (isLoading/isThinking flags
// only matter for the LAST message that shows the typing indicator).
export const ChatMessageItem = memo(ChatMessageItemImpl, (prev, next) => {
  if (prev.msg !== next.msg) return false;
  if (prev.i !== next.i) return false;
  if (prev.lastMessageIdx !== next.lastMessageIdx) return false;
  // Only the last message cares about the global streaming flags.
  const isLast = next.i === next.lastMessageIdx;
  if (isLast) {
    if (prev.isLoading !== next.isLoading) return false;
    if (prev.isThinking !== next.isThinking) return false;
    if (prev.searchStatus !== next.searchStatus) return false;
    if (prev.toolActivity !== next.toolActivity) return false;
    if (prev.parallelTasks !== next.parallelTasks) return false;
    if (prev.narrations !== next.narrations) return false;
  }
  if (prev.showReadersIdx !== next.showReadersIdx) return false;
  if (prev.messageReactions !== next.messageReactions) return false;
  if (prev.readersByMessageId !== next.readersByMessageId) return false;
  return true;
});

export default ChatMessageItem;
