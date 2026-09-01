/** @doc Parses fenced code blocks from an assistant message and returns them as a virtual file tree so multi-file coding replies can be previewed together. */

export interface ProjectFile {
  path: string;
  lang: string;
  content: string;
}

const EXT_BY_LANG: Record<string, string> = {
  html: "html",
  htm: "html",
  css: "css",
  scss: "css",
  js: "js",
  javascript: "js",
  jsx: "jsx",
  ts: "ts",
  typescript: "ts",
  tsx: "tsx",
  json: "json",
  py: "py",
  python: "py",
  md: "md",
  markdown: "md",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  sh: "sh",
  bash: "sh",
  shell: "sh",
  sql: "sql",
  env: "env",
  dotenv: "env",
  txt: "txt",
  text: "txt",
  xml: "xml",
  svg: "svg",
};

const DEFAULT_NAMES: Record<string, string> = {
  html: "index.html",
  css: "styles.css",
  js: "script.js",
  jsx: "App.jsx",
  tsx: "App.tsx",
  ts: "index.ts",
  json: "data.json",
  py: "main.py",
  md: "README.md",
  yaml: "config.yaml",
  toml: "config.toml",
  sh: "run.sh",
  sql: "schema.sql",
  env: ".env.example",
  xml: "data.xml",
  svg: "asset.svg",
};

function normalizeLang(raw: string): string {
  const l = (raw || "").toLowerCase().trim();
  if (!l) return "";
  if (l === "react") return "jsx";
  return l;
}

