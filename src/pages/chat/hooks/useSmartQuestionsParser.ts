import { useEffect } from "react";
import type { Message } from "../chatConstants";

export type PendingQuestion = {
  title: string;
  options: string[];
  allowText?: boolean;
};

/**
 * Whenever streaming completes, scan the latest assistant message for
 * ```json ... { "type": "questions" } ``` blocks and lift those into the
 * sidecar "pending questions" prompt so the user can answer with one tap.
 */
export function useSmartQuestionsParser(params: {
  messages: Message[];
  isLoading: boolean;
  setPendingQuestions: (next: PendingQuestion[]) => void;
}) {
  const { messages, isLoading, setPendingQuestions } = params;

  useEffect(() => {
    if (isLoading) return;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "assistant") return;

    const jsonBlockRegex = /```json\s*\n?([\s\S]*?)\n?```/g;
    const questions: PendingQuestion[] = [];
    let match;
    while ((match = jsonBlockRegex.exec(lastMsg.content)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.type === "questions" && parsed.questions) {
          questions.push(...parsed.questions);
        }
      } catch {
        /* not a JSON questions block */
      }
    }
    if (questions.length > 0) setPendingQuestions(questions);
  }, [messages, isLoading, setPendingQuestions]);
}
