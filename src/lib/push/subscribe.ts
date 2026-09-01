/** @doc Web Push subscription helper — registers the push service worker,
 *  asks for notification permission, and stores the subscription in Supabase. */
import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY =
  "BOBOdVaIHzGgC6nL0bFah5z2TDjQsggrUP9uYexnAyhdEf_Y5KuK0BEHFO31tm-sd5QS0rvUX_slMh8AVNHQfvM";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function arrayBufferToBase64(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export async function ensurePushSubscription(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  if (typeof window === "undefined") return { ok: false, reason: "no window" };
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, reason: "unsupported" };
  }
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { ok: false, reason: "not signed in" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  const reg =
    (await navigator.serviceWorker.getRegistration("/megsy-push-sw.js")) ||
    (await navigator.serviceWorker.register("/megsy-push-sw.js", { scope: "/" }));
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
    });
  }

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  const endpoint = json.endpoint || sub.endpoint;
  const p256dh = json.keys?.p256dh || arrayBufferToBase64(sub.getKey("p256dh"));
  const auth = json.keys?.auth || arrayBufferToBase64(sub.getKey("auth"));

  if (!endpoint || !p256dh || !auth) return { ok: false, reason: "bad subscription" };

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: navigator.userAgent.slice(0, 200),
    },
    { onConflict: "endpoint" },
  );
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}
