/** @doc Publishes a Coder-generated multi-file project to a public shareable URL by storing compiled HTML in generated_sites. */

import { supabase } from "@/integrations/supabase/client";
import {
  buildProjectPreviewHtml,
  type ProjectFile,
} from "./extractProjectFiles";
import { buildReactRuntimeHtml, isReactProject } from "./buildReactRuntime";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Fallback: build a self-contained HTML "project bundle" page that lists every
 * file with syntax-friendly formatting, plus a one-click download of the raw
 * JSON. This runs when the project has no `index.html` entry (e.g. React/Vite).
 */
export function buildProjectBundleHtml(
  files: ProjectFile[],
  title: string,
): string {
  const filesJson = JSON.stringify(files, null, 2);
  const items = files
    .map(
      (f, i) => `
        <details ${i < 2 ? "open" : ""} class="file">
          <summary><span class="path">${esc(f.path)}</span><span class="lang">${esc(f.lang || "")}</span></summary>
          <pre><code>${esc(f.content)}</code></pre>
        </details>`,
    )
    .join("");

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(title)} · Megsy Coder</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: #0a0a0a; color: #f5f5f5; }
  header { padding: 32px 24px 16px; border-bottom: 1px solid rgba(255,255,255,.08); display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  header h1 { margin: 0 0 4px; font-size: 22px; font-weight: 800; letter-spacing: -.01em; }
  header p { margin: 0; color: #a3a3a3; font-size: 13px; }
  .brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; color: #5B8DEF; }
  .brand .dot { width: 8px; height: 8px; border-radius: 999px; background: #5B8DEF; box-shadow: 0 0 12px #5B8DEF; }
  .actions { display: flex; gap: 8px; }
  .btn { appearance: none; border: 1px solid rgba(255,255,255,.14); background: #111; color: #fff; padding: 8px 14px; border-radius: 999px; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; }
  .btn.primary { background: #fff; color: #000; border-color: #fff; }
  main { max-width: 1100px; margin: 0 auto; padding: 24px; display: grid; gap: 12px; }
  .file { background: #111; border: 1px solid rgba(255,255,255,.08); border-radius: 14px; overflow: hidden; }
  .file summary { cursor: pointer; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 13px; }
  .path { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #f5f5f5; }
  .lang { color: #737373; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
  pre { margin: 0; padding: 16px; background: #0a0a0a; overflow-x: auto; border-top: 1px solid rgba(255,255,255,.06); font-size: 12.5px; line-height: 1.55; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #e5e5e5; }
  footer { text-align: center; padding: 32px 16px; color: #737373; font-size: 12px; }
  footer a { color: #a3a3a3; }
</style>
</head>
<body>
<header>
  <div>
    <div class="brand"><span class="dot"></span>Megsy Coder</div>
    <h1>${esc(title)}</h1>
    <p>${files.length} files · Complete project ready to run locally</p>
  </div>
  <div class="actions">
    <button class="btn primary" id="dl">Download ZIP-JSON</button>
    <a class="btn" href="https://megsy.ai" target="_blank" rel="noopener">Megsy</a>
  </div>
</header>
<main>${items}</main>
<footer>Built with Megsy Coder · Share this link with anyone to view the full project</footer>
<script>
  const files = ${filesJson};
  document.getElementById('dl').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(files, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = ${JSON.stringify(title.replace(/\s+/g, "-").toLowerCase() || "project")} + '.json';
    a.click();
  });
</script>
</body>
</html>`;
}

function randomSlug(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${t}-${r}`;
}

export interface PublishResult {
  slug: string;
  url: string;
  /** True when the project can't run standalone and only its source is shown. */
  degraded?: boolean;
  id: string;
}

/**
 * Compiles the project into a single HTML page, stores it in
 * `generated_sites`, and returns the public share URL.
 */
/** Scan generated files for obvious secrets before publishing to a public URL. */
function scanForSecrets(files: ProjectFile[]): string | null {
  // Note: no /g flag — .test() with /g retains lastIndex across calls and can skip matches.
  const patterns: Array<[RegExp, string]> = [
    [/sk-[A-Za-z0-9]{20,}/, "OpenAI-style secret key"],
    [/sk_live_[A-Za-z0-9]{20,}/, "Stripe live secret key"],
    [/AKIA[0-9A-Z]{16}/, "AWS access key"],
    [/AIza[0-9A-Za-z\-_]{35}/, "Google API key"],
    [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "Private key"],
    [/xox[baprs]-[A-Za-z0-9-]{10,}/, "Slack token"],
    [/ghp_[A-Za-z0-9]{20,}/, "GitHub personal access token"],
    [/gh[opsu]_[A-Za-z0-9]{20,}/, "GitHub token"],
    [/sk_test_[A-Za-z0-9]{20,}/, "Stripe test secret key"],
    [/rk_live_[A-Za-z0-9]{20,}/, "Stripe restricted key"],
    [/sk-ant-[A-Za-z0-9\-_]{20,}/, "Anthropic API key"],
    [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, "JWT / service-role token"],
    [/SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"`][^'"`]{10,}/, "Supabase service role key"],
    [/sb_secret_[A-Za-z0-9_-]{10,}/, "Supabase secret key"],
    [/(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"`][A-Za-z0-9_\-]{24,}['"`]/i, "Hardcoded credential"],
  ];
  for (const f of files) {
    for (const [re, label] of patterns) if (re.test(f.content)) return `${label} detected in ${f.path}`;
  }
  return null;
}

/**
 * Published pages run inside a sandboxed iframe (no same-origin), where
 * `localStorage`/`sessionStorage` throw a SecurityError on access. Generated
 * apps (games saving high scores, todo apps, themes) crash on the first call.
 * Inject an in-memory fallback so they keep working, plus a tiny error overlay
 * so a runtime crash is visible instead of a blank white page.
 */
const RUNTIME_SHIM = `<script>(function(){
  function memStore(){
    var m = Object.create(null);
    return {
      getItem:function(k){ return Object.prototype.hasOwnProperty.call(m,String(k))?m[String(k)]:null; },
      setItem:function(k,v){ m[String(k)] = String(v); },
      removeItem:function(k){ delete m[String(k)]; },
      clear:function(){ m = Object.create(null); },
      key:function(i){ return Object.keys(m)[i] != null ? Object.keys(m)[i] : null; },
      get length(){ return Object.keys(m).length; }
    };
  }
  ['localStorage','sessionStorage'].forEach(function(name){
    var ok = false;
    try { var s = window[name]; s.setItem('__megsy__','1'); s.removeItem('__megsy__'); ok = true; } catch(e) { ok = false; }
    if (!ok) { try { Object.defineProperty(window, name, { value: memStore(), configurable: true }); } catch(e) {} }
  });
  window.addEventListener('error', function(e){
    try {
      if (document.getElementById('__megsy_err__')) return;
      var d = document.createElement('div');
      d.id = '__megsy_err__';
      d.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;background:#1b0f10;color:#ffb4b4;border:1px solid #ff6b6b55;border-radius:12px;padding:10px 14px;font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap';
      d.textContent = 'Runtime error: ' + (e && e.message ? e.message : 'unknown');
      (document.body || document.documentElement).appendChild(d);
    } catch(_) {}
  });
})();</script>`;

/**
 * Inject a Content-Security-Policy + referrer policy into the published page.
 * The runtime needs inline scripts/styles and the CDNs it loads from, but we
 * still lock down objects, form targets and base URI. `frame-ancestors` is
 * intentionally omitted — it is ignored in a <meta> CSP and only logs a warning.
 */
function withSecurityHeaders(html: string): string {
  const shimmed = /__megsy_err__/.test(html) ? html : injectShim(html);
  if (/http-equiv=["']Content-Security-Policy/i.test(shimmed)) return shimmed;
  const csp = [
    "default-src 'self' data: blob:",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: https://cdn.tailwindcss.com https://unpkg.com https://esm.sh https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https: data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "connect-src 'self' https: data: blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  const tags =
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<meta name="referrer" content="strict-origin-when-cross-origin">`;
  if (/<head[^>]*>/i.test(shimmed)) return shimmed.replace(/<head[^>]*>/i, (m) => `${m}\n${tags}`);
  return `${tags}\n${shimmed}`;
}

function injectShim(html: string): string {
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}\n${RUNTIME_SHIM}`);
  if (/<body[^>]*>/i.test(html)) return html.replace(/<body[^>]*>/i, (m) => `${m}\n${RUNTIME_SHIM}`);
  return `${RUNTIME_SHIM}\n${html}`;
}

/**
 * Same storage fallback + error overlay used by published sites, exposed so the
 * in-app Studio preview can run inside a sandbox without `allow-same-origin`.
 */
export function withRuntimeShim(html: string): string {
  return /__megsy_err__/.test(html) ? html : injectShim(html);
}


export async function publishProject(
  files: ProjectFile[],
  opts: { title?: string; prompt?: string; siteId?: string } = {},
): Promise<PublishResult> {
  if (!files.length) throw new Error("No files to publish");
  const leaked = scanForSecrets(files);
  if (leaked) throw new Error(`Refusing to publish — ${leaked}. Remove the secret first.`);

  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) throw new Error("Please sign in first to publish");

  const title = (opts.title || "Megsy Project").slice(0, 120);
  // Priority: 1) plain static HTML site (buildProjectPreviewHtml returns non-null
  // only for runnable index.html) → 2) React/Vite project → real in-browser runtime
  // → 3) last-resort: readable file bundle listing.
  const runnable =
    buildProjectPreviewHtml(files) ||
    (isReactProject(files) ? buildReactRuntimeHtml(files, title) : null);
  // The bundle fallback is a source browser, not a running app. Say so instead
  // of handing back a share link that looks live but isn't.
  const degraded = !runnable;
  const html = withSecurityHeaders(runnable || buildProjectBundleHtml(files, title));

  // Re-publishing an existing project updates it in place so the shared link
  // never changes (and we don't pile up duplicate rows in the user's history).
  if (opts.siteId) {
    const { data, error } = await supabase
      .from("generated_sites")
      .update({
        title,
        html_compiled: html,
        files: files as unknown as never,
        is_public: true,
        status: "published",
        updated_at: new Date().toISOString(),
      })
      .eq("id", opts.siteId)
      .eq("user_id", user.id)
      .select("id, share_slug")
      .maybeSingle();
    if (data?.share_slug) {
      return {
        id: data.id as string,
        slug: data.share_slug as string,
        url: `${window.location.origin}/s/${data.share_slug}`,
        degraded,
      };
    }
    // A real failure (permissions, network) must surface — silently inserting a
    // duplicate would hand the user a second, different link for one project.
    if (error) throw new Error(error.message || "Could not update the published site");
    // No error and no row: the site was deleted — fall through to a fresh insert.
  }


  const slug = randomSlug();
  const publishedUrl = `${window.location.origin}/s/${slug}`;

  const { data, error } = await supabase
    .from("generated_sites")
    .insert({
      user_id: user.id,
      title,
      prompt: (opts.prompt || "").slice(0, 2000),
      jsx_code: "",
      html_compiled: html,
      share_slug: slug,
      is_public: true,
      status: "published",
      files: files as unknown as never,
      published_url: publishedUrl,
      model_used: "megsy-coder",
    })
    .select("id, share_slug")
    .single();

  if (error) throw new Error(error.message || "Failed to publish");

  return {
    id: data.id as string,
    slug: data.share_slug as string,
    url: publishedUrl,
    degraded,
  };
}

