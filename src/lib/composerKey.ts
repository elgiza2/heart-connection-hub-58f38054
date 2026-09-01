/**
 * Detects whether the current viewport is mobile-sized.
 * Used by composers to decide whether the keyboard's Enter key
 * should send a message (desktop) or insert a newline (mobile).
 */
export const isMobileViewport = (): boolean =>
  typeof window !== "undefined" && window.innerWidth < 768;

export type SendMode = "enter" | "shift_enter";
const SEND_MODE_KEY = "composer_send_mode";

/** Read the user's preferred desktop send mode. Defaults to "enter". */
export const getSendMode = (): SendMode => {
  if (typeof window === "undefined") return "enter";
  try {
    const v = localStorage.getItem(SEND_MODE_KEY);
    return v === "shift_enter" ? "shift_enter" : "enter";
  } catch {
    return "enter";
  }
};

/** Persist the desktop send mode. */
export const setSendMode = (mode: SendMode) => {
  try {
    localStorage.setItem(SEND_MODE_KEY, mode);
    window.dispatchEvent(new Event("composer-send-mode-change"));
  } catch {}
};

/**
 * Returns true when the keyboard's Enter press should submit/send
 * in a chat composer textarea.
 * - Desktop (>=768px):
 *     mode "enter":       Enter → send,  Shift+Enter → newline (default)
 *     mode "shift_enter": Shift+Enter → send, Enter → newline
 * - Mobile (<768px):     Enter inserts a newline (returns false)
 * Also respects IME composition state.
 */
export const isSendKey = (e: {
  key: string;
  shiftKey: boolean;
  nativeEvent?: { isComposing?: boolean };
}): boolean => {
  if (e.key !== "Enter") return false;
  if (e.nativeEvent?.isComposing) return false;
  if (isMobileViewport()) return false;
  const mode = getSendMode();
  if (mode === "shift_enter") return e.shiftKey === true;
  return e.shiftKey === false;
};
