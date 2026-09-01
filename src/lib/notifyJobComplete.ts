import { toast } from "sonner";

/**
 * Fire a completion notification for a background job.
 * - Always shows a sonner toast in-app.
 * - When the tab is hidden AND the user granted Notification permission,
 *   also raises a native browser notification so long-running jobs
 *   (video, slides, deep research) surface even when the user tabbed away.
 */
export function notifyJobComplete(opts: {
  kind: "video" | "slides" | "research";
  title: string;
  body?: string;
  onClickUrl?: string;
}) {
  const { kind, title, body, onClickUrl } = opts;

  try {
    toast.success(title, { description: body });
  } catch {
    /* ignore */
  }

  try {
    if (typeof window === "undefined") return;
    if (typeof Notification === "undefined") return;
    const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    if (!hidden) return;
    if (Notification.permission !== "granted") return;
    const n = new Notification(title, {
      body,
      tag: `megsy-${kind}`,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    });
    if (onClickUrl) {
      n.onclick = () => {
        window.focus();
        window.location.href = onClickUrl;
      };
    }
  } catch {
    /* ignore */
  }
}

/** Best-effort request for Notification permission (silent when unavailable). */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    if (typeof window === "undefined" || typeof Notification === "undefined") return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    const p = await Notification.requestPermission();
    return p === "granted";
  } catch {
    return false;
  }
}
