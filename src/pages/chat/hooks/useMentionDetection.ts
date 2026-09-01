import { useCallback, useEffect, useState } from "react";

export type MentionQuery = { q: string; start: number } | null;

/**
 * Watches the composer input for `@mention` queries and exposes a stable
 * helper that inserts the chosen name back into the input.
 */
export function useMentionDetection(params: {
  input: string;
  setInput: (next: string) => void;
  membersCount: number;
}) {
  const { input, setInput, membersCount } = params;
  const [mentionQuery, setMentionQuery] = useState<MentionQuery>(null);

  useEffect(() => {
    if (membersCount === 0) {
      setMentionQuery(null);
      return;
    }
    const m = input.match(/(?:^|\s)@(\w{0,30})$/);
    if (m) setMentionQuery({ q: m[1] || "", start: input.length - m[1].length - 1 });
    else setMentionQuery(null);
  }, [input, membersCount]);

  const insertMention = useCallback(
    (name: string) => {
      if (!mentionQuery) return;
      const before = input.slice(0, mentionQuery.start);
      const safeName = name.replace(/\s+/g, "_");
      setInput(`${before}@${safeName} `);
      setMentionQuery(null);
    },
    [input, mentionQuery, setInput],
  );

  return { mentionQuery, setMentionQuery, insertMention };
}
