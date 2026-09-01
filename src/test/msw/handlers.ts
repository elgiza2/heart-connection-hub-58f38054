import { http, HttpResponse } from "msw";

/** Default request handlers for unit/integration tests. */
export const handlers = [
  // Generic Supabase REST stub — extend per-test as needed.
  http.get("https://*.supabase.co/rest/v1/*", () => HttpResponse.json([], { status: 200 })),
  http.post("https://*.supabase.co/auth/v1/*", () =>
    HttpResponse.json({ user: null, session: null }, { status: 200 }),
  ),
  // Edge functions
  http.post("https://*.functions.supabase.co/*", () =>
    HttpResponse.json({ ok: true }, { status: 200 }),
  ),
];
