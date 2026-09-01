/**
 * @doc Tools the in-tab agent kernel can use without any edge deploy.
 *
 * Everything here runs in the browser: code executes in a throwaway Web Worker
 * (no DOM, no cookies, no same-origin storage), page reads go through a public
 * text-extraction proxy, and files live in the run's artifact map until the run
 * ends. Nothing here can touch the database directly — the kernel does that.
 */

export interface ToolFile {
  path: string;
  content: string;
}

export interface ToolContext {
  files: Map<string, string>;
}

export interface ToolResult {
  ok: boolean;
  output: string;
}

const MAX_OUTPUT = 6000;

function clip(text: string): string {
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n…[truncated]` : text;
}

/**
 * Runs untrusted JS in a Worker built from a blob URL. A worker has no DOM and
 * no access to the page's variables; the blob origin keeps it off our storage.
 * A hard timeout terminates runaway loops.
 */
export async function runCode(code: string, timeoutMs = 15_000): Promise<ToolResult> {
  const bootstrap = `
    const logs = [];
    const push = (...a) => logs.push(a.map(v => {
      try { return typeof v === "string" ? v : JSON.stringify(v); } catch { return String(v); }
    }).join(" "));
    self.console = { log: push, info: push, warn: push, error: push, debug: push };
    self.onmessage = async (e) => {
      try {
        const fn = new Function("return (async () => {" + e.data + "\\n})()");
        const value = await fn();
        if (value !== undefined) push(value);
        self.postMessage({ ok: true, output: logs.join("\\n") });
      } catch (err) {
        push("Error: " + (err && err.message ? err.message : String(err)));
        self.postMessage({ ok: false, output: logs.join("\\n") });
      }
    };
  `;
  const url = URL.createObjectURL(new Blob([bootstrap], { type: "text/javascript" }));
  const worker = new Worker(url);
  try {
    return await new Promise<ToolResult>((resolve) => {
      const timer = window.setTimeout(() => {
        resolve({ ok: false, output: `Timed out after ${Math.round(timeoutMs / 1000)}s` });
      }, timeoutMs);
      worker.onmessage = (e: MessageEvent<ToolResult>) => {
        window.clearTimeout(timer);
        resolve({ ok: !!e.data?.ok, output: clip(String(e.data?.output ?? "")) });
      };
      worker.onerror = (e) => {
        window.clearTimeout(timer);
        resolve({ ok: false, output: `Worker error: ${e.message}` });
      };
      worker.postMessage(code);
    });
  } finally {
    worker.terminate();
    URL.revokeObjectURL(url);
  }
}

/** Reads a public page as plain text. Only http(s) URLs are allowed. */
export async function fetchUrl(rawUrl: string): Promise<ToolResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, output: "Invalid URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, output: "Only http/https URLs are allowed" };
  }
  const host = parsed.hostname.toLowerCase();
  // Never let the model probe the private network from the user's browser.
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    /^(10|127)\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return { ok: false, output: "Private network addresses are blocked" };
  }
  try {
    const resp = await fetch(`https://r.jina.ai/${parsed.toString()}`, {
      headers: { Accept: "text/plain" },
    });
    if (!resp.ok) return { ok: false, output: `Fetch failed with ${resp.status}` };
    return { ok: true, output: clip(await resp.text()) };
  } catch (error) {
    return {
      ok: false,
      output: `Fetch failed: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}

export function writeFile(ctx: ToolContext, path: string, content: string): ToolResult {
  const clean = path.replace(/^[./]+/, "").replace(/\.\./g, "");
  if (!clean) return { ok: false, output: "A file path is required" };
  ctx.files.set(clean, content);
  return { ok: true, output: `Wrote ${clean} (${content.length} chars)` };
}

export function readFile(ctx: ToolContext, path: string): ToolResult {
  const clean = path.replace(/^[./]+/, "").replace(/\.\./g, "");
  const found = ctx.files.get(clean);
  if (found === undefined) {
    const known = [...ctx.files.keys()];
    return {
      ok: false,
      output: known.length ? `No such file. Available: ${known.join(", ")}` : "No files yet",
    };
  }
  return { ok: true, output: clip(found) };
}

export function filesToArtifacts(ctx: ToolContext): ToolFile[] {
  return [...ctx.files.entries()].map(([path, content]) => ({ path, content }));
}
