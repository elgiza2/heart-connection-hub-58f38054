import { streamDeepResearch } from "../src/lib/research/deepResearchCore";
import { guardApiRequest, guardResponse } from "../src/lib/api/apiGuard";
import { apiHeaders } from "../src/lib/api/authenticateRequest";

export const config = { runtime: "nodejs", maxDuration: 300 };

export default async function handler(req: Request): Promise<Response> {
  const headers = apiHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  // Authenticate + rate limit BEFORE any model, search or streaming work.
  const guard = await guardApiRequest(req, "deep-research");
  if (!guard.ok) return guardResponse(guard, headers);

  const payload = await req.json().catch(() => null);
  return streamDeepResearch(payload ?? {}, req);
}
