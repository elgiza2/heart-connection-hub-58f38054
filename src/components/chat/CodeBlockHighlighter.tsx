// Facebook-style per-language splitting for Prism.
// - `PrismAsyncLight` loads each language grammar as its own async chunk on
//   first use, so a message with only "ts" fenced code never downloads
//   grammars for python/rust/sql/etc.
// - The `oneDark` theme is imported directly (small, static).
// Net: the shared `syntax` chunk drops from ~628 KB to just the highlighter
// runtime; each language becomes a tiny lazy chunk downloaded on demand.
// Import PrismAsyncLight from its own module (NOT the barrel index) — the
// barrel `react-syntax-highlighter` re-exports `Prism` which statically
// bundles ~40 language grammars (~600 KB). The `prism-async-light` module
// ships only the runtime and lets us register grammars on demand.
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism-async-light";
import oneDark from "react-syntax-highlighter/dist/esm/styles/prism/one-dark";

// Register a small set of "hot" languages on-demand. Each entry becomes its
// own chunk thanks to the dynamic import — Prism only fetches what the
// current message actually renders.
const LANG_LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  javascript: () => import("react-syntax-highlighter/dist/esm/languages/prism/javascript"),
  js: () => import("react-syntax-highlighter/dist/esm/languages/prism/javascript"),
  jsx: () => import("react-syntax-highlighter/dist/esm/languages/prism/jsx"),
  typescript: () => import("react-syntax-highlighter/dist/esm/languages/prism/typescript"),
  ts: () => import("react-syntax-highlighter/dist/esm/languages/prism/typescript"),
  tsx: () => import("react-syntax-highlighter/dist/esm/languages/prism/tsx"),
  python: () => import("react-syntax-highlighter/dist/esm/languages/prism/python"),
  py: () => import("react-syntax-highlighter/dist/esm/languages/prism/python"),
  bash: () => import("react-syntax-highlighter/dist/esm/languages/prism/bash"),
  shell: () => import("react-syntax-highlighter/dist/esm/languages/prism/bash"),
  sh: () => import("react-syntax-highlighter/dist/esm/languages/prism/bash"),
  json: () => import("react-syntax-highlighter/dist/esm/languages/prism/json"),
  css: () => import("react-syntax-highlighter/dist/esm/languages/prism/css"),
  scss: () => import("react-syntax-highlighter/dist/esm/languages/prism/scss"),
  html: () => import("react-syntax-highlighter/dist/esm/languages/prism/markup"),
  xml: () => import("react-syntax-highlighter/dist/esm/languages/prism/markup"),
  markdown: () => import("react-syntax-highlighter/dist/esm/languages/prism/markdown"),
  md: () => import("react-syntax-highlighter/dist/esm/languages/prism/markdown"),
  yaml: () => import("react-syntax-highlighter/dist/esm/languages/prism/yaml"),
  yml: () => import("react-syntax-highlighter/dist/esm/languages/prism/yaml"),
  sql: () => import("react-syntax-highlighter/dist/esm/languages/prism/sql"),
  go: () => import("react-syntax-highlighter/dist/esm/languages/prism/go"),
  rust: () => import("react-syntax-highlighter/dist/esm/languages/prism/rust"),
  rs: () => import("react-syntax-highlighter/dist/esm/languages/prism/rust"),
  java: () => import("react-syntax-highlighter/dist/esm/languages/prism/java"),
  c: () => import("react-syntax-highlighter/dist/esm/languages/prism/c"),
  cpp: () => import("react-syntax-highlighter/dist/esm/languages/prism/cpp"),
  csharp: () => import("react-syntax-highlighter/dist/esm/languages/prism/csharp"),
  cs: () => import("react-syntax-highlighter/dist/esm/languages/prism/csharp"),
  php: () => import("react-syntax-highlighter/dist/esm/languages/prism/php"),
  ruby: () => import("react-syntax-highlighter/dist/esm/languages/prism/ruby"),
  rb: () => import("react-syntax-highlighter/dist/esm/languages/prism/ruby"),
  swift: () => import("react-syntax-highlighter/dist/esm/languages/prism/swift"),
  kotlin: () => import("react-syntax-highlighter/dist/esm/languages/prism/kotlin"),
  dart: () => import("react-syntax-highlighter/dist/esm/languages/prism/dart"),
  diff: () => import("react-syntax-highlighter/dist/esm/languages/prism/diff"),
  docker: () => import("react-syntax-highlighter/dist/esm/languages/prism/docker"),
  dockerfile: () => import("react-syntax-highlighter/dist/esm/languages/prism/docker"),
  graphql: () => import("react-syntax-highlighter/dist/esm/languages/prism/graphql"),
  toml: () => import("react-syntax-highlighter/dist/esm/languages/prism/toml"),
  ini: () => import("react-syntax-highlighter/dist/esm/languages/prism/ini"),
};

const registered = new Set<string>();
async function ensureLanguage(lang: string) {
  const key = lang?.toLowerCase?.() || "";
  const loader = LANG_LOADERS[key];
  if (!loader || registered.has(key)) return;
  try {
    const mod: any = await loader();
    // PrismAsyncLight exposes `registerLanguage` statically.
    SyntaxHighlighter.registerLanguage(key, mod.default);
    registered.add(key);
  } catch {
    // Unknown/failed grammar → fall back to plain text rendering.
  }
}

interface Props {
  code: string;
  language: string;
  showLineNumbers: boolean;
  wrap: boolean;
}

export default function CodeBlockHighlighter({ code, language, showLineNumbers, wrap }: Props) {
  // Fire-and-forget: PrismAsyncLight re-renders once the grammar registers.
  void ensureLanguage(language);
  return (
    <SyntaxHighlighter
      language={language}
      style={oneDark}
      showLineNumbers={showLineNumbers}
      wrapLongLines={wrap}
      customStyle={{
        margin: 0,
        padding: "14px 16px",
        background: "transparent",
        fontSize: "13px",
        lineHeight: "1.55",
        color: "var(--code-fg)",
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      }}
      lineNumberStyle={{
        minWidth: "2.25em",
        paddingRight: "1em",
        color: "var(--code-fg-subtle)",
        userSelect: "none",
        fontSize: "11.5px",
      }}
      codeTagProps={{
        style: {
          fontFamily: "inherit",
          whiteSpace: wrap ? "pre-wrap" : "pre",
          wordBreak: wrap ? "break-word" : "normal",
        },
      }}
    >
      {code}
    </SyntaxHighlighter>
  );
}
