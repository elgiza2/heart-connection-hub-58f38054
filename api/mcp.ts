/** @doc Serverless endpoint for the MCP gateway (tool servers the user connected). */
import { handleMcpGateway, type GatewayPayload } from "../src/lib/mcp/gatewayCore";
import { apiHeaders } from "../src/lib/api/authenticateRequest";
import { guardApiRequest, guardResponse } from "../src/lib/api/apiGuard";

export const config = { runtime: "nodejs" };

export default async function handler(req: Request): Promise<Response> {
  const headers = apiHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers,
    });
  }
  const guard = await guardApiRequest(req, "mcp");
  if (!guard.ok) return guardResponse(guard, headers);

  const body = (await req.json().catch(() => null)) as GatewayPayload | null;
  try {
    const result = await handleMcpGateway(body);
    return new Response(JSON.stringify(result.body), { status: result.status, headers });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "mcp_failed" }),
      { status: 500, headers },
    );
  }
}
