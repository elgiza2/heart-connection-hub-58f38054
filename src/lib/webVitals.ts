/**
 * @doc web-vitals RUM reporter. Measures LCP/INP/CLS/TTFB/FCP in real browsers
 * and forwards to (optionally) a beacon endpoint, otherwise logs in dev.
 * Segments by device class + connection type so field data can be sliced the
 * way Meta/Google slice production RUM.
 */
import { onLCP, onINP, onCLS, onTTFB, onFCP, type Metric } from "web-vitals";

type Conn = { effectiveType?: string; saveData?: boolean };

function deviceClass(): "mobile" | "tablet" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone/i.test(ua)) return "mobile";
  return "desktop";
}

function send(metric: Metric) {
  const conn = (navigator as unknown as { connection?: Conn }).connection ?? {};
  const payload = {
    name: metric.name,
    value: Math.round(metric.value * 100) / 100,
    rating: metric.rating,
    id: metric.id,
    navType: metric.navigationType,
    device: deviceClass(),
    conn: conn.effectiveType || "unknown",
    saveData: !!conn.saveData,
    path: location.pathname,
    ts: Date.now(),
  };
  const endpoint = (import.meta.env.VITE_WEB_VITALS_ENDPOINT as string | undefined) || "";
  if (endpoint) {
    try {
      const body = JSON.stringify(payload);
      if ("sendBeacon" in navigator) {
        navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
      } else {
        void fetch(endpoint, { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } });
      }
    } catch {
      /* ignore */
    }
  } else if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug("[web-vitals]", payload.name, payload.value, payload.rating, payload);
  }
}

let started = false;
export function initWebVitals(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    onLCP(send);
    onINP(send);
    onCLS(send);
    onTTFB(send);
    onFCP(send);
  } catch {
    /* ignore */
  }
}
