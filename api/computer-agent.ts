/** @doc Vercel serverless endpoint powering the in-chat Computer Agent. */
import { handleComputerAgent, type ComputerPayload } from "../src/lib/manus/agentCore";
import { apiHeaders } from "../src/lib/api/authenticateRequest";
import { guardApiRequest, guardResponse } from "../src/lib/api/apiGuard";

export const config = { runtime: "nodejs" };

export default async function handler(req: Request): Promise<Response> {
  const headers = apiHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }
  const guard = await guardApiRequest(req, "computer-agent");
  if (!guard.ok) return guardResponse(guard, headers);
  const payload = (await req.json().catch(() => null)) as ComputerPayload | null;
  const result = await handleComputerAgent(payload);
  return new Response(JSON.stringify(result.body), { status: result.status, headers });
}
