import { useEffect, type MutableRefObject } from "react";

/**
 * Mirrors the unread-count into the document title (e.g. "(3) Megsy") while
 * the tab is hidden, and clears it back to the original title when the user
 * returns to the tab.
 */
export function useUnreadDocumentTitle(params: {
  unreadCount: number;
  originalTitleRef: MutableRefObject<string>;
  setUnreadCount: (next: number) => void;
}) {
  const { unreadCount, originalTitleRef, setUnreadCount } = params;

  useEffect(() => {
    if (!originalTitleRef.current) originalTitleRef.current = document.title;
    const onVis = () => {
      if (!document.hidden) {
        setUnreadCount(0);
        document.title = originalTitleRef.current;
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (unreadCount > 0) document.title = `(${unreadCount}) ${originalTitleRef.current || "Chat"}`;
    else if (originalTitleRef.current) document.title = originalTitleRef.current;
  }, [unreadCount, originalTitleRef]);
}
