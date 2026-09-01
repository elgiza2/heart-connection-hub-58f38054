/** @doc Helpers to export a Coder project — ZIP download + real GitHub push via the connected integration. */
import JSZip from "jszip";
import { toast } from "sonner";
import type { ProjectFile } from "@/lib/extractProjectFiles";
import { supabase } from "@/integrations/supabase/client";

/** Normalise a model-produced path so it can never escape the archive root. */
export function safeProjectPath(raw: string): string {
  const parts = String(raw || "")
    .replace(/\\/g, "/")
    .replace(/^[a-zA-Z]:/, "")
    .split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === "." || part === "..") continue;
    out.push(part.replace(/[\u0000-\u001f]/g, ""));
  }
  return out.join("/") || "file.txt";
}

export async function downloadProjectZip(files: ProjectFile[], name = "megsy-project") {
  if (!files.length) {
    toast.error("No files to download");
    return;
  }
  const zip = new JSZip();
  for (const f of files) zip.file(safeProjectPath(f.path), f.content);
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast.success("ZIP downloaded");
}

/** Returns { connected, account_name?, account? } */
export async function getGithubStatus(): Promise<{ connected: boolean; account_name?: string; account?: any } | null> {
  try {
    const { data, error } = await supabase.functions.invoke("github-push", { body: { action: "status" } });
    if (error) return null;
    return data ?? null;
  } catch {
    return null;
  }
}

/** Checks whether the current user has linked Supabase via the /integrations flow (pipedream: supabase_management_api). */
export async function getSupabaseStatus(): Promise<{ connected: boolean; account?: any } | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { connected: false };
    const { data, error } = await supabase.functions.invoke("pipedream-connect", { body: { action: "list_accounts" } });
    if (error) return null;
    const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
    const match = accounts.find((a: any) => {
      const slug = a?.app_slug ?? a?.app?.name_slug ?? a?.app?.slug ?? a?.appSlug;
      return String(slug || "") === "supabase_management_api";
    });
    return { connected: !!match, account: match };
  } catch {
    return { connected: false };
  }
}

/** Combined helper for Coder — one call to know GitHub + Supabase connection state. */
export async function getCoderIntegrationStatus(): Promise<{ github: boolean; supabase: boolean }> {
  const [gh, sb] = await Promise.all([getGithubStatus(), getSupabaseStatus()]);
  return { github: !!gh?.connected, supabase: !!sb?.connected };
}


/**
 * Push files to a GitHub repo owned by the connected user, using the
 * existing `github-push` edge function. Tries a couple of action names
 * so it stays compatible with the deployed function.
 */
