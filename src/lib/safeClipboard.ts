// Safe clipboard wrapper that survives "Document is not focused" errors
// and browsers without async Clipboard API. Falls back to a hidden textarea
// + execCommand("copy").

export async function safeCopyText(text: string): Promise<boolean> {
  if (typeof window === "undefined" || !text) return false;

  const tryAsync = async (): Promise<boolean> => {
    try {
      if (!navigator.clipboard?.writeText) return false;
      // Ensure the document is focused — Safari/Chrome throw otherwise.
      try {
        window.focus();
      } catch {
        /* noop */
      }
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  const tryLegacy = (): boolean => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.left = "0";
      ta.style.opacity = "0";
      ta.style.pointerEvents = "none";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  };

  if (document.hasFocus?.() === false) {
    // Focus is elsewhere — async clipboard will throw. Try legacy first.
    if (tryLegacy()) return true;
    return tryAsync();
  }
  return (await tryAsync()) || tryLegacy();
}
