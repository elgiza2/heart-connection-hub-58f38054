/** @doc Server-side bridge between Clerk and the app's own accounts.
 *
 *  Clerk is only an identity/connection broker here: after a Clerk sign-in
 *  (Apple), this verifies the Clerk session token, resolves the verified email
 *  and hands back a one-time link the browser exchanges for a normal app
 *  session. The app's account system stays unchanged.
 *
 *  It also reads the user's connected apps (Clerk "external accounts") and
 *  their access tokens, so integrations never touch the browser.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";

type Result = { status: number; body: Record<string, unknown> };
const ok = (body: Record<string, unknown> = {}): Result => ({ status: 200, body: { ok: true, ...body } });
const fail = (status: number, error: string): Result => ({ status, body: { ok: false, error } });

const CLERK_API = "https://api.clerk.com/v1";

function db(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server misconfigured");
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Frontend API host encoded inside the publishable key (pk_test_<base64>$). */
function expectedIssuer(): string | null {
  const pk = process.env.CLERK_PUBLISHABLE_KEY || process.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!pk) return null;
  const encoded = pk.replace(/^pk_(test|live)_/, "");
  try {
    const host = Buffer.from(encoded, "base64").toString("utf8").replace(/\$$/, "");
    return host ? `https://${host}` : null;
  } catch {
    return null;
  }
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function jwks(issuer: string) {
  let set = jwksCache.get(issuer);
  if (!set) {
    set = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
    jwksCache.set(issuer, set);
  }
  return set;
}

/** Verify a Clerk session token and return its subject. */
async function verifyClerkToken(token: string): Promise<{ sub: string; email?: string }> {
  const claims = decodeJwt(token);
  const issuer = String(claims.iss ?? "");
  const allowed = expectedIssuer();
  const trusted =
    issuer.startsWith("https://") &&
    (allowed ? issuer === allowed : /\.clerk\.accounts\.dev$|\.clerk\.com$/.test(new URL(issuer).hostname));
  if (!trusted) throw new Error("Untrusted sign-in token");

  const { payload } = await jwtVerify(token, jwks(issuer), { issuer });
  if (!payload.sub) throw new Error("Invalid sign-in token");
  const email = typeof payload["email"] === "string" ? (payload["email"] as string) : undefined;
  return { sub: String(payload.sub), email };
}

async function clerkApi(path: string): Promise<any> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error("Sign-in service is not configured yet");
  const res = await fetch(`${CLERK_API}${path}`, {
    headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
  });
  const doc = await res.json().catch(() => null);
  if (!res.ok) throw new Error(doc?.errors?.[0]?.message || `Sign-in service error (${res.status})`);
  return doc;
}

async function primaryEmail(clerkUserId: string, fallback?: string): Promise<string> {
  if (fallback) return fallback.toLowerCase();
  const user = await clerkApi(`/users/${clerkUserId}`);
  const addresses: any[] = user?.email_addresses ?? [];
  const primary =
    addresses.find((a) => a.id === user?.primary_email_address_id) ??
    addresses.find((a) => a.verification?.status === "verified") ??
    addresses[0];
  const email = primary?.email_address;
  if (!email) throw new Error("This account has no email address");
  return String(email).toLowerCase();
}

/** Find or create the matching app account and mint a one-time sign-in link. */
async function issueAppSession(supabase: SupabaseClient, email: string) {
  const attempt = async () =>
    await supabase.auth.admin.generateLink({ type: "magiclink", email });

  let { data, error } = await attempt();
  if (error) {
    await supabase.auth.admin.createUser({ email, email_confirm: true });
    ({ data, error } = await attempt());
  }
  if (error || !data?.properties?.hashed_token) {
    throw new Error(error?.message || "Could not start your session");
  }
  return {
    email,
    token_hash: data.properties.hashed_token,
    user_id: (data as any).user?.id as string | undefined,
  };
}

export interface ClerkPayload {
  action: "bridge_session" | "list_integrations" | "integration_token";
  clerk_token?: string;
  token?: string;
  provider?: string;
}

export async function handleClerk(payload: ClerkPayload | null): Promise<Result> {
  if (!payload?.action) return fail(400, "Missing action");
  let supabase: SupabaseClient;
  try {
    supabase = db();
  } catch {
    return fail(500, "Server misconfigured");
  }

  if (!payload.clerk_token) return fail(400, "Missing sign-in token");
  let identity: { sub: string; email?: string };
  try {
    identity = await verifyClerkToken(payload.clerk_token);
  } catch (err) {
    return fail(401, err instanceof Error ? err.message : "Invalid sign-in token");
  }

  switch (payload.action) {
    case "bridge_session": {
      try {
        const email = await primaryEmail(identity.sub, identity.email);
        const session = await issueAppSession(supabase, email);
        if (session.user_id) {
          await supabase.from("clerk_links").upsert(
            { user_id: session.user_id, clerk_user_id: identity.sub, email },
            { onConflict: "clerk_user_id" },
          );
        }
        return ok({ email: session.email, token_hash: session.token_hash });
      } catch (err) {
        return fail(400, err instanceof Error ? err.message : "Sign-in failed");
      }
    }

    case "list_integrations": {
      try {
        const user = await clerkApi(`/users/${identity.sub}`);
        const accounts = (user?.external_accounts ?? []).map((a: any) => ({
          provider: String(a.provider ?? "").replace(/^oauth_/, ""),
          label: a.email_address ?? a.username ?? null,
          approved_scopes: typeof a.approved_scopes === "string" ? a.approved_scopes.split(" ") : [],
        }));
        return ok({ accounts });
      } catch (err) {
        return fail(400, err instanceof Error ? err.message : "Could not read your apps");
      }
    }

    case "integration_token": {
      const provider = String(payload.provider ?? "").replace(/^oauth_/, "");
      if (!provider) return fail(400, "Provider is required");
      try {
        const doc = await clerkApi(`/users/${identity.sub}/oauth_access_tokens/oauth_${provider}`);
        const first = Array.isArray(doc) ? doc[0] : doc?.data?.[0];
        // The token itself never leaves the server; we only confirm it is usable.
        return ok({ connected: Boolean(first?.token), scopes: first?.scopes ?? [] });
      } catch (err) {
        return fail(400, err instanceof Error ? err.message : "Could not read this app");
      }
    }

    default:
      return fail(400, "Unknown action");
  }
}
