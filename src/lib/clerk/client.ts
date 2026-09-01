/** @doc Browser helper for the /api/clerk endpoint. */
export type ClerkResponse = {
  ok?: boolean;
  error?: string;
  email?: string;
  token_hash?: string;
  accounts?: { provider: string; label: string | null; approved_scopes: string[] }[];
  connected?: boolean;
  scopes?: string[];
};

export async function clerkApi(
  action: string,
  clerkToken: string,
  payload: Record<string, unknown> = {},
): Promise<ClerkResponse> {
  const res = await fetch("/api/clerk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, clerk_token: clerkToken, ...payload }),
  });
  const body = (await res.json().catch(() => null)) as ClerkResponse | null;
  if (!body) throw new Error("Request failed");
  if (!res.ok && body.error) throw new Error(body.error);
  return body;
}
