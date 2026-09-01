/** @doc Open a Coder project in StackBlitz — gives users a real Vite/Node build, terminal, HMR, and package install. */
import type { ProjectFile } from "@/lib/extractProjectFiles";
import { toast } from "sonner";

const STACKBLITZ_URL = "https://stackblitz.com/run";

/**
 * Detects whether the generated files look like a Vite React app.
 * StackBlitz picks the right runner from `template`.
 */
function detectTemplate(files: ProjectFile[]): "node" | "html" {
  const pkg = files.find((f) => f.path === "package.json");
  if (pkg) return "node";
  return "html";
}

/** Ensure a minimal package.json + vite config exist so StackBlitz can `npm run dev`. */
function ensureViteScaffold(files: ProjectFile[]): ProjectFile[] {
  const has = (p: string) => files.some((f) => f.path === p);
  const out = [...files];
  const hasReact = files.some((f) => /\.(tsx|jsx)$/.test(f.path) || /from ['"]react['"]/.test(f.content));

  if (!has("package.json") && hasReact) {
    out.push({
      path: "package.json",
      lang: "json",
      content: JSON.stringify(
        {
          name: "megsy-coder-project",
          private: true,
          type: "module",
          scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
          dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
          devDependencies: {
            "@vitejs/plugin-react": "^4.3.4",
            typescript: "^5.6.3",
            vite: "^5.4.10",
            "@types/react": "^18.3.12",
            "@types/react-dom": "^18.3.1",
          },
        },
        null,
        2,
      ),
    });
  }
  if (!has("vite.config.ts") && !has("vite.config.js") && hasReact) {
    out.push({
      path: "vite.config.ts",
      lang: "ts",
      content:
        `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nexport default defineConfig({ plugins: [react()] });\n`,
    });
  }
  if (!has("index.html") && hasReact) {
    out.push({
      path: "index.html",
      lang: "html",
      content:
        `<!doctype html><html><head><meta charset="utf-8"/><title>Megsy Coder</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`,
    });
  }
  return out;
}

/**
 * Opens the project in StackBlitz WebContainer — real Node.js / Vite / npm in the browser.
 * Uses the public "run" endpoint via a form POST (avoids extra SDK dep).
 */
export function openInStackBlitz(files: ProjectFile[], name = "megsy-coder-project"): void {
  if (!files.length) {
    toast.error("No files to open");
    return;
  }
  const scaffolded = ensureViteScaffold(files);
  const template = detectTemplate(scaffolded);
  const form = document.createElement("form");
  form.method = "POST";
  form.action = STACKBLITZ_URL;
  form.target = "_blank";
  form.style.display = "none";

  const add = (key: string, value: string) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = key;
    input.value = value;
    form.appendChild(input);
  };

  add("project[title]", name);
  add("project[description]", "Built with Megsy Coder");
  add("project[template]", template);
  for (const f of scaffolded) add(`project[files][${f.path}]`, f.content);

  document.body.appendChild(form);
  form.submit();
  form.remove();
  toast.success("Opening in StackBlitz…", { description: "Real Vite build + terminal + HMR" });
}
