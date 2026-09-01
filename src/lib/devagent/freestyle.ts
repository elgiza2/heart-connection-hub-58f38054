/**
 * @doc Server-only Freestyle client used by the Dev Agent.
 *
 * Talks to the Freestyle v5 API (https://beta-api.freestyle.sh). VMs expose
 * no implicit domains in v5 — public preview/deploy URLs come from TLS
 * ingress rules on free `*.style.dev` subdomains routed to a VM port.
 * Project files are persisted to a private GitHub repo (see githubStorage.ts);
 * Freestyle itself is only the compute + preview layer.
 *
 * Every call rotates through the `freestyle_keys` pool with automatic
 * failover. Never import this from client code.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  availableFreestyleKeys,
  devAdminClient,
  markFreestyleFailure,
  markFreestyleSuccess,
  type FreestyleKeyRow,
} from "./keys";

const API_BASE = process.env.FREESTYLE_API_BASE || "https://beta-api.freestyle.sh";

/** exec-await hard-caps timeouts at 300s — stay under it. */
const MAX_EXEC_TIMEOUT_MS = 290_000;

export class FreestyleError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "FreestyleError";
    this.status = status;
  }
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface VmInfo {
  id: string;
}

/** Statuses that are worth trying the next key for. */
function shouldRotate(status: number): boolean {
  return status === 401 || status === 402 || status === 403 || status === 429 || status >= 500;
}

