/** @doc Typed client for the Anything.com API, proxied through the `/api/anything` server route. */
import { authenticatedFetch } from "@/lib/authenticatedFetch";

export interface AnythingRequest {
  path: string;
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, unknown>;
  body?: unknown;
}

export class AnythingApiError extends Error {
  status?: number;
  details?: unknown;
  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = "AnythingApiError";
    this.status = status;
    this.details = details;
  }
}

export async function anythingRequest<T = unknown>(req: AnythingRequest): Promise<T> {
  const response = await authenticatedFetch("/api/anything", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: string; status?: number; details?: unknown; data?: T }
    | null;

  if (!payload) throw new AnythingApiError("Invalid response from proxy", response.status);

  if (payload.error) {
    const detail =
      typeof payload.details === "object" && payload.details !== null && "error" in (payload.details as Record<string, unknown>)
        ? String((payload.details as Record<string, unknown>).error)
        : undefined;
    throw new AnythingApiError(detail || payload.error, payload.status, payload.details);
  }
  return payload.data as T;
}

/* ---------------------------------- types --------------------------------- */

export interface AnythingMe {
  /** The API returns the key owner flat, not nested under `user`. */
  id?: string;
  email?: string | null;
  name?: string | null;
  organizations?: Array<{
    id: string;
    name: string;
    role?: string;
    plan?: string;
    planDisplayName?: string;
    isPaid?: boolean;
    creditsBalance?: number;
  }>;
  [key: string]: unknown;
}

export interface AnythingProject {
  id: string;
  name: string;
  slug: string | null;
  organizationId: string;
  organizationName?: string;
  createdAt?: string;
  updatedAt?: string;
  published?: boolean;
  [key: string]: unknown;
}

export interface AnythingStatus {
  projectGroupId: string;
  latestRevisionId: string | null;
  status: string | null;
  buildErrors: string | null;
  deployment: {
    id?: string;
    status?: string;
    url?: string | null;
    createdAt?: string;
    [key: string]: unknown;
  } | null;
}

