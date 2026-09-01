import { useEffect } from "react";

const STORAGE_KEY = "megsy_pending_first_prompt";
const TTL_MS = 30 * 60 * 1000;

/**
 * After a brand-new signup, the landing page stores the user's first prompt
 * in `sessionStorage`. When the chat mounts we read it (once), send it
 * automatically, and clear the slot. Prompts older than 30 min are ignored.
 */
export function usePostSignupPrompt(send: (text: string) => void) {
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      sessionStorage.removeItem(STORAGE_KEY);
      const { prompt, ts } = JSON.parse(raw) as { prompt: string; ts: number };
      if (!prompt || Date.now() - ts > TTL_MS) return;
      const t = window.setTimeout(() => {
        send(prompt);
      }, 600);
      return () => window.clearTimeout(t);
    } catch {
      /* noop */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
