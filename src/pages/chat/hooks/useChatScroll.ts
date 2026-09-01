import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type { Message } from "../chatConstants";

/**
 * Encapsulates the chat-transcript scroll behavior:
 *   - `handleScroll`: toggles the floating "scroll to bottom" button and
 *     clears the unread counter when the user is back near the bottom.
 *   - `scrollToBottom`: smoothly jumps to the latest message.
 *   - auto-scroll on the user's own outgoing messages.
 *   - smart pinning during assistant streaming (ChatGPT-style).
 */
export function useChatScroll(params: {
  messages: Message[];
  isLoading: boolean;
  messagesContainerRef: MutableRefObject<HTMLDivElement | null>;
  messagesEndRef: MutableRefObject<HTMLDivElement | null>;
  setShowScrollBtn: (next: boolean) => void;
  setNewMessagesCount: (next: number | ((prev: number) => number)) => void;
}) {
  const {
    messages,
    messagesContainerRef,
    messagesEndRef,
    setShowScrollBtn,
    setNewMessagesCount,
  } = params;
  void params.isLoading;

  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 200);
    if (distFromBottom < 100) setNewMessagesCount(0);
  }, [messagesContainerRef, setShowScrollBtn, setNewMessagesCount]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setNewMessagesCount(0);
  }, [messagesEndRef, setNewMessagesCount]);

  const lastMsgCountRef = useRef(0);

  // Auto-scroll only on the user's own new message, not during streaming.
  useEffect(() => {
    const prevCount = lastMsgCountRef.current;
    lastMsgCountRef.current = messages.length;
    if (
      messages.length > prevCount &&
      messages.length > 0 &&
      messages[messages.length - 1].role === "user"
    ) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, messagesEndRef]);

  // Intentionally NO auto-scroll during assistant streaming.
  // The user must stay free to scroll anywhere (read the reply from the top,
  // scroll up to earlier messages, etc.) while the model keeps typing.
  // A floating "scroll to bottom" button + unread counter handles catching up.


  return { handleScroll, scrollToBottom };
}
