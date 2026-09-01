/**
 * @doc useChatUrlState — keeps the chat surface addressable.
 *
 * Why: reloading /chat used to drop the open conversation (the `?conv=` param
 * was stripped from the URL right after boot), so a refresh always landed the
 * user in a brand-new empty chat. And because conversation switches never
 * touched history, the browser Back button skipped the whole chat session.
 *
 * This hook mirrors the two pieces of chat state that identify "where you are"
 * — the open conversation and the active mode — into the URL:
 *   • conversation change  → pushState (so Back returns to the previous chat)
 *   • first conversation / mode change → replaceState (no junk history entries)
 *   • popstate (Back/Forward) → loads whatever conversation the URL points at
 *
 * Reload then restores the exact conversation + mode, handled on mount by
 * useChatEntryEffects (`?conv=`) and useUrlMode (`?mode=`).
 */
import { useEffect, useRef } from "react";

export function useChatUrlState(params: {
  conversationId: string | null;
  chatMode: string;
  loadConversation: (id: string) => void;
  onNewChat: () => void;
}) {
  const { conversationId, chatMode, loadConversation, onNewChat } = params;

  const latest = useRef({ conversationId, loadConversation, onNewChat });
  latest.current = { conversationId, loadConversation, onNewChat };

  // state -> URL
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.pathname.startsWith("/chat")) return;

    const url = new URL(window.location.href);
    const prevConv = url.searchParams.get("conv");

    if (conversationId) url.searchParams.set("conv", conversationId);
    else url.searchParams.delete("conv");

    if (chatMode && chatMode !== "normal") url.searchParams.set("mode", chatMode);
    else url.searchParams.delete("mode");

    const next = `${url.pathname}${url.search}${url.hash}`;
    if (next === `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      return;
    }

    // Switching between two existing conversations is a real navigation.
    const isConversationSwitch = Boolean(prevConv && conversationId && prevConv !== conversationId);
    try {
      if (isConversationSwitch) window.history.pushState(window.history.state, "", next);
      else window.history.replaceState(window.history.state, "", next);
    } catch {
      /* ignore */
    }
  }, [conversationId, chatMode]);

  // URL -> state (Back / Forward)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPop = () => {
      if (!window.location.pathname.startsWith("/chat")) return;
      const conv = new URLSearchParams(window.location.search).get("conv");
      const current = latest.current.conversationId;
      if (conv && conv !== current) latest.current.loadConversation(conv);
      else if (!conv && current) latest.current.onNewChat();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
}

export default useChatUrlState;
