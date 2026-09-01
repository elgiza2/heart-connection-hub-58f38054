// Lazy-loaded heavy/conditionally-rendered components extracted from
// ChatPage.tsx. Keeping these in their own module shrinks the chat page
// source file and makes the lazy boundary easy to audit.
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";

// Use the shared lazyWithRetry helper which retries dynamic imports on
// transient failures and force-reloads (rate-limited) on stale chunks.
const retryImport = <T,>(f: () => Promise<T>): Promise<T> => f();

export const SlidesDeckCard = lazy(() => retryImport(() => import("@/components/chat/SlidesDeckCard")));
export const StandardSlidesCard = lazy(() => retryImport(() => import("@/components/chat/StandardSlidesCard")));
export const ImageSlidesCard = lazy(() => retryImport(() => import("@/components/chat/ImageSlidesCard")));
export const DocsPlanCard = lazy(() => retryImport(() => import("@/components/chat/DocsPlanCard")));
export const SlidesOutlineCard = lazy(() => retryImport(() => import("@/components/chat/SlidesOutlineCard")));
export const MediaPlanCard = lazy(() => retryImport(() => import("@/components/chat/media/MediaPlanCard")));
export const MediaResultCard = lazy(() => retryImport(() => import("@/components/chat/media/MediaResultCard")));

export const OperatorInlineBubbleLazy = lazy(() =>
  retryImport(() => import("@/components/operator/OperatorInlineBubble")).then((m) => ({
    default: m.OperatorInlineBubble,
  })),
);

export const InChatTimerCard = lazy(() => retryImport(() => import("@/components/learn/InChatTimerCard")));
export const ConnectorsDialog = lazy(() => retryImport(() => import("@/components/integrations/ConnectorsDialog")));
export const DirectoryDialog = lazy(() => retryImport(() => import("@/components/integrations/DirectoryDialog")));
export const TemplatePickerSheet = lazy(() => retryImport(() => import("@/components/files/TemplatePickerSheet")));
export const DocsArtifactCard = lazy(() =>
  retryImport(() => import("@/components/chat/agents/docs/DocsArtifactCard")),
);
export const DocsClarifyCard = lazy(() =>
  retryImport(() => import("@/components/chat/agents/docs/DocsClarifyCard")),
);
