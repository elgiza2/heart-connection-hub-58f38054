/**
 * @doc Server-only tool layer for the Dev Agent.
 *
 * Everything the agent can physically do lives here: booting a VM, scaffolding
 * a real React 18 + Vite + TypeScript + Tailwind project, editing files,
 * running shell commands, building, committing to the project's Git repo,
 * importing a GitHub repo, wiring Supabase env vars and deploying.
 *
 * The agent loop only chooses which of these to call — it never talks to the
 * Freestyle API directly.
 */
import { FreestyleClient, type ExecResult } from "./freestyle";
import { guardCommand, guardPath } from "../agent/safePaths";
import { validateToolCall } from "../agent/toolSchemas";


const WORKDIR = "/app";

export interface ToolCall {
  tool: string;
  path?: string;
  content?: string;
  command?: string;
  /** search_files pattern. */
  query?: string;
  message?: string;

  [key: string]: unknown;
}

export interface ToolResult {
  ok: boolean;
  output: string;
}

function clip(text: string, max = 4000): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n… (truncated, ${text.length - max} more chars)`;
}

/** A live project checkout inside one Freestyle VM. */
export class DevWorkspace {
  readonly client: FreestyleClient;
  readonly vmId: string;

  constructor(client: FreestyleClient, vmId: string) {
    this.client = client;
    this.vmId = vmId;
  }

  static async boot(
    client: FreestyleClient,
    existingVmId?: string | null,
    existingPreviewUrl?: string | null,
  ): Promise<{ ws: DevWorkspace; vmId: string; previewUrl: string | null; reused: boolean }> {
    if (existingVmId) {
      // Reuse the existing VM whenever it still exists — creating a fresh VM
      // per slice used to wipe the workspace and force a full re-scaffold.
      try {
        const info = await client.getVm(existingVmId).catch(() => null);
        const state = String(info?.state ?? "").toLowerCase();
        if (info && state !== "deleted" && state !== "deleting") {
          if (state !== "running") await client.startVm(existingVmId);
          // Older VMs may have a root-owned workdir from the fs API.
          await client.exec(existingVmId, `sudo mkdir -p ${WORKDIR} && sudo chown -R $(id -un):$(id -gn) ${WORKDIR}`, 30_000).catch(() => null);
          return {
            ws: new DevWorkspace(client, existingVmId),
            vmId: existingVmId,
            previewUrl: existingPreviewUrl ?? null,
            reused: true,
          };
        }
      } catch {
        /* VM was reaped — fall through and create a fresh one */
      }
    }
    const vm = await client.createVm({ idleTimeoutSeconds: 1800 });
    const ws = new DevWorkspace(client, vm.id);
    await client.waitForRunning(vm.id);
    // NOTE: ws.bash cds into WORKDIR first, which fails before the dir exists.
    await client.exec(vm.id, `sudo mkdir -p ${WORKDIR} && sudo chown -R $(id -un):$(id -gn) ${WORKDIR}`, 30_000);
    // v5 VMs have no implicit domain — route a style.dev name to port 3000.
    const previewDomain = await client.exposePort(vm.id, 3000);
    return {
      ws,
      vmId: vm.id,
      previewUrl: `https://${previewDomain}`,
      reused: false,
    };
  }

  bash(command: string, timeoutMs = 240_000): Promise<ExecResult> {
    return this.client.exec(this.vmId, `cd ${WORKDIR} && ${command}`, timeoutMs);
  }

  /** True when the workdir already holds a project. */
  async hasProject(): Promise<boolean> {
    const res = await this.bash("test -f package.json && echo yes || echo no", 30_000);
    return res.stdout.includes("yes");
  }

  /**
   * Scaffolds a real Vite + React 18 + TS + Tailwind + router app — not an
   * HTML page. Everything is installed inside the VM, so the agent works with
   * a genuine node_modules and a genuine build.
   */
  async scaffold(): Promise<ExecResult> {
    // exec-await caps each call at ~290s, so scaffold runs in stages.
    const stages: Array<{ cmd: string; timeout: number }> = [
      { cmd: "printf '%s' '{\"name\":\"app\",\"private\":true,\"version\":\"0.0.0\"}' > package.json && npm create vite@latest . -- --template react-ts --yes && npm pkg set dependencies.react=^18.3.1 dependencies.react-dom=^18.3.1", timeout: 240_000 },
      { cmd: "npm install && npm install react-router-dom lucide-react clsx framer-motion", timeout: 280_000 },
      // postcss/tailwind configs must be .cjs — create-vite sets
      // "type": "module", so module.exports in a .js file crashes Vite.
      { cmd: "npm install -D tailwindcss@^3.4.17 postcss autoprefixer && npx tailwindcss init -p && for f in postcss.config tailwind.config; do [ -f $f.js ] && grep -q 'module.exports' $f.js && mv $f.js $f.cjs; done; true", timeout: 280_000 },
      {
        cmd: [
          `printf '%s\\n' "/** @type {import('tailwindcss').Config} */" "export default { content: ['./index.html','./src/**/*.{js,ts,jsx,tsx}'], theme: { extend: {} }, plugins: [] }" > tailwind.config.js`,
          `printf '%s\\n' "@tailwind base;" "@tailwind components;" "@tailwind utilities;" > src/index.css`,
        ].join(" && "),
        timeout: 30_000,
      },
    ];
    let last: ExecResult = { stdout: "", stderr: "", exitCode: 0 };
    for (const stage of stages) {
      last = await this.bash(stage.cmd, stage.timeout);
      if (last.exitCode !== 0) return last;
    }
    return last;
  }

  /** Imports a public GitHub repository into the workdir. */
  async importGithub(repoUrl: string, branch?: string): Promise<ExecResult> {
    const b = branch ? `-b ${branch}` : "";
    return this.bash(
      `rm -rf ./* ./.[!.]* 2>/dev/null; git clone --depth 1 ${b} ${repoUrl} . && (npm install || true)`,
      480_000,
    );
  }

  /**
   * Makes sure the workspace can actually serve: vite + react plugin installed
   * locally and a config that accepts the style.dev preview host (Vite blocks
   * unknown Host headers with 403 otherwise).
   */
  /**
   * Guarantees the Vite entrypoints exist. A workspace restored from GitHub
   * only carries the files the agent itself wrote, so index.html / main.tsx
   * can be missing — which serves a blank white page.
   */
  async ensureEntrypoints(): Promise<void> {
    const has = await this.bash(
      "test -f index.html && echo html; test -f src/main.tsx -o -f src/main.jsx && echo main; test -f src/App.tsx -o -f src/App.jsx && echo app; test -f src/index.css && echo css",
      30_000,
    );
    if (!has.stdout.includes("html")) {
      await this.client.writeFile(
        this.vmId,
        `${WORKDIR}/index.html`,
        [
          "<!doctype html>",
          '<html lang="en">',
          '  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>App</title></head>',
          '  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>',
          "</html>",
          "",
        ].join("\n"),
      ).catch(() => undefined);
    }
    if (!has.stdout.includes("main")) {
      await this.client.writeFile(
        this.vmId,
        `${WORKDIR}/src/main.tsx`,
        [
          "import React from 'react';",
          "import ReactDOM from 'react-dom/client';",
          "import App from './App';",
          "import './index.css';",
          "",
          "ReactDOM.createRoot(document.getElementById('root')!).render(",
          "  <React.StrictMode>",
          "    <App />",
          "  </React.StrictMode>,",
          ");",
          "",
        ].join("\n"),
      ).catch(() => undefined);
    }
    if (!has.stdout.includes("css")) {
      await this.bash(
        `printf '%s\\n' "@tailwind base;" "@tailwind components;" "@tailwind utilities;" > src/index.css`,
        30_000,
      );
    }
  }

  async ensureDevServerDeps(): Promise<void> {
    await this.ensureEntrypoints();
    const cfg = await this.client.readFile(this.vmId, `${WORKDIR}/vite.config.ts`).catch(() => "");
    if (!cfg.includes("allowedHosts")) {
      await this.client.writeFile(
        this.vmId,
        // .js wins over .ts in Vite's config resolution, so this always applies.
        `${WORKDIR}/vite.config.js`,
        [
          "import { defineConfig } from 'vite';",
          "import react from '@vitejs/plugin-react';",
          "export default defineConfig({ plugins: [react()], server: { host: true, allowedHosts: true }, preview: { host: true, allowedHosts: true } });",
          "",
        ].join("\n"),
      ).catch(() => undefined);
    }
    await this.bash(
      "test -x node_modules/.bin/vite || npm i -D vite @vitejs/plugin-react > /tmp/vite-install.log 2>&1 || true",
      280_000,
    );
    // Motion + icons are part of the house design system — always available.
    await this.bash(
      "test -d node_modules/framer-motion || npm i framer-motion lucide-react clsx > /tmp/motion-install.log 2>&1 || true",
      280_000,
    );
    // CJS configs break under "type": "module" — normalize to .cjs.
    await this.bash(
      "for f in postcss.config tailwind.config; do [ -f $f.js ] && grep -q 'module.exports' $f.js && mv $f.js $f.cjs; done; true",
      30_000,
    );
  }

  /** Starts the Vite dev server on port 3000 (the VM's public preview port). */
  async startDevServer(): Promise<void> {
    await this.ensureDevServerDeps();
    await this.ensureTailwindCss();
    await this.installMissingImports();
    await this.bash(
      // Kill by port, not by name: pkill -f 'vite' matches this very shell's
      // own cmdline (it contains "npx vite …") and kills itself (exit 143).
      "(fuser -k 3000/tcp 2>/dev/null || kill $(lsof -ti:3000) 2>/dev/null || true); (nohup npx vite --host 0.0.0.0 --port 3000 > /tmp/dev.log 2>&1 &) ; sleep 3; true",
      60_000,
    );
  }

  /** True when the dev server is responding on the public preview port. */
  async isDevServerReady(retries = 8): Promise<boolean> {
    for (let i = 0; i < retries; i++) {
      const res = await this.bash(
        "curl -sf -o /dev/null http://localhost:3000/ && echo ready || echo not_ready",
        10_000,
      );
      if (res.stdout.includes("ready")) return true;
      await new Promise((r) => setTimeout(r, 1500));
    }
    return false;
  }

  /** Reads every file under dist/ into a deployable map. */
  async collectDistFiles(): Promise<Record<string, { content: string; encoding?: string }>> {
    const files: Record<string, { content: string; encoding?: string }> = {};
    const queue: string[] = ["dist"];
    while (queue.length) {
      const dir = queue.shift()!;
      const listing = await this.client.listDir(this.vmId, `${WORKDIR}/${dir}`);
      for (const item of listing) {
        const fullPath = `${dir}/${item.name}`;
        if (item.kind === "directory") {
          queue.push(fullPath);
        } else {
          const content = await this.readFile(fullPath);
          files[fullPath.replace(/^dist\//, "")] = { content };
        }
      }
    }
    return files;
  }

  async writeFile(path: string, content: string): Promise<void> {
    const cleanPath = path.replace(/^\/+/, "");
    if (!cleanPath || cleanPath.split("/").includes("..")) {
      throw new Error("Invalid project file path");
    }
    const dir = cleanPath.split("/").slice(0, -1).join("/");
    if (dir) await this.bash(`mkdir -p ${JSON.stringify(dir)}`, 20_000);
    const absolutePath = `${WORKDIR}/${cleanPath}`;
    await this.client.writeFile(this.vmId, absolutePath, content);
    const saved = await this.client.readFile(this.vmId, absolutePath);
    if (saved !== content) throw new Error(`File verification failed: ${cleanPath}`);
  }

  async readFile(path: string): Promise<string> {
    return this.client.readFile(this.vmId, `${WORKDIR}/${path.replace(/^\/+/, "")}`);
  }

  /** Text project snapshot used by the private GitHub persistence layer. */
  async projectFiles(): Promise<Array<{ path: string; content: string }>> {
    const listed = await this.bash(
      "find . -type f -size -2M -not -path './node_modules/*' -not -path './.git/*' -not -path './dist/*' -not -name '.env' -print | sed 's#^./##' | sort | head -400",
      45_000,
    );
    const paths = listed.stdout.split("\n").map((path) => path.trim()).filter(Boolean);
    const files: Array<{ path: string; content: string }> = [];
    for (const path of paths) {
      const content = await this.readFile(path);
      if (content.includes("\u0000")) continue;
      files.push({ path, content });
    }
    return files;
  }

  /** Compact file tree the model can reason about, ignoring noise. */
  async tree(depth = 3): Promise<string> {
    const res = await this.bash(
      `find . -maxdepth ${depth} -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' | head -160`,
      45_000,
    );
    return res.stdout.trim();
  }

  /**
   * The coder often rewrites src/index.css with hand-rolled CSS variables and
   * drops the @tailwind directives — every Tailwind class in the app then does
   * nothing and the page renders unstyled. Re-inject the directives on top.
   */
  async ensureTailwindCss(): Promise<void> {
    await this.bash(
      [
        "test -f src/index.css || : > src/index.css",
        "grep -q '@tailwind utilities' src/index.css || " +
          "{ printf '%s\\n' '@tailwind base;' '@tailwind components;' '@tailwind utilities;' '' > /tmp/tw.css" +
          " && cat src/index.css >> /tmp/tw.css && mv /tmp/tw.css src/index.css; }",
        "true",
      ].join("; "),
      30_000,
    );
  }

  /** Type-checks + builds. This is the verifier's ground truth. */
  async build(): Promise<ExecResult> {
    await this.ensureTailwindCss();
    await this.installMissingImports();
    // `| tail` would mask the build exit code — capture it explicitly.
    return this.bash(
      "npm run build > /tmp/build.log 2>&1; code=$?; tail -60 /tmp/build.log; exit $code",
      480_000,
    );
  }

  /**
   * TypeScript check without emitting. Cheaper and far more precise than a
   * full build, so the verifier runs it first. Projects without TypeScript
   * simply report success.
   */
  async typecheck(): Promise<ExecResult> {
    return this.bash(
      "test -f tsconfig.json || { echo 'no tsconfig — skipped'; exit 0; }; " +
        "npx --yes tsc --noEmit > /tmp/tsc.log 2>&1; code=$?; tail -60 /tmp/tsc.log; exit $code",
      300_000,
    );
  }

  /** ESLint, only when the project actually configures it. */
  async lint(): Promise<ExecResult> {
    return this.bash(
      "ls eslint.config.* .eslintrc* > /dev/null 2>&1 || { echo 'no eslint config — skipped'; exit 0; }; " +
        "npx --yes eslint src --max-warnings=0 > /tmp/lint.log 2>&1; code=$?; tail -60 /tmp/lint.log; exit $code",
      300_000,
    );
  }

  /** Runs the project's tests when a test script exists. */
  async runTests(): Promise<ExecResult> {
    return this.bash(
      "grep -q '\"test\"' package.json 2>/dev/null || { echo 'no test script — skipped'; exit 0; }; " +
        "CI=1 npm test --silent -- --run > /tmp/test.log 2>&1; code=$?; tail -60 /tmp/test.log; exit $code",
      300_000,
    );
  }

  /** ripgrep-style source search so the coder stops reading whole files. */
  async searchFiles(query: string, path = "src"): Promise<ExecResult> {
    const safePath = path.replace(/[^\w./-]/g, "") || "src";
    return this.bash(
      `grep -rnI --exclude-dir=node_modules --exclude-dir=dist -E ${JSON.stringify(query)} ${JSON.stringify(safePath)} 2>/dev/null | head -60`,
      60_000,
    );
  }

  /** Read-only git inspection (status | diff | log). */
  async git(command: string): Promise<ExecResult> {
    const map: Record<string, string> = {
      status: "git status --short | head -60",
      diff: "git --no-pager diff --stat | head -60",
      log: "git --no-pager log --oneline -20",
    };
    const cmd = map[command.trim().toLowerCase()];
    if (!cmd) {
      return { exitCode: 1, stdout: "", stderr: "git supports only: status | diff | log" };
    }
    return this.bash(`test -d .git || { echo 'not a git repo'; exit 0; }; ${cmd}`, 60_000);
  }


  /**
   * Installs every bare package the source imports but that is not in
   * node_modules. The coder frequently imports a library (react-icons,
   * zustand, …) without installing it, which serves a blank page.
   */
  async installMissingImports(): Promise<void> {
    const scan = await this.bash(
      "grep -rhoE \"from ['\\\"][^.@/][^'\\\"]*['\\\"]|from ['\\\"]@[^'\\\"]+['\\\"]\" src 2>/dev/null | sed -E \"s/.*['\\\"](.*)['\\\"]/\\1/\" | sort -u",
      60_000,
    );
    const pkgs = new Set<string>();
    for (const raw of scan.stdout.split("\n")) {
      const spec = raw.trim();
      if (!spec || spec.startsWith(".") || spec.startsWith("/")) continue;
      const name = spec.startsWith("@")
        ? spec.split("/").slice(0, 2).join("/")
        : spec.split("/")[0];
      if (!name || name === "react" || name === "react-dom") continue;
      if (!/^[@a-z0-9][\w./-]*$/i.test(name)) continue;
      pkgs.add(name);
    }
    if (!pkgs.size) return;
    const list = [...pkgs].join(" ");
    await this.bash(
      `missing=""; for p in ${list}; do [ -d "node_modules/$p" ] || missing="$missing $p"; done; ` +
        `[ -n "$missing" ] && npm install $missing > /tmp/auto-install.log 2>&1; true`,
      280_000,
    );
  }

  /**
   * Cheap static checks for the mistakes that build fine but blank the page
   * at runtime (duplicate routers, missing default export on an imported
   * component, imports of files that do not exist).
   */
  /**
   * Deterministic repairs for the two mistakes the coder repeats most:
   * a second <BrowserRouter> in main.tsx (React throws and the page blanks)
   * and a main.tsx that forgets to import the stylesheet.
   */
  async normalizeEntrypoint(): Promise<void> {
    const main = await this.bash("cat src/main.tsx 2>/dev/null || cat src/main.jsx 2>/dev/null", 30_000);
    const app = await this.bash("cat src/App.tsx 2>/dev/null || cat src/App.jsx 2>/dev/null", 30_000);
    let body = main.stdout;
    if (!body.trim()) return;
    const appHasRouter = /BrowserRouter|createBrowserRouter/.test(app.stdout);
    let changed = false;
    if (appHasRouter && /BrowserRouter/.test(body)) {
      body = body
        .replace(/^.*\bBrowserRouter\b.*from\s+['"]react-router-dom['"];?\s*$/gm, "")
        .replace(/<BrowserRouter>\s*/g, "")
        .replace(/\s*<\/BrowserRouter>/g, "");
      changed = true;
    }
    if (!/index\.css|globals?\.css/.test(body)) {
      body = body.replace(/(^import .*$)/m, "$1\nimport './index.css';");
      changed = true;
    }
    if (changed) await this.writeFile("src/main.tsx", body.replace(/\n{3,}/g, "\n\n"));
  }

  /**
   * "Is this actually a product?" checks. A build can be green while the app
   * is a single hero screen — that is the #1 complaint about generated apps.
   * These issues are fed back to the coder as extra work, not as errors.
   */
  async completenessIssues(): Promise<string[]> {
    const issues: string[] = [];
    const res = await this.bash(
      [
        "echo '<<<ROUTES>>>'",
        "grep -rhoE '<Route[^>]*path=' src 2>/dev/null | wc -l",
        "echo '<<<PAGES>>>'",
        "ls src/pages/*.tsx src/pages/*.jsx src/screens/*.tsx 2>/dev/null | wc -l",
        "echo '<<<COMPONENTS>>>'",
        "ls src/components/*.tsx src/components/**/*.tsx 2>/dev/null | wc -l",
        "echo '<<<LINES>>>'",
        "cat $(find src -name '*.tsx' -o -name '*.jsx' 2>/dev/null) 2>/dev/null | wc -l",
        "echo '<<<LINK>>>'",
        "grep -rhoE '<(Link|NavLink)\\b' src 2>/dev/null | wc -l",
      ].join("; "),
      60_000,
    );
    const num = (key: string) => {
      const m = new RegExp(`<<<${key}>>>\\s*(\\d+)`).exec(res.stdout);
      return m ? Number(m[1]) : 0;
    };
    const routes = num("ROUTES");
    const pages = num("PAGES");
    const components = num("COMPONENTS");
    const lines = num("LINES");
    const links = num("LINK");
    if (routes < 4) {
      issues.push(
        `The app only has ${routes} route(s). A real product needs at least 4 routed pages in src/pages (e.g. Home, Browse/Explore, Detail, Library/Profile, Search) wired in src/App.tsx.`,
      );
    }
    if (pages < 4) {
      issues.push(
        `Only ${pages} page file(s) exist under src/pages. Create the missing page components with real content, mock data and framer-motion.`,
      );
    }
    if (components < 4) {
      issues.push(
        `Only ${components} component file(s) exist. Extract a real UI: navigation/sidebar, cards, lists, player/detail panels, empty states.`,
      );
    }
    if (links < 3) {
      issues.push(
        "Navigation is missing: add a persistent sidebar/header with <Link> entries to every page so the app is actually navigable.",
      );
    }
    if (lines < 600) {
      issues.push(
        `The whole app is only ${lines} lines of JSX — it is a skeleton. Flesh out each page with realistic mock data (10-30 items), interactive state and responsive layout.`,
      );
    }
    return issues.slice(0, 5);
  }

  async staticIssues(): Promise<string[]> {
    const issues: string[] = [];
    const routers = await this.bash(
      "grep -rl 'BrowserRouter\\|createBrowserRouter' src 2>/dev/null | sort",
      60_000,
    );
    const routerFiles = routers.stdout.split("\n").map((f) => f.trim()).filter(Boolean);
    if (routerFiles.length > 1) {
      issues.push(
        `The router is mounted in more than one file (${routerFiles.join(", ")}). Keep exactly one <BrowserRouter> — in src/App.tsx — and remove it from the others.`,
      );
    }
    // Every relative import must resolve to a real file. Parsing happens here
    // (not in shell) so quotes and `../` segments are handled correctly.
    const rawImports = await this.bash(
      "grep -rnE \"from ['\\\"]\\\\.\" src 2>/dev/null | head -300",
      60_000,
    );
    const targets = new Set<string>();
    for (const line of rawImports.stdout.split("\n")) {
      const m = /^([^:]+):\d+:.*from\s+['"](\.[^'"]+)['"]/.exec(line.trim());
      if (!m) continue;
      const segs = m[1].split("/").slice(0, -1).concat(m[2].split("/"));
      const stack: string[] = [];
      for (const seg of segs) {
        if (seg === "." || seg === "") continue;
        if (seg === "..") stack.pop();
        else stack.push(seg);
      }
      const target = stack.join("/");
      if (target && /^[\w./-]+$/.test(target)) targets.add(target);
    }
    if (targets.size) {
      const check = await this.bash(
        `for t in ${[...targets].slice(0, 60).map((t) => `'${t}'`).join(" ")}; do ` +
          `ls -d $t $t.tsx $t.ts $t.jsx $t.js $t/index.tsx $t/index.ts > /dev/null 2>&1 || echo "MISSING $t"; done`,
        60_000,
      );
      for (const m of check.stdout.split("\n").filter((l) => l.startsWith("MISSING "))) {
        issues.push(`${m.replace("MISSING ", "Imported file does not exist: ")} — create it or fix the import.`);
      }
    }

    const noDefault = await this.bash(
      "for f in $(ls src/components/*.tsx src/screens/*.tsx src/pages/*.tsx 2>/dev/null); do grep -q 'export default' $f || echo \"NODEFAULT $f\"; done",
      60_000,
    );
    for (const m of noDefault.stdout.split("\n").filter((l) => l.startsWith("NODEFAULT "))) {
      issues.push(`${m.replace("NODEFAULT ", "File has no default export: ")} — add \`export default\`.`);
    }
    return issues.slice(0, 6);
  }

  /** Writes Supabase credentials the generated app can use. */
  async writeSupabaseEnv(url: string, anonKey: string): Promise<void> {
    await this.writeFile(".env", `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_ANON_KEY=${anonKey}\n`);
  }

  /**
   * Serves the built `dist/` on port 8080 behind its own public style.dev
   * name — this is the published site. Persistence of the source itself is
   * handled by the private GitHub storage layer.
   */
  async publishDist(subdomain?: string): Promise<string> {
    const res = await this.bash("test -d dist && ls dist/index.html", 20_000);
    if (res.exitCode !== 0) throw new Error("No dist/ output to publish — run a build first");
    await this.bash(
      "pkill -f 'http-server .*8080' || true; nohup npx --yes http-server dist -p 8080 -a 0.0.0.0 --silent > /tmp/publish.log 2>&1 & sleep 3; true",
      120_000,
    );
    for (let i = 0; i < 8; i++) {
      const probe = await this.bash(
        "curl -sf -o /dev/null http://localhost:8080/ && echo ready || echo not_ready",
        10_000,
      );
      if (probe.stdout.includes("ready")) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    const domain = await this.client.exposePort(this.vmId, 8080, subdomain);
    return `https://${domain}`;
  }
}

/** Formats an exec result for the model, always truncated. */
function execOutput(res: ExecResult): ToolResult {
  return {
    ok: res.exitCode === 0,
    output: clip(`exit=${res.exitCode}\n${res.stdout}\n${res.stderr}`.trim(), 8000),
  };
}

/** Executes one model-chosen tool call against the workspace. */
export async function runTool(ws: DevWorkspace, call: ToolCall): Promise<ToolResult> {
  const invalid = validateToolCall(call as Parameters<typeof validateToolCall>[0]);
  if (invalid && call.tool !== "done") return { ok: false, output: invalid };
  if (typeof call.path === "string") {
    const guard = guardPath(call.path);
    if (!guard.allowed) return { ok: false, output: guard.reason ?? "blocked path" };
  }
  try {
    switch (call.tool) {
      case "write_file": {
        await ws.writeFile(call.path!, call.content ?? "");
        return { ok: true, output: `wrote ${call.path} (${(call.content ?? "").length} chars)` };
      }
      case "read_file": {
        return { ok: true, output: clip(await ws.readFile(call.path!), 6000) };
      }
      case "delete_file": {
        await ws.bash(`rm -rf ${JSON.stringify(call.path)}`, 30_000);
        return { ok: true, output: `deleted ${call.path}` };
      }
      case "list_dir": {
        const res = await ws.bash(
          `ls -1 ${JSON.stringify(call.path || ".")} | head -100`,
          30_000,
        );
        return { ok: res.exitCode === 0, output: clip(res.stdout || res.stderr) };
      }
      case "search_files": {
        const query = String(call.query ?? call.command ?? "");
        const res = await ws.searchFiles(query, typeof call.path === "string" ? call.path : "src");
        return { ok: true, output: clip(res.stdout || "(no matches)") };
      }
      case "git": {
        return execOutput(await ws.git(String(call.command ?? "status")));
      }
      case "bash": {
        const guard = guardCommand(call.command!);
        if (!guard.allowed) return { ok: false, output: guard.reason ?? "blocked command" };
        return execOutput(await ws.bash(call.command!));
      }
      case "typecheck":
        return execOutput(await ws.typecheck());
      case "lint":
        return execOutput(await ws.lint());
      case "run_tests":
        return execOutput(await ws.runTests());
      case "build":
        return execOutput(await ws.build());
      default:
        return { ok: false, output: `Unknown tool: ${call.tool}` };
    }
  } catch (err) {
    return { ok: false, output: err instanceof Error ? err.message : String(err) };
  }
}


/** Free screenshot service — no key needed, used for the deploy card. */
export function screenshotUrl(siteUrl: string): string {
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(siteUrl)}?w=1200&h=800`;
}
