import { z } from "zod";
import { apiHeaders } from "../src/lib/api/authenticateRequest";
import { guardApiRequest, guardResponse } from "../src/lib/api/apiGuard";

export const config = { runtime: "nodejs" };

const BASE = "https://api.transactional.dev/v1";
const InputSchema = z.object({
  html: z.string().min(20).max(2_000_000),
  title: z.string().max(180).optional(),
});

function stripUnsafeHtml(html: string): string {
  return html
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    .replace(/<\s*(iframe|object|embed|meta|link|form)[\s\S]*?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript\s*:/gi, "blocked:");
}

async function requestProvider(path: string, method: string, token: string, body?: unknown) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { "x-api-token": token, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`PDF provider rejected the request (${response.status})`);
  return text ? JSON.parse(text) : null;
}

export default async function handler(request: Request): Promise<Response> {
  const headers = apiHeaders(request);
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST")
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  const guard = await guardApiRequest(request, "render-pdf");
  if (!guard.ok) return guardResponse(guard, headers);

  const parsed = InputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return new Response(JSON.stringify({ error: "Invalid document" }), { status: 400, headers });
  const token = process.env.TRANSACTIONAL_API_KEY;
  if (!token)
    return new Response(JSON.stringify({ error: "PDF export is not configured" }), {
      status: 503,
      headers,
    });

  try {
    const created = await requestProvider("/documents", "POST", token, {
      name: parsed.data.title || "document",
    });
    const id = Number(created?.id);
    const uuid = String(created?.uuid || "");
    if (!id || !uuid) throw new Error("Invalid provider response");
    await requestProvider(`/documents/${id}`, "PATCH", token, {
      body: stripUnsafeHtml(parsed.data.html),
      framework: "TAILWIND",
      format: "A4",
    });
    const generated = await requestProvider("/generate", "POST", token, {
      documentId: uuid,
      variables: {},
    });
    if (!generated?.url) throw new Error("PDF URL missing");
    return new Response(JSON.stringify({ url: generated.url, documentId: uuid }), {
      status: 200,
      headers,
    });
  } catch {
    return new Response(JSON.stringify({ error: "Could not render PDF" }), {
      status: 502,
      headers,
    });
  }
}
