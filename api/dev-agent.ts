/** @doc Serverless endpoint driving the Dev Agent (start / step / status / stop). */
import { handleDevAgent, type DevAgentPayload } from "../src/lib/devagent/core";
import { apiHeaders } from "../src/lib/api/authenticateRequest";
import { guardApiRequest, guardResponse } from "../src/lib/api/apiGuard";

export const config = { runtime: "nodejs", maxDuration: 300 };

export default async function handler(req: Request): Promise<Response> {
  const cors = apiHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: cors,
    });
  }
  const guard = await guardApiRequest(req, "dev-agent");
  if (!guard.ok) return guardResponse(guard, cors);
  try {
    const payload = (await req.json().catch(() => null)) as DevAgentPayload | null;
    const result = await handleDevAgent(payload);
    return new Response(JSON.stringify(result.body), { status: result.status, headers: cors });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Dev agent failed";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: cors });
  }
}