export async function pushFilesToGithub(
  files: ProjectFile[],
  opts: { repo: string; branch?: string; message?: string; private?: boolean },
): Promise<{ repo_url?: string; commit_url?: string }> {
  if (!files.length) throw new Error("No files to push");
  const payload = {
    repo: opts.repo,
    repo_name: opts.repo,
    name: opts.repo,
    branch: opts.branch || "main",
    message: opts.message || "Initial commit from Megsy Coder",
    private: opts.private ?? true,
    files: files.map((f) => ({ path: safeProjectPath(f.path), content: f.content })),
  };
  // Try in order: push, create_and_push, upload, commit
  const actions = ["push", "create_and_push", "upload_files", "commit", "create_repo"];
  let lastErr: any = null;
  for (const action of actions) {
    try {
      const { data, error } = await supabase.functions.invoke("github-push", {
        body: { action, ...payload },
      });
      const failure = error || (data?.error ? new Error(data.error) : null);
      if (failure) {
        lastErr = failure;
        // An auth failure will fail identically for every action name — stop
        // burning round trips and tell the user what to actually do.
        if (/401|403|unauthor|forbidden|token|expired|reconnect/i.test(String(failure.message || ""))) {
          throw new Error("Your GitHub connection expired — reconnect GitHub in Integrations and try again.");
        }
        continue;
      }
      // Only treat it as pushed when the backend confirms the files landed.
      // "create_repo" returning ok with no commit means an empty repo, which
      // used to be reported to the user as a successful push.
      const pushed =
        data?.commit_url || data?.commit_sha || data?.sha ||
        (typeof data?.files_written === "number" && data.files_written > 0);
      if (pushed) {
        return {
          repo_url: data?.repo_url || data?.html_url,
          commit_url: data?.commit_url,
        };
      }
      if (data?.ok && (data?.repo_url || data?.html_url) && action !== "create_repo") {
        return { repo_url: data.repo_url || data.html_url, commit_url: data?.commit_url };
      }
      lastErr = new Error("GitHub accepted the request but reported no committed files.");
    } catch (e) {
      if (e instanceof Error && /reconnect GitHub/.test(e.message)) throw e;
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("GitHub push failed");
}

/**
 * Start the GitHub OAuth popup right here and wait for it to finish, so the
 * user never has to leave Coder to connect. Returns the fresh status.
 */
async function ensureGithubConnected(): Promise<{ connected: boolean; account_name?: string } | null> {
  const status = await getGithubStatus();
  if (status?.connected) return status;

  const [{ startIntegrationConnection, waitForConnectionRefresh }, { integrations }] = await Promise.all([
    import("@/lib/integrationBackend"),
    import("@/lib/integrationsData"),
  ]);
  const gh = integrations.find((i) => i.app === "github");
  if (!gh) return status ?? { connected: false };

  const t = toast.loading("Opening GitHub authorization…");
  try {
    const res = await startIntegrationConnection(gh);
    toast.dismiss(t);
    if (res.mode === "oauth" && !res.popup) {
      // A blocked popup used to leave the user staring at a spinner until the
      // refresh poller timed out with a meaningless error.
      throw new Error("Your browser blocked the GitHub window — allow pop-ups for this site and try again.");
    }
    if (res.mode === "oauth") {
      toast.info("Approve access in the GitHub window, then we'll continue automatically.");
      await waitForConnectionRefresh(async () => {
        const s = await getGithubStatus();
        return !!s?.connected;
      }, res.popup);
    }
    return await getGithubStatus();
  } catch (e) {
    toast.dismiss(t);
    toast.error(e instanceof Error ? e.message : "Could not start GitHub connection", {
      description: "You can also connect from Integrations → GitHub.",
      action: { label: "Open", onClick: () => { window.location.href = "/integrations/github"; } },
      duration: 8000,
    });
    return null;
  }
}

/**
 * Full user flow: connect if needed (inline OAuth), prompt for repo name,
 * push, toast + open. Falls back to ZIP download when the push fails.
 */
export async function pushProjectToGithub(files: ProjectFile[], defaultName = "megsy-project") {
  if (!files.length) {
    toast.error("No files to push");
    return;
  }
  const status = await ensureGithubConnected();
  if (!status?.connected) {
    toast.error("GitHub is not connected yet", {
      description: "Finish the GitHub authorization and try again.",
      action: { label: "Download ZIP", onClick: () => downloadProjectZip(files, defaultName) },
      duration: 8000,
    });
    return;
  }

  const repo = window.prompt("Repository name (will be created under your account)", defaultName)?.trim();
  if (!repo) return;

  const t = toast.loading(`Pushing to GitHub → ${repo}…`);
  try {
    const result = await pushFilesToGithub(files, { repo, branch: "main", message: "Initial commit from Megsy Coder", private: true });
    toast.dismiss(t);
    const url = result.repo_url || (status.account_name ? `https://github.com/${status.account_name}/${repo}` : undefined);
    if (url) {
      try { await navigator.clipboard.writeText(url); } catch {}
      toast.success("Pushed to GitHub — link copied", { description: url });
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      toast.success("Pushed to GitHub");
    }
  } catch (e) {
    toast.dismiss(t);
    const msg = e instanceof Error ? e.message : "GitHub push failed";
    toast.error(msg, {
      description: "You can download the ZIP and upload it manually.",
      action: { label: "Download ZIP", onClick: () => downloadProjectZip(files, defaultName) },
      duration: 10000,
    });
  }
}

/** Legacy fallback: ZIP + open github.com/new. Kept for callers that want it explicitly. */
export async function openGithubNewRepo(files: ProjectFile[]) {
  return pushProjectToGithub(files);
}
