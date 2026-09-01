/** @doc Server-only private GitHub persistence for Dev Agent projects. */
import type { DevWorkspace } from "./tools";

const GATEWAY = "https://connector-gateway.lovable.dev/github";
const DIRECT = "https://api.github.com";

type GithubRepo = { full_name: string; default_branch?: string };
type GithubRef = { object?: { sha?: string } };
type GithubCommit = { tree?: { sha?: string } };
type GithubTree = { sha?: string; tree?: Array<{ path?: string; type?: string; sha?: string }> };
type GithubBlob = { content?: string; encoding?: string };

/**
 * Prefers a direct GitHub PAT (GITHUB_TOKEN) so storage runs entirely on our own
 * credentials. Falls back to the connector gateway only if no PAT is configured.
 */
function transport(): { base: string; headers: Record<string, string> } {
  const pat = process.env.GITHUB_TOKEN;
  if (pat) {
    return { base: DIRECT, headers: { Authorization: `Bearer ${pat}` } };
  }
  const lovableKey = process.env.LOVABLE_API_KEY;
  const githubKey = process.env.GITHUB_API_KEY;
  if (!lovableKey || !githubKey) throw new Error("Central GitHub storage is not configured");
  return {
    base: GATEWAY,
    headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": githubKey },
  };
}

async function github<T>(path: string, init: RequestInit = {}, allowNotFound = false): Promise<T | null> {
  const { base, headers } = transport();
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...headers,
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (allowNotFound && response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub storage failed [${response.status}]: ${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : {}) as T;
}


function repoSlug(projectId: string): string {
  return `megsy-project-${projectId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 12)}`.toLowerCase();
}

export async function ensurePrivateGithubRepo(projectId: string, existing?: string | null): Promise<string> {
  if (existing) return existing;
  const account = await github<{ login?: string }>("/user");
  if (!account?.login) throw new Error("GitHub did not return the central account name");
  const name = repoSlug(projectId);
  const found = await github<GithubRepo>(`/repos/${account.login}/${name}`, {}, true);
  const repo = found ?? await github<GithubRepo>("/user/repos", {
      method: "POST",
      body: JSON.stringify({
        name,
        description: "Private Megsy coding-agent project storage",
        private: true,
      auto_init: true,
      }),
    });
  if (!repo?.full_name) throw new Error("GitHub did not return the private repository name");
  return repo.full_name;
}

async function branchHead(repo: string): Promise<string | null> {
  const ref = await github<GithubRef>(`/repos/${repo}/git/ref/heads/main`, {}, true);
  return ref?.object?.sha ?? null;
}

export async function saveWorkspaceToGithub(
  ws: DevWorkspace,
  repo: string,
  message: string,
): Promise<string> {
  const files = await ws.projectFiles();
  if (!files.length) throw new Error("The project has no files to save");

  const entries: Array<{ path: string; mode: "100644"; type: "blob"; sha: string | null }> = [];
  for (const file of files) {
    const blob = await github<{ sha?: string }>(`/repos/${repo}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
    });
    if (!blob?.sha) throw new Error(`GitHub did not save ${file.path}`);
    entries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  const parent = await branchHead(repo);
  let baseTree: string | undefined;
  if (parent) {
    const commit = await github<GithubCommit>(`/repos/${repo}/git/commits/${parent}`);
    baseTree = commit?.tree?.sha;
    if (baseTree) {
      const previous = await github<GithubTree>(`/repos/${repo}/git/trees/${baseTree}?recursive=1`);
      const currentPaths = new Set(files.map((file) => file.path));
      for (const old of previous?.tree ?? []) {
        if (old.type === "blob" && old.path && !currentPaths.has(old.path)) {
          entries.push({ path: old.path, mode: "100644", type: "blob", sha: null });
        }
      }
    }
  }
  const tree = await github<{ sha?: string }>(`/repos/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ ...(baseTree ? { base_tree: baseTree } : {}), tree: entries }),
  });
  if (!tree?.sha) throw new Error("GitHub did not create the project tree");

  const commit = await github<{ sha?: string }>(`/repos/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: message.slice(0, 120) || "Update from Megsy",
      tree: tree.sha,
      parents: parent ? [parent] : [],
    }),
  });
  if (!commit?.sha) throw new Error("GitHub did not create the project commit");

  if (parent) {
    await github(`/repos/${repo}/git/refs/heads/main`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
  } else {
    await github(`/repos/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: "refs/heads/main", sha: commit.sha }),
    });
  }
  return commit.sha;
}

/** Persists one changed workspace file without re-uploading the entire project. */
export async function saveFileToGithub(
  ws: DevWorkspace,
  repo: string,
  path: string,
  message: string,
): Promise<string> {
  const cleanPath = path.replace(/^\/+/, "");
  if (!cleanPath || cleanPath.split("/").includes("..")) throw new Error("Invalid GitHub file path");
  const content = await ws.readFile(cleanPath);
  const blob = await github<{ sha?: string }>(`/repos/${repo}/git/blobs`, {
    method: "POST",
    body: JSON.stringify({ content, encoding: "utf-8" }),
  });
  if (!blob?.sha) throw new Error(`GitHub did not save ${cleanPath}`);

  const parent = await branchHead(repo);
  if (!parent) throw new Error("GitHub repository has no main branch");
  const parentCommit = await github<GithubCommit>(`/repos/${repo}/git/commits/${parent}`);
  const baseTree = parentCommit?.tree?.sha;
  if (!baseTree) throw new Error("GitHub repository has no base tree");
  const tree = await github<{ sha?: string }>(`/repos/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseTree,
      tree: [{ path: cleanPath, mode: "100644", type: "blob", sha: blob.sha }],
    }),
  });
  if (!tree?.sha) throw new Error(`GitHub did not create a tree for ${cleanPath}`);
  const commit = await github<{ sha?: string }>(`/repos/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: message.slice(0, 120) || `Update ${cleanPath}`,
      tree: tree.sha,
      parents: [parent],
    }),
  });
  if (!commit?.sha) throw new Error(`GitHub did not commit ${cleanPath}`);
  await github(`/repos/${repo}/git/refs/heads/main`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  return commit.sha;
}

export async function restoreWorkspaceFromGithub(ws: DevWorkspace, repo: string): Promise<boolean> {
  const head = await branchHead(repo);
  if (!head) return false;
  const commit = await github<GithubCommit>(`/repos/${repo}/git/commits/${head}`);
  const treeSha = commit?.tree?.sha;
  if (!treeSha) return false;
  const tree = await github<GithubTree>(`/repos/${repo}/git/trees/${treeSha}?recursive=1`);
  const files = (tree?.tree ?? []).filter((item) => item.type === "blob" && item.path && item.sha);
  for (const file of files) {
    const blob = await github<GithubBlob>(`/repos/${repo}/git/blobs/${file.sha}`);
    if (!blob?.content || !file.path) continue;
    const content = blob.encoding === "base64"
      ? Buffer.from(blob.content.replace(/\s/g, ""), "base64").toString("utf8")
      : blob.content;
    await ws.writeFile(file.path, content);
  }
  return files.length > 0;
}