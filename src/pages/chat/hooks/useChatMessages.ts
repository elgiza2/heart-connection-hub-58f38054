import { useRef, useState } from "react";
import type { Message } from "../chatConstants";

/**
 * Encapsulates state for the composer input, transcript messages, loading
 * indicators, scroll refs, and the abort controller for in-flight requests.
 * Extracted from ChatPage to reduce re-render surface.
 */
export function useChatMessages() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  return {
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
  };
}
