import { authenticatedFetch } from "@/lib/authenticatedFetch";

export async function renderDocPdf(input: { html: string; title?: string }) {
  const response = await authenticatedFetch("/api/render-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await response.json().catch(() => null)) as
    | { url?: string; documentId?: string; error?: string }
    | null;
  if (!response.ok || !data?.url) throw new Error(data?.error || "Could not render PDF");
  return data;
}