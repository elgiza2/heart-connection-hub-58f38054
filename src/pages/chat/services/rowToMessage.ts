import { sanitizeLeakedToolText } from "../chatUtils";
import type { Message } from "../chatConstants";

type SenderMap = Record<string, { name: string | null; avatar: string | null }>;
type ConvMode = string | undefined;

/**
 * Maps a raw `messages` row from Supabase into the in-memory `Message`
 * shape used by the chat UI. Handles:
 *  - tool-text leak sanitization for assistant messages
 *  - sender name/avatar lookup from a pre-built profile map
 *  - kind → render-mode mapping for slides / images / operator / research
 *  - copying metadata payloads (slidesDeck, imageSlides, docsArtifact, …)
 *
 * Returns `null` for empty assistant rows with no images/metadata so the
 * caller can filter them out cleanly.
 */
export function rowToMessage(
  row: any,
  senderMap: SenderMap,
  convMode: ConvMode,
  feedbackByMessageId: Record<string, boolean | null> = {},
): Message | null {
  const role = row.role as "user" | "assistant";
  const content = role === "assistant" ? sanitizeLeakedToolText(row.content) : row.content;
  const meta = (row.metadata || {}) as any;
  const hasMedia = !!meta.mediaPlan;
  // Detect interrupted assistant streams: empty content but no async job/media pending.
  // A pending docs/slides/research job is only considered "still running" if it was
  // started within the last 15 minutes; older placeholders are treated as stale so
  // the user sees a retry state instead of an eternal loading spinner on reload.
  const createdAtMs = row.created_at ? new Date(row.created_at).getTime() : 0;
  const isFresh = createdAtMs > 0 && Date.now() - createdAtMs < 15 * 60 * 1000;
  const hasPendingJob = isFresh && !!(
    meta.chatJobId || meta.docsJobId || meta.slidesJobId ||
    meta.operatorRunId || meta.computerTaskId || meta.longRunId || hasMedia ||
    meta.kind === "slidesPending" || meta.kind === "docsPending" || meta.kind === "researchPending"
  );
  const interrupted =
    role === "assistant" && !content && !row.images?.length && !meta.videos?.length && !hasPendingJob;

  if (role === "assistant" && !content && !row.images?.length && !meta.videos?.length && !row.metadata && !hasMedia) {
    return null;
  }

  return {
    role,
    content,
    images: row.images || undefined,
    videos: Array.isArray(meta.videos) ? meta.videos : undefined,
    audios: Array.isArray(meta.audios) ? meta.audios : undefined,
    liked:
      row.id && Object.prototype.hasOwnProperty.call(feedbackByMessageId, row.id)
        ? feedbackByMessageId[row.id]
        : row.liked,
    id: row.id,
    user_id: row.user_id,
    senderName: row.user_id ? senderMap[row.user_id]?.name : null,
    senderAvatar: row.user_id ? senderMap[row.user_id]?.avatar : null,
    hiddenFromTranscript: !!meta.hiddenFromTranscript || meta.kind === "learnAnswer",
    mode:
      meta.kind === "mediaPlan"
        ? meta.mode === "video"
          ? "video"
          : "images"
        : meta.kind === "operatorRun"
          ? "operator"
          : meta.kind === "imageSlides" || convMode === "slides-images"
            ? "slides-images"
            : meta.kind === "slidesDeck" ||
                meta.kind === "standardSlides" ||
                meta.kind === "slidesPending" ||
                convMode === "slides"
              ? "slides"
              : role === "assistant" &&
                  (meta.kind === "deepResearch" ||
                    meta.mode === "deep-research" ||
                    convMode === "research")
                ? "deep-research"
                : convMode === "learning"
                  ? "learning"
                  : undefined,
    slidesDeck: meta.slidesDeck || undefined,
    standardSlides: meta.standardSlides || undefined,
    imageSlides: meta.imageSlides || undefined,
    slidesPendingTopic: meta.kind === "slidesPending" ? meta.topic : undefined,
    slidesPlan: meta.slidesPlan || undefined,
    slidesOutline: meta.slidesOutline || meta.slidesPlan?.outline || undefined,
    slidesJobId: meta.kind === "slidesPending" ? meta.slidesJobId : undefined,
    docsArtifact: meta.docsArtifact || undefined,
    docsClarify: meta.docsClarify || undefined,
    docsPlan: meta.docsPlan || undefined,
    docsJobId: meta.kind === "docsPending" ? meta.docsJobId : undefined,
    chatJobId: meta.kind === "researchPending" ? meta.chatJobId : undefined,
    operatorRunId: meta.kind === "operatorRun" ? meta.operatorRunId : undefined,
    computerTaskId: meta.kind === "computerTask" ? meta.computerTaskId : undefined,
    longRunId: meta.kind === "longRun" ? meta.longRunId : undefined,
    computerPlan: meta.kind === "longRun" ? meta.computerPlan : undefined,
    // Restore media generation state (plan + per-scene results + merged video).
    mediaPlan: hasMedia ? meta.mediaPlan : undefined,
    mediaStatus: hasMedia ? (meta.mediaStatus ?? "done") : undefined,
    mediaResults: hasMedia ? meta.mediaResults : undefined,
    mediaFinalVideoUrl: hasMedia ? meta.mediaFinalVideoUrl : undefined,
    mediaMergeStatus: hasMedia ? meta.mediaMergeStatus : undefined,
    // Restore website build card.
    siteBuild:
      meta.siteBuild ||
      (meta.kind === "siteBuild" && meta.siteId ? { siteId: meta.siteId } : undefined),
    // Restore branching state (regenerate / edit history).
    altBranches: Array.isArray(meta.altBranches) ? (meta.altBranches as Message[][]) : undefined,
    branchPosition:
      typeof meta.branchPosition === "number" ? (meta.branchPosition as number) : undefined,
    toolParts: Array.isArray(meta.toolParts) ? meta.toolParts : undefined,
    reasoning: typeof meta.reasoning === "string" ? meta.reasoning : undefined,
    metadata: meta,
    timing: meta.timing && typeof meta.timing === "object" ? meta.timing : undefined,
    modelLabel: typeof meta.modelLabel === "string" ? meta.modelLabel : undefined,
    interrupted: interrupted || undefined,
  } as Message;
}

