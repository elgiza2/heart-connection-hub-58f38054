import { forwardRef, Suspense, lazy } from "react";
import { ChatMessageItem } from "./ChatMessageItem";
// Study timers overlay is only visible in learning mode — lazy-load its chunk
// so non-learning users never download it.
const StudyTimersOverlay = lazy(() =>
  import("./StudyTimersOverlay").then((m) => ({ default: m.StudyTimersOverlay })),
);
// StudyHUD is also learning-only — lazy-load so non-learners never pay for it.
const StudyHUD = lazy(() =>
  import("@/components/learn/StudyHUD").then((m) => ({ default: m.StudyHUD })),
);
import { SystemEventsList } from "./SystemEventsList";
import { TypingIndicator } from "./TypingIndicator";
import type { ChatMode } from "../chatConstants";

interface ChatMessagesListProps {
  messages: any[];
  editingIndex: number | null;
  chatMode: ChatMode;
  studyTimers: any;
  setStudyTimers: any;
  systemEvents: any[];
  typingUsers: any;
  colorForUser: any;
  // ChatMessageItem props
  chatUserId: string | null;
  conversationId: string | null;
  conversationTitle: string;
  isLoading: boolean;
  isThinking: boolean;
  searchStatus: any;
  toolActivity: any;
  parallelTasks: any;
  narrations: any;
  hasMembers: boolean;
  messageReactions: any;
  readersByMessageId: any;
  showReadersIdx: any;
  lastMessageIdx: number;
  handleLikeMessage: any;
  handleStructuredAction: any;
  handleEditUserMessageAt: any;
  dismissOperatorRun: any;
  toggleReaction: any;
  setMessages: any;
  setInput: any;
  setIsLoading: any;
  setIsThinking: any;
  setSearchStatus: any;
  setChatMode: any;
  resetToolUi: any;
  startDocsStatusFallback: any;
  stopDocsStatusFallback: any;
  saveMessage: any;
  handleSendWithText: any;
}

export const ChatMessagesList = forwardRef<HTMLDivElement, ChatMessagesListProps>(
  function ChatMessagesList(props, messagesEndRef) {
    const {
      messages,
      editingIndex,
      chatMode,
      studyTimers,
      setStudyTimers,
      systemEvents,
      typingUsers,
      colorForUser,
      ...itemProps
    } = props;

    return (
      <div
        data-no-translate="true"
        className="max-w-3xl mx-auto pt-20 pb-56 md:pb-64 px-4 md:px-6 space-y-2"
        style={editingIndex !== null ? { visibility: "hidden" } : undefined}
      >
        {chatMode === "learning" && (
          <Suspense fallback={null}>
            <StudyHUD />
          </Suspense>
        )}
        {(() => {
          return messages.map((msg, i) => {
            if (msg.hiddenFromTranscript) return null;
            return (
              <div
                key={msg.clientId || msg.id || `idx-${i}`}
                data-msg-anchor={msg.clientId || msg.id || `idx-${i}`}
                style={{
                  contentVisibility: "auto",
                  containIntrinsicSize: "auto 120px",
                }}
              >
                <ChatMessageItem
                  msg={msg}
                  i={i}
                  messages={messages}
                  colorForUser={colorForUser}
                  {...(itemProps as any)}
                />
              </div>
            );
          });
        })()}
        {chatMode === "learning" && (
          <Suspense fallback={null}>
            <StudyTimersOverlay timers={studyTimers} setTimers={setStudyTimers} />
          </Suspense>
        )}

        <SystemEventsList events={systemEvents} />

        <TypingIndicator typingUsers={typingUsers} colorForUser={colorForUser} />
        <div ref={messagesEndRef} />
      </div>
    );
  },
);
