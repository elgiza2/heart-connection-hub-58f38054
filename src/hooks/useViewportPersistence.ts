import { useEffect, useRef } from "react";

/**
 * Preserves scroll position of the chat window across viewport/orientation
 * changes (e.g. switching mobile ↔ desktop preview, rotating device, resizing
 * the browser window). Uses an anchor message id + delta pattern so the same
 * conversational context stays in view even when layout dimensions change.
 */
export function useViewportPersistence(
  scrollerRef: React.RefObject<HTMLElement | null>,
  key: string = "megsy_chat_anchor",
) {
  const anchorRef = useRef<{ id: string; offset: number } | null>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    // Track the topmost visible message as our anchor.
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) {
          const el = visible.target as HTMLElement;
          const id =
            el.getAttribute("data-msg-anchor") ||
            el.getAttribute("data-message-id") ||
            "";
          if (!id) return;
          const rect = el.getBoundingClientRect();
          const scrollerRect = scroller.getBoundingClientRect();
          anchorRef.current = { id, offset: rect.top - scrollerRect.top };
          try {
            sessionStorage.setItem(key, JSON.stringify(anchorRef.current));
          } catch {}
        }
      },
      { root: scroller, threshold: [0, 0.1, 0.5] },
    );

    scroller
      .querySelectorAll("[data-msg-anchor],[data-message-id]")
      .forEach((el) => io.observe(el));

    // Observe only newly-added message nodes instead of rescanning the full
    // conversation on every streaming DOM mutation.
    const mo = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.matches("[data-msg-anchor],[data-message-id]")) io.observe(node);
          node
            .querySelectorAll("[data-msg-anchor],[data-message-id]")
            .forEach((el) => io.observe(el));
        }
      }
    });
    mo.observe(scroller, { childList: true, subtree: true });

    // Restore anchor after viewport/orientation resize.
    let raf = 0;
    const restore = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        let a = anchorRef.current;
        if (!a) {
          try {
            const s = sessionStorage.getItem(key);
            if (s) a = JSON.parse(s);
          } catch {}
        }
        if (!a) return;
        const el = scroller.querySelector<HTMLElement>(
          `[data-msg-anchor="${CSS.escape(a.id)}"],[data-message-id="${CSS.escape(a.id)}"]`,
        );
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const scrollerRect = scroller.getBoundingClientRect();
        const currentOffset = rect.top - scrollerRect.top;
        const delta = currentOffset - a.offset;
        scroller.scrollTop += delta;
      });
    };

    let resizeTimer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(restore, 60);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", restore);

    // Initial restore attempt (e.g. hard reload with saved anchor).
    setTimeout(restore, 120);

    return () => {
      io.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", restore);
      clearTimeout(resizeTimer);
      cancelAnimationFrame(raf);
    };
  }, [scrollerRef, key]);
}
