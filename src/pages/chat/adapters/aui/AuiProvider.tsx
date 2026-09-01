import type { ReactNode } from "react";
import type { Message } from "../../chatConstants";
import type { AttachedFile } from "../../hooks/useAttachments";

interface AuiProviderProps {
  messages: Message[];
  isRunning: boolean;
  onNew?: (text: string) => void | Promise<void>;
  onEdit?: (parentIndex: number, newText: string) => void | Promise<void>;
  onReload?: (parentIndex: number) => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
  onFeedback?: (index: number, liked: boolean | null) => void;
  attachedFiles?: AttachedFile[];
  children: ReactNode;
}

/**
 * لف واجهات المحادثة (ChatPage / SharedChatPage) بـ AssistantRuntimeProvider
 * من assistant-ui. الـ runtime يعمل كـ read-mostly external store فوق
 * الـ pipeline الحالي.
 */
export function AuiProvider({
  children,
}: AuiProviderProps) {
  // The app's React state is the authoritative chat runtime. Keeping a second
  // external-store runtime mounted caused React 19 snapshot loops on startup.
  return <>{children}</>;
}