export interface AnythingMessage {
  id: string;
  role?: string;
  content?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface AnythingDeployment {
  id: string;
  status?: string;
  url?: string | null;
  createdAt?: string;
  [key: string]: unknown;
}

export interface AnythingSecret {
  id: string;
  name: string;
  createdAt?: string;
}

export interface AnythingDomain {
  id: string;
  domain?: string;
  name?: string;
  status?: string;
  verified?: boolean;
  [key: string]: unknown;
}

export interface AnythingDatabase {
  id: string;
  name?: string;
  status?: string;
  [key: string]: unknown;
}

/* ---------------------------------- API ----------------------------------- */

export const anything = {
  /** Current API-key owner + organizations. */
  me: () => anythingRequest<AnythingMe>({ path: "/v0/api/me" }),

  projects: {
    list: (query?: { organizationId?: string; query?: string; limit?: number }) =>
      anythingRequest<{ projects: AnythingProject[] }>({ path: "/v0/api/projects", query }),
    get: (id: string) => anythingRequest<AnythingProject>({ path: `/v0/api/projects/${id}` }),
    create: (body: { prompt: string; organizationId: string; name?: string }) =>
      anythingRequest<{ projectGroupId?: string; id?: string; [k: string]: unknown }>({
        path: "/v0/api/projects",
        method: "POST",
        body,
      }),
    duplicate: (id: string, body?: { name?: string }) =>
      anythingRequest({ path: `/v0/api/projects/${id}/duplicate`, method: "POST", body: body ?? {} }),
    rename: (id: string, name: string) =>
      anythingRequest({ path: `/v0/api/projects/${id}/rename`, method: "POST", body: { name } }),
    remove: (id: string) => anythingRequest({ path: `/v0/api/projects/${id}`, method: "DELETE" }),
    generate: (id: string, body: { prompt: string; threadId?: string | null; createNewThread?: boolean }) =>
      anythingRequest<{ revisionId: string; threadId: string | null }>({
        path: `/v0/api/projects/${id}/generate`,
        method: "POST",
        body,
      }),
    status: (id: string) => anythingRequest<AnythingStatus>({ path: `/v0/api/projects/${id}/status` }),
    messages: (id: string, query?: { limit?: number; threadId?: string }) =>
      anythingRequest<{ messages: AnythingMessage[] }>({ path: `/v0/api/projects/${id}/messages`, query }),
    files: (id: string) => anythingRequest<{ files: unknown[] }>({ path: `/v0/api/projects/${id}/files` }),
    logs: (id: string) => anythingRequest({ path: `/v0/api/projects/${id}/logs` }),
    restore: (id: string, body: { revisionId: string }) =>
      anythingRequest({ path: `/v0/api/projects/${id}/restore`, method: "POST", body }),
    publish: (id: string, body?: { slug?: string }) =>
      anythingRequest<{ success: boolean; projectGroupId: string; slug: string | null; deploymentId: string }>({
        path: `/v0/api/projects/${id}/publish`,
        method: "POST",
        body: body ?? {},
      }),
    unpublish: (id: string) =>
      anythingRequest({ path: `/v0/api/projects/${id}/unpublish`, method: "POST", body: {} }),
    submit: (id: string, body: Record<string, unknown>) =>
      anythingRequest({ path: `/v0/api/projects/${id}/submit`, method: "POST", body }),
    submission: (id: string, submissionId: string) =>
      anythingRequest({ path: `/v0/api/projects/${id}/submit/${submissionId}` }),
    playStoreSetup: (id: string) => anythingRequest({ path: `/v0/api/projects/${id}/play-store-setup` }),
    authProviders: (id: string) => anythingRequest({ path: `/v0/api/projects/${id}/auth/providers` }),
    getAuthSettings: (id: string) => anythingRequest({ path: `/v0/api/projects/${id}/settings/auth` }),
    setAuthSettings: (id: string, body: Record<string, unknown>) =>
      anythingRequest({ path: `/v0/api/projects/${id}/settings/auth`, method: "POST", body }),
    secrets: {
      list: (id: string) => anythingRequest<{ secrets: AnythingSecret[] }>({ path: `/v0/api/projects/${id}/secrets` }),
      create: (id: string, body: { name: string; value: string }) =>
        anythingRequest({ path: `/v0/api/projects/${id}/secrets`, method: "POST", body }),
      remove: (id: string, secretId: string) =>
        anythingRequest({ path: `/v0/api/projects/${id}/secrets/${secretId}`, method: "DELETE" }),
    },
    assets: {
      list: (id: string) => anythingRequest<{ assets: unknown[] }>({ path: `/v0/api/projects/${id}/assets` }),
      create: (id: string, body: Record<string, unknown>) =>
        anythingRequest({ path: `/v0/api/projects/${id}/assets`, method: "POST", body }),
      remove: (id: string, assetId: string) =>
        anythingRequest({ path: `/v0/api/projects/${id}/assets/${assetId}`, method: "DELETE" }),
    },
    deployments: (id: string) =>
      anythingRequest<{ deployments: AnythingDeployment[] }>({ path: `/v0/api/projects/${id}/deployments` }),
    rollback: (id: string, body?: Record<string, unknown>) =>
      anythingRequest({ path: `/v0/api/projects/${id}/deployments/rollback`, method: "POST", body: body ?? {} }),
  },

  deployments: {
    get: (deploymentId: string) => anythingRequest<AnythingDeployment>({ path: `/v0/api/deployments/${deploymentId}` }),
    logs: (deploymentId: string) => anythingRequest({ path: `/v0/api/deployments/${deploymentId}/logs` }),
  },

  databases: {
    list: (organizationId: string) =>
      anythingRequest<{ databases: AnythingDatabase[] }>({
        path: "/v0/api/databases",
        query: { organizationId },
      }),
    create: (body: Record<string, unknown>) =>
      anythingRequest({ path: "/v0/api/databases", method: "POST", body }),
    get: (databaseId: string) => anythingRequest<AnythingDatabase>({ path: `/v0/api/databases/${databaseId}` }),
    remove: (databaseId: string) => anythingRequest({ path: `/v0/api/databases/${databaseId}`, method: "DELETE" }),
    query: (databaseId: string, body: { query: string; params?: unknown[] }) =>
      anythingRequest({ path: `/v0/api/databases/${databaseId}/query`, method: "POST", body }),
    connection: (databaseId: string) => anythingRequest({ path: `/v0/api/databases/${databaseId}/connection` }),
    reset: (databaseId: string) =>
      anythingRequest({ path: `/v0/api/databases/${databaseId}/reset`, method: "POST", body: {} }),
  },

  domains: {
    list: (organizationId: string) =>
      anythingRequest<{ domains: AnythingDomain[] }>({ path: "/v0/api/domains", query: { organizationId } }),
    create: (body: Record<string, unknown>) => anythingRequest({ path: "/v0/api/domains", method: "POST", body }),
    remove: (domainId: string) => anythingRequest({ path: `/v0/api/domains/${domainId}`, method: "DELETE" }),
    verify: (domainId: string) =>
      anythingRequest({ path: `/v0/api/domains/${domainId}/verify`, method: "POST", body: {} }),
  },

  organizations: {
    members: (organizationId: string) =>
      anythingRequest<{ members: unknown[] }>({ path: `/v0/api/organizations/${organizationId}/members` }),
    invite: (organizationId: string, body: Record<string, unknown>) =>
      anythingRequest({ path: `/v0/api/organizations/${organizationId}/invites`, method: "POST", body }),
    removeMember: (organizationId: string, body: Record<string, unknown>) =>
      anythingRequest({ path: `/v0/api/organizations/${organizationId}/members/remove`, method: "POST", body }),
    setRole: (organizationId: string, body: Record<string, unknown>) =>
      anythingRequest({ path: `/v0/api/organizations/${organizationId}/members/role`, method: "POST", body }),
  },
};
