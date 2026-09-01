/** @doc Bridge between Megsy Coder projects and the Anything.com build API.
 *  Takes the files Coder generated and hands them to Anything as a build spec,
 *  then polls until a live deployment URL exists and (optionally) publishes it. */

import { anything, AnythingApiError, type AnythingStatus } from "./client";

/** Anything.com returns the key owner flat (id/email/name) plus organizations. */
export interface AnythingOwner {
  id?: string;
  email?: string | null;
  name?: string | null;
  organizations?: Array<{ id: string; name: string; creditsBalance?: number; planDisplayName?: string }>;
}

export interface BridgeFile {
  path: string;
  content: string;
}

/** Total characters of source we are willing to inline into the build prompt. */
const PROMPT_BUDGET = 60_000;
/** Files that never help the target stack and only burn prompt budget. */
const SKIP = /(^|\/)(node_modules|dist|build|\.git)\//;

export function buildSpecPrompt(files: BridgeFile[], summary?: string): string {
  const usable = files.filter((f) => f.content && !SKIP.test(f.path));
  const head = [
    "Rebuild the following existing website as a production-ready app.",
    "Keep the exact same design, copy, layout and behaviour — do not redesign it.",
    summary?.trim() ? `Context from the original build:\n${summary.trim().slice(0, 1200)}` : "",
    "",
    "Source files:",
  ]
    .filter(Boolean)
    .join("\n");

  let budget = PROMPT_BUDGET - head.length;
  const parts: string[] = [];
  const omitted: string[] = [];
  for (const f of usable) {
    const block = `\n--- ${f.path} ---\n${f.content}\n`;
    if (block.length > budget) {
      omitted.push(f.path);
      continue;
    }
    budget -= block.length;
    parts.push(block);
  }
  const tail = omitted.length
    ? `\n\nOmitted for length (recreate them faithfully from context): ${omitted.join(", ")}`
    : "";
  return head + parts.join("") + tail;
}

async function resolveOrgId(): Promise<string> {
  const me = (await anything.me()) as unknown as AnythingOwner;
  const org = me?.organizations?.[0]?.id;
  if (!org) throw new AnythingApiError("No Anything.com organization is linked to this API key");
  return org;
}

export interface DeployOptions {
  title?: string;
  summary?: string;
  /** Reuse an existing Anything project instead of creating a new one. */
  projectId?: string;
  /** Publish once the build produces a deployment. */
  publish?: boolean;
  signal?: AbortSignal;
  onProgress?: (stage: string) => void;
}

export interface DeployResult {
  projectId: string;
  url: string | null;
  published: boolean;
  buildErrors: string | null;
}

/** Statuses that mean the generation step has finished (no deployment yet). */
const BUILD_DONE = new Set(["VALID", "READY", "COMPLETE", "COMPLETED", "ERROR", "FAILED", "INVALID"]);

/** Wait for Anything to finish generating the revision, returning the last status seen.
 *  Note: Anything only creates a deployment (and therefore a URL) after `publish`,
 *  so this resolves as soon as the revision itself is done. */
export async function waitForBuild(
  projectId: string,
  opts: { signal?: AbortSignal; onProgress?: (stage: string) => void; timeoutMs?: number } = {},
): Promise<AnythingStatus | null> {
  const deadline = Date.now() + (opts.timeoutMs ?? 10 * 60_000);
  let last: AnythingStatus | null = null;
  while (Date.now() < deadline) {
    if (opts.signal?.aborted) throw new AnythingApiError("Cancelled");
    try {
      last = await anything.projects.status(projectId);
    } catch {
      /* transient — keep polling */
    }
    if (last?.buildErrors) return last;
    if (last?.deployment?.url) return last;
    if (last?.status && BUILD_DONE.has(String(last.status).toUpperCase())) return last;
    opts.onProgress?.(last?.status ? String(last.status) : "building");
    await new Promise((r) => setTimeout(r, 5000));
  }
  return last;
}

/** Wait for a published deployment to expose its live URL. */
export async function waitForDeployment(
  projectId: string,
  opts: { signal?: AbortSignal; onProgress?: (stage: string) => void; timeoutMs?: number } = {},
): Promise<string | null> {
  const deadline = Date.now() + (opts.timeoutMs ?? 6 * 60_000);
  while (Date.now() < deadline) {
    if (opts.signal?.aborted) throw new AnythingApiError("Cancelled");
    let status: AnythingStatus | null = null;
    try {
      status = await anything.projects.status(projectId);
    } catch {
      /* transient — keep polling */
    }
    const dep = status?.deployment;
    if (dep?.url) return String(dep.url);
    const depStatus = String(dep?.status ?? "").toUpperCase();
    if (depStatus === "FAILED" || depStatus === "ERROR") return null;
    opts.onProgress?.("deploying");
    await new Promise((r) => setTimeout(r, 5000));
  }
  return null;
}

/** Send a Coder project to Anything.com and wait for a live URL. */
export async function deployCoderProjectToAnything(
  files: BridgeFile[],
  opts: DeployOptions = {},
): Promise<DeployResult> {
  if (files.length === 0) throw new AnythingApiError("This project has no files to deploy");

  const prompt = buildSpecPrompt(files, opts.summary);
  let projectId = opts.projectId ?? "";

  if (projectId) {
    opts.onProgress?.("updating");
    await anything.projects.generate(projectId, { prompt });
  } else {
    opts.onProgress?.("creating");
    const organizationId = await resolveOrgId();
    const res = await anything.projects.create({
      prompt,
      organizationId,
      name: (opts.title || "Megsy project").slice(0, 60),
    });
    projectId = String(res?.projectGroupId ?? res?.id ?? "");
    if (!projectId) throw new AnythingApiError("Anything.com did not return a project id");
  }

  const status = await waitForBuild(projectId, { signal: opts.signal, onProgress: opts.onProgress });
  const buildErrors = status?.buildErrors ?? null;
  let url = status?.deployment?.url ? String(status.deployment.url) : null;
  let published = false;

  // Anything only produces a live URL once the revision is published.
  if (!buildErrors && opts.publish !== false) {
    opts.onProgress?.("publishing");
    try {
      const res = await anything.projects.publish(projectId);
      published = Boolean(res?.success);
      if (res?.slug) url = `https://${res.slug}.anything.app`;
    } catch {
      /* fall through — we may still pick up a deployment URL below */
    }
    if (!url) {
      url = await waitForDeployment(projectId, { signal: opts.signal, onProgress: opts.onProgress });
    }
  }

  return { projectId, url, published, buildErrors };
}