function detectFilenameFromContent(lang: string, code: string): string | null {
  const head = code.slice(0, 400);
  const patterns: RegExp[] = [
    /(?:^|\n)\s*(?:\/\/|#|<!--)\s*(?:file|filename|path)\s*[:=]\s*([\w./-]+)/i,
    /(?:^|\n)\s*\/\*\s*(?:file|filename|path)\s*[:=]\s*([\w./-]+)\s*\*\//i,
    /(?:^|\n)===\s*([\w./-]+)\s*===/,
    // First-line bare path comment: "// src/App.tsx" or "# app/main.py"
    /^\s*(?:\/\/|#)\s*([\w./-]+\.[a-z0-9]{1,6})\s*(?:\n|$)/i,
  ];
  for (const re of patterns) {
    const m = head.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

function safeProjectPath(raw: string): string {
  const cleaned = String(raw || "")
    .replace(/\\/g, "/")
    .replace(/^[a-zA-Z]:/, "")
    .replace(/[\u0000-\u001f]/g, "");
  const out: string[] = [];
  for (const part of cleaned.split("/")) {
    if (!part || part === "." || part === "..") continue;
    out.push(part);
  }
  return out.join("/");
}

export function extractProjectFiles(content: string): ProjectFile[] {
  if (!content) return [];
  // ```lang[:filename] or ```lang filename
  const fence = /```([A-Za-z0-9_+\-]*)(?:[ \t]*[:\s][ \t]*([\w./-]+))?[ \t]*\n([\s\S]*?)```/g;
  const files: ProjectFile[] = [];
  const used = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = fence.exec(content)) !== null) {
    const langRaw = m[1] || "";
    const explicit = m[2] || "";
    const body = m[3] || "";
    const lang = normalizeLang(langRaw);
    // CRITICAL: never treat search/replace patch blocks as whole files —
    // doing so overwrites the real source with patch markers.
    if (lang === "patch" || lang === "diff") continue;
    if (/<{5,}\s*SEARCH[\s\S]*?={5,}[\s\S]*?>{5,}\s*REPLACE/.test(body)) continue;
    if (!lang || lang === "json") {
      // skip json control blocks used elsewhere
      if (lang === "json" && /\"type\"\s*:\s*\"(questions|flow|cards)\"/.test(body)) continue;
    }
    let path = explicit || detectFilenameFromContent(lang, body) || "";
    if (!path) {
      const base = DEFAULT_NAMES[lang];
      if (!base) continue; // ignore blocks we cannot represent as a file (bash, etc.)
      const n = used.get(base) || 0;
      used.set(base, n + 1);
      path = n === 0 ? base : base.replace(/(\.[^.]+)?$/, `-${n}$1`);
    }
    const ext = EXT_BY_LANG[lang] || lang || "txt";
    path = safeProjectPath(path);
    if (!path) continue;
    if (!/\.[a-z0-9]+$/i.test(path)) path = `${path}.${ext}`;
    files.push({ path, lang, content: body });
  }
  return files;
}

/** Build a single HTML document that inlines local CSS/JS files referenced from the main HTML. */
export function buildProjectPreviewHtml(files: ProjectFile[]): string | null {
  if (!files.length) return null;
  const html = files.find((f) => /\.html?$/i.test(f.path)) || files.find((f) => f.lang === "html");
  if (!html) return null;
  // Vite/React-style entry HTML references .tsx/.jsx/.ts modules that the
  // browser cannot execute directly. Fall back to the bundle view so users
  // don't see a blank white iframe.
  if (/<script\b[^>]*(?:type=["']module["'][^>]*src=|src=["'][^"']+\.(?:tsx|jsx|ts)["'])/i.test(html.content)) {
    return null;
  }
  const byName = new Map<string, ProjectFile>();
  for (const f of files) byName.set(f.path.split("/").pop() || f.path, f);

  let out = html.content;
  // Inline <link rel="stylesheet" href="foo.css">
  out = out.replace(
    /<link\b[^>]*rel=["']?stylesheet["']?[^>]*href=["']([^"']+)["'][^>]*>/gi,
    (full, href) => {
      const key = href.split("/").pop() || href;
      const f = byName.get(key);
      return f ? `<style>\n${f.content}\n</style>` : full;
    },
  );
  // Inline <script src="foo.js"></script>
  out = out.replace(
    /<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi,
    (full, src) => {
      const key = src.split("/").pop() || src;
      const f = byName.get(key);
      return f ? `<script>\n${f.content}\n</script>` : full;
    },
  );

  // If HTML did not reference sibling css/js, auto-inject them so the preview still works.
  const referenced = new Set<string>();
  html.content.replace(/href=["']([^"']+)["']/gi, (_, v) => (referenced.add(v.split("/").pop() || v), ""));
  html.content.replace(/src=["']([^"']+)["']/gi, (_, v) => (referenced.add(v.split("/").pop() || v), ""));

  const extraStyles = files
    .filter((f) => f.lang === "css" && !referenced.has(f.path.split("/").pop() || f.path))
    .map((f) => `<style>\n${f.content}\n</style>`)
    .join("\n");
  const extraScripts = files
    .filter((f) => (f.lang === "js" || f.lang === "javascript") && !referenced.has(f.path.split("/").pop() || f.path))
    .map((f) => `<script>\n${f.content}\n</script>`)
    .join("\n");

  if (extraStyles) {
    if (/<\/head>/i.test(out)) out = out.replace(/<\/head>/i, `${extraStyles}\n</head>`);
    else out = `${extraStyles}\n${out}`;
  }
  if (extraScripts) {
    if (/<\/body>/i.test(out)) out = out.replace(/<\/body>/i, `${extraScripts}\n</body>`);
    else out = `${out}\n${extraScripts}`;
  }
  return out;
}
/**
 * Ensure a generated project has the bare essentials so it can actually run:
 * an entry `index.html` (with SEO meta) and, for React/TS projects, a
 * `package.json`. Never overwrites files the model already produced.
 */
export function ensureProjectScaffold(files: ProjectFile[], projectName = "app"): ProjectFile[] {
  if (!files.length) return files;
  const out = [...files];
  const has = (re: RegExp) => out.some((f) => re.test(f.path));
  const isReact = out.some((f) => /\.(tsx|jsx)$/i.test(f.path));

  if (!has(/(^|\/)index\.html$/i)) {
    const entry =
      out.find((f) => /(^|\/)(main|index)\.(tsx|jsx|ts|js)$/i.test(f.path))?.path ||
      out.find((f) => /\.(tsx|jsx|js)$/i.test(f.path))?.path;
    const css = out.find((f) => /\.css$/i.test(f.path))?.path;
    out.push({
      path: "index.html",
      lang: "html",
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
    <meta name="description" content="${projectName} — built with Megsy Coder." />
    <meta property="og:title" content="${projectName}" />
    <meta property="og:description" content="${projectName} — built with Megsy Coder." />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>" />
${css ? `    <link rel="stylesheet" href="/${css.replace(/^\.?\//, "")}" />\n` : ""}  </head>
  <body>
    <div id="root"></div>
${entry ? `    <script type="module" src="/${entry.replace(/^\.?\//, "")}"></script>\n` : ""}  </body>
</html>
`,
    });
  }

  if (isReact && !has(/(^|\/)package\.json$/i)) {
    const ts = out.some((f) => /\.tsx?$/i.test(f.path));
    out.push({
      path: "package.json",
      lang: "json",
      content: JSON.stringify(
        {
          name: projectName.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "app",
          private: true,
          version: "0.0.0",
          type: "module",
          scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
          dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
          devDependencies: {
            vite: "^5.4.0",
            "@vitejs/plugin-react": "^4.3.1",
            ...(ts ? { typescript: "^5.5.0" } : {}),
          },
        },
        null,
        2,
      ) + "\n",
    });
  }

  // A React project that ships without a Vite config cannot be run after
  // `npm install` — the JSX/TSX transform is never registered. Add the minimum
  // set of files so the downloaded/pushed project builds on the first try.
  if (isReact && !has(/(^|\/)vite\.config\.[jt]s$/i)) {
    const ts = out.some((f) => /\.tsx?$/i.test(f.path));
    out.push({
      path: ts ? "vite.config.ts" : "vite.config.js",
      lang: ts ? "ts" : "js",
      content: `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
`,
    });
  }

  if (!has(/(^|\/)\.gitignore$/i)) {
    out.push({
      path: ".gitignore",
      lang: "txt",
      content: "node_modules\ndist\n.env\n.env.local\n.DS_Store\n*.log\n",
    });
  }

  if (!has(/(^|\/)README\.md$/i)) {
    out.push({
      path: "README.md",
      lang: "md",
      content: `# ${projectName}

Built with Megsy Coder.

## Run locally

\`\`\`bash
npm install
npm run dev
\`\`\`

## Build for production

\`\`\`bash
npm run build
npm run preview
\`\`\`
`,
    });
  }

  return out;
}

