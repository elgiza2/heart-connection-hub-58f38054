/** @doc Optional Sentry error monitoring. No-op when VITE_SENTRY_DSN is not set. */
type SentryModule = typeof import("@sentry/react");

let initialized = false;
let sentry: SentryModule | null = null;

/**
 * Sentry is loaded lazily: the SDK is ~1MB and must never sit in the initial
 * bundle. When no DSN is configured the chunk is never fetched at all.
 */
export async function initSentry() {
  if (initialized) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return; // silently disabled — Sentry is optional
  try {
    const Sentry = await import("@sentry/react");
    sentry = Sentry;
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: false,
          blockAllMedia: false,
        }),
      ],
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0,
      // Never send known noise
      ignoreErrors: [
        "ResizeObserver loop completed with undelivered notifications",
        "ResizeObserver loop limit exceeded",
        "Non-Error promise rejection captured",
        /Loading chunk \d+ failed/i,
        /Failed to fetch dynamically imported module/i,
      ],
      beforeSend(event) {
        // Strip potential PII from URLs/query strings
        if (event.request?.url) {
          try {
            const url = new URL(event.request.url);
            for (const key of ["email", "token", "code", "access_token"]) {
              if (url.searchParams.has(key)) url.searchParams.set(key, "[redacted]");
            }
            event.request.url = url.toString();
          } catch {
            /* ignore */
          }
        }
        return event;
      },
    });
    initialized = true;
  } catch {
    /* ignore — never let Sentry break the app */
  }
}

export function captureAppError(err: unknown, context?: Record<string, unknown>) {
  if (!initialized || !sentry) return;
  try {
    sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    /* ignore */
  }
}