function randomLabel(length = 6): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export class FreestyleClient {
  private supabase: SupabaseClient;
  private keys: FreestyleKeyRow[] | null = null;

  constructor(supabase?: SupabaseClient) {
    this.supabase = supabase ?? devAdminClient();
  }

  private async keyPool(): Promise<FreestyleKeyRow[]> {
    if (!this.keys) this.keys = await availableFreestyleKeys(this.supabase);
    if (this.keys.length === 0) {
      throw new FreestyleError(500, "No active Freestyle key configured");
    }
    return this.keys;
  }

  /** One HTTP call against the Freestyle API, rotating keys on failure. */
  async request<T = unknown>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
    timeoutMs = 300_000,
  ): Promise<T> {
    const keys = await this.keyPool();
    let lastStatus = 500;
    let lastMessage = "Freestyle request failed";

    for (const key of keys) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const resp = await fetch(`${API_BASE}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${key.api_key}`,
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
        const text = await resp.text();
        const data = text ? safeJson(text) : {};

        if (resp.ok) {
          void markFreestyleSuccess(this.supabase, key);
          return data as T;
        }

        lastStatus = resp.status;
        lastMessage =
          (data as { message?: string; error?: string }).message ||
          (data as { error?: string }).error ||
          text.slice(0, 300) ||
          `HTTP ${resp.status}`;

        if (!shouldRotate(resp.status)) {
          throw new FreestyleError(lastStatus, lastMessage);
        }
        const retryAfter = Number(resp.headers.get("retry-after")) || undefined;
        await markFreestyleFailure(this.supabase, key, resp.status, lastMessage, retryAfter);
      } catch (err) {
        if (err instanceof FreestyleError) throw err;
        lastStatus = 599;
        lastMessage = err instanceof Error ? err.message : String(err);
        await markFreestyleFailure(this.supabase, key, lastStatus, lastMessage);
      } finally {
        clearTimeout(timer);
      }
    }

    throw new FreestyleError(lastStatus, lastMessage);
  }

  /** Raw (non-JSON) GET — used by fs/read which streams bytes. */
  private async requestText(path: string, timeoutMs = 120_000): Promise<string> {
    const keys = await this.keyPool();
    let lastStatus = 500;
    let lastMessage = "Freestyle request failed";

    for (const key of keys) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const resp = await fetch(`${API_BASE}${path}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${key.api_key}` },
          signal: controller.signal,
        });
        const text = await resp.text();
        if (resp.ok) {
          void markFreestyleSuccess(this.supabase, key);
          return text;
        }
        lastStatus = resp.status;
        lastMessage = text.slice(0, 300) || `HTTP ${resp.status}`;
        if (!shouldRotate(resp.status)) throw new FreestyleError(lastStatus, lastMessage);
        await markFreestyleFailure(this.supabase, key, resp.status, lastMessage);
      } catch (err) {
        if (err instanceof FreestyleError) throw err;
        lastStatus = 599;
        lastMessage = err instanceof Error ? err.message : String(err);
        await markFreestyleFailure(this.supabase, key, lastStatus, lastMessage);
      } finally {
        clearTimeout(timer);
      }
    }

    throw new FreestyleError(lastStatus, lastMessage);
  }

  // ---------------------------------------------------------------- VMs

  /**
   * Boots a VM. v5 requires an explicit firewall spec; the rule below allows
   * outbound traffic to the public internet (package installs, API calls).
   * Inbound preview traffic is opened separately via `exposePort`.
   */
  async createVm(options: {
    idleTimeoutSeconds?: number | null;
    snapshotId?: string;
    displayName?: string;
  } = {}): Promise<VmInfo> {
    const body: Record<string, unknown> = {
      firewall: { rules: [{ action: "allow", source: {}, destination: { public: true } }] },
      idleTimeoutSeconds: options.idleTimeoutSeconds ?? 1800,
      displayName: options.displayName ?? "megsy-dev-agent",
    };
    if (options.snapshotId) body.snapshotId = options.snapshotId;

    try {
      const data = await this.request<{ id: string }>("POST", "/v5/vms", body);
      return { id: data.id };
    } catch (e) {
      // The plan caps concurrent VMs; reclaim abandoned ones and retry once.
      const msg = e instanceof Error ? e.message : String(e);
      if (!/limit of \d+ VMs/i.test(msg)) throw e;
      await this.reapIdleVms();
      const data = await this.request<{ id: string }>("POST", "/v5/vms", body);
      return { id: data.id };
    }
  }

  /** Deletes every VM that is not currently running (paused/stopped leftovers). */
  async reapIdleVms(): Promise<number> {
    let removed = 0;
    try {
      const list = await this.request<{ vms?: { id: string; state?: string }[] }>("GET", "/v5/vms");
      for (const vm of list.vms ?? []) {
        if (vm.state === "running") continue;
        try {
          await this.deleteVm(vm.id);
          removed++;
        } catch {
          /* another worker may have removed it already */
        }
      }
    } catch {
      /* listing failures must not mask the original create error */
    }
    return removed;
  }

  async getVm(vmId: string): Promise<Record<string, unknown>> {
    return this.request("GET", `/v5/vms/${encodeURIComponent(vmId)}`);
  }

  /** Waits until the VM reports `running` (or throws after ~90s). */
  async waitForRunning(vmId: string, timeoutMs = 90_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastState = "unknown";
    while (Date.now() < deadline) {
      const info = await this.getVm(vmId);
      lastState = String(info.state ?? "unknown");
      if (lastState === "running") return;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new FreestyleError(500, `VM did not reach running state (last: ${lastState})`);
  }

  async startVm(vmId: string): Promise<void> {
    await this.request("POST", `/v5/vms/${encodeURIComponent(vmId)}/start`, {});
    await this.waitForRunning(vmId);
  }

  /** v5 has no "stop" — pausing preserves the disk for a later resume. */
  async stopVm(vmId: string): Promise<void> {
    await this.request("POST", `/v5/vms/${encodeURIComponent(vmId)}/pause`, {});
  }

  async deleteVm(vmId: string): Promise<void> {
    await this.request("DELETE", `/v5/vms/${encodeURIComponent(vmId)}`);
  }

  /** Runs a shell command inside the VM and waits for it to finish. */
  async exec(vmId: string, command: string, timeoutMs = 240_000): Promise<ExecResult> {
    const clamped = Math.min(timeoutMs, MAX_EXEC_TIMEOUT_MS);
    const data = await this.request<{
      stdout?: string | null;
      stderr?: string | null;
      statusCode?: number | null;
    }>(
      "POST",
      `/v5/vms/${encodeURIComponent(vmId)}/exec-await`,
      { command, timeoutMs: clamped },
      clamped + 20_000,
    );
    return {
      stdout: data.stdout ?? "",
      stderr: data.stderr ?? "",
      // A timeout kill has no statusCode — treat it as a failure.
      exitCode: data.statusCode ?? 124,
    };
  }

  async writeFile(vmId: string, filepath: string, content: string): Promise<void> {
    await this.request("PUT", `/v5/vms/${encodeURIComponent(vmId)}/fs/write`, {
      path: filepath,
      content,
      encoding: "utf8",
    });
  }

  async readFile(vmId: string, filepath: string): Promise<string> {
    return this.requestText(
      `/v5/vms/${encodeURIComponent(vmId)}/fs/read?path=${encodeURIComponent(filepath)}`,
    );
  }

  async listDir(vmId: string, dirpath: string): Promise<{ name: string; kind: string }[]> {
    const data = await this.request<{ entries?: { name: string; kind: string }[] }>(
      "GET",
      `/v5/vms/${encodeURIComponent(vmId)}/fs/dir?path=${encodeURIComponent(dirpath)}`,
    );
    return data.entries ?? [];
  }

  // ------------------------------------------------------------ Preview

  /**
   * Routes a public `*.style.dev` subdomain to a port inside the VM — this is
   * how preview and deploy URLs are made in v5. If the (deterministic) name
   * is already routed from an earlier call, the conflict is fine: the URL is
   * the same.
   */
  async exposePort(vmId: string, port: number, subdomain?: string): Promise<string> {
    const domain = `${subdomain ?? `megsy-${randomLabel()}`}.style.dev`;
    try {
      await this.request("POST", "/v5/tls", {
        action: "allow",
        domain,
        protocol: "http",
        source: { public: true },
        destination: { vmId, port },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Re-using our own previously-claimed name is not a failure.
      if (!/taken|conflict|already|409|in use/i.test(msg)) throw err;
    }
    return domain;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}
