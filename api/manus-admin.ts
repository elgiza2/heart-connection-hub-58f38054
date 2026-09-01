/** @doc Vercel serverless endpoint backing the password-protected /m keys page. */
import { handleDevAdmin, type DevAdminPayload } from "../src/lib/devagent/adminCore";
import { handleManusAdmin, type AdminPayload } from "../src/lib/manus/adminCore";
import { apiHeaders } from "../src/lib/api/authenticateRequest";
import { guardPublicRequest, guardResponse } from "../src/lib/api/apiGuard";

export const config = { runtime: "nodejs" };

/**
 * The Hobby plan allows at most 12 serverless functions per deployment.
 * Both admin endpoints share the same transport contract, so keep one
 * function and dispatch to the appropriate provider-specific core.
 * The legacy /api/dev-admin path is rewritten here by vercel.json.
 */
export default async function handler(req: Request): Promise<Response> {
  const cors = apiHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: cors,
    });
  }
  const guard = guardPublicRequest(req, "manus-admin", 10, 15 * 60 * 1000);
  if (!guard.ok) return guardResponse(guard, cors);

  const provider = new URL(req.url).searchParams.get("provider");
  const payload = (await req.json().catch(() => null)) as (AdminPayload & DevAdminPayload) | null;
  const result =
    provider === "freestyle"
      ? await handleDevAdmin(payload as DevAdminPayload | null, process.env.M_ADMIN_PASSWORD)
      : await handleManusAdmin(payload as AdminPayload | null, process.env.M_ADMIN_PASSWORD);

  return new Response(JSON.stringify(result.body), { status: result.status, headers: cors });
}
