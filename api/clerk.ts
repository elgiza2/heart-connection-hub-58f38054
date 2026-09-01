/** @doc Serverless endpoint for Clerk-backed sign-in bridging and app integrations. */
import { handleClerk, type ClerkPayload } from "../src/lib/clerk/bridgeCore";
import { apiHeaders } from "../src/lib/api/authenticateRequest";
import { guardPublicRequest, guardResponse } from "../src/lib/api/apiGuard";

export const config = { runtime: "nodejs" };

export default async function handler(req: Request): Promise<Response> {
  // Same strict origin allowlist as the rest of the API — never `*`, because
  // this bridge mints sign-in state.
  const headers = apiHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers,
    });
  }
  const guard = guardPublicRequest(req, "clerk", 20, 5 * 60 * 1000);
  if (!guard.ok) return guardResponse(guard, headers);

  const body = (await req.json().catch(() => null)) as ClerkPayload | null;
  try {
    const result = await handleClerk(body);
    return new Response(JSON.stringify(result.body), { status: result.status, headers });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "clerk_failed" }),
      { status: 500, headers },
    );
  }
}
