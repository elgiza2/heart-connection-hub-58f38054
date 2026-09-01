import { useEffect } from "react";

/**
 * Closes a menu/popover on any pointer-down outside of it. Targets that match
 * `keepOpenSelectors` are treated as "inside" and don't trigger a close.
 *
 * `mode: "immediate"` listens on `pointerdown` in the capture phase, which
 * fires before the browser's native click; `mode: "click"` waits for a real
 * click. Pass an array to attach BOTH listeners (matches the original chat
 * plus-menu behavior).
 */
export function useOutsideClickToClose(params: {
  open: boolean;
  onClose: () => void;
  keepOpenSelectors: string[];
  modes?: Array<"immediate" | "click">;
}) {
  const { open, onClose, keepOpenSelectors, modes = ["immediate"] } = params;

  useEffect(() => {
    if (!open) return;

    const isInside = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      // If the original target was removed from the DOM between pointerdown
      // and click (e.g. React re-rendered a menu sub-view), treat it as
      // "inside" — closing on a detached element is almost always a false
      // positive caused by a click on something inside the menu.
      if (!el.isConnected) return true;
      return keepOpenSelectors.some((sel) => el.closest(sel));
    };

    const handlers: Array<() => void> = [];

    if (modes.includes("immediate")) {
      const fn = (e: PointerEvent) => {
        if (isInside(e.target)) return;
        onClose();
      };
      document.addEventListener("pointerdown", fn, true);
      handlers.push(() => document.removeEventListener("pointerdown", fn, true));
    }
    if (modes.includes("click")) {
      const fn = (e: MouseEvent) => {
        if (isInside(e.target)) return;
        onClose();
      };
      document.addEventListener("click", fn);
      handlers.push(() => document.removeEventListener("click", fn));
    }

    return () => handlers.forEach((off) => off());
  }, [open, onClose, modes, keepOpenSelectors.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
}
