/** @doc computer-agent — edge runtime for the in-chat Computer Agent. */
/**
 * Edge function powering the in-chat Computer Agent (Megsy Computer).
 * Mirrors api/computer-agent.ts so the feature works on Lovable hosting,
 * where Vercel-style serverless functions under api/ are not executed.
 */
import { handleComputerAgent, type ComputerPayload } from "./agentCore.ts";

/**
 * Only our own front-ends may call this function from a browser. A wildcard
 * origin let any site drive the agent with a user's token pasted from another
 * tab, so the origin is echoed back only when it is allow-listed.
 */
const ALLOWED_ORIGIN = /^https?:\/\/(localhost(:\d+)?|127\.0\.0\.1(:\d+)?|([\w-]+\.)*lovable\.app|([\w-]+\.)*lovableproject\.com|([\w-]+\.)*megsy\.ai)$/;

const corsFor = (req: Request): Record<string, string> => {
  const origin = req.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && ALLOWED_ORIGIN.test(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
};

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req) });

  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const payload = (await req.json().catch(() => null)) as ComputerPayload | null;
  if (!payload) return json(req, { error: "Invalid JSON body" }, 400);

  // The caller's Supabase access token authenticates the request; agentCore
  // verifies it against auth.users before touching any data.
  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? undefined;
  const token = payload.token ?? bearer;

  try {
    const result = await handleComputerAgent({ ...payload, token });
    return json(req, result.body, result.status);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "server_error";
    return json(req, { error: message }, 500);
  }
});
