import { useEffect } from "react";

/**
 * Adds `app-fullscreen-active` to <body> while `active` is true so the global
 * CSS in index.css can hide the chat composer, mobile header, sidebar trigger
 * and other chrome while a fullscreen preview viewer is open.
 *
 * Reference-counted so multiple viewers can coexist without one removing the
 * class while another is still open.
 */
let count = 0;
const CLASS = "app-fullscreen-active";

export function useFullscreenBodyClass(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    count += 1;
    document.body.classList.add(CLASS);
    return () => {
      count = Math.max(0, count - 1);
      if (count === 0) document.body.classList.remove(CLASS);
    };
  }, [active]);
}
