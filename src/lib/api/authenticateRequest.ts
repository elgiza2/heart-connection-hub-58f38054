import { createClient, type User } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabaseServerConfig";

export interface AuthenticatedRequest {
  user: User;
}

export async function authenticateRequest(request: Request): Promise<AuthenticatedRequest | null> {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return { user: data.user };
}

export function apiHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const allowed = new Set(
    [
      process.env.APP_URL,
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
      // Production origins, so the API works with zero env configuration.
      "https://megsyai.com",
      "https://www.megsyai.com",
    ]
      .filter(Boolean)
      .map(String),
  );
  if (origin === "https://id-preview--5db12946-613d-4ff3-84fc-3608bdee3f03.lovable.app") {
    allowed.add(origin);
  }
  if (process.env.NODE_ENV !== "production" && origin?.startsWith("http://localhost:"))
    allowed.add(origin);

  return {
    ...(origin && allowed.has(origin)
      ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
      : {}),
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
}
