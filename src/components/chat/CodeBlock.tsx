import { useState, useMemo, lazy, Suspense } from "react";
import { Check, Copy, FileCode2, WrapText, ChevronDown, ChevronUp } from "lucide-react";

// Lazy-load the ~628KB syntax highlighter only when a code block actually renders.
const CodeBlockHighlighter = lazy(() => import("./CodeBlockHighlighter"));



interface Props {
  code: string;
  lang?: string;
  className?: string;
  onPreview?: (code: string, lang: string) => void;
}

const LANG_LABEL: Record<string, string> = {
  js: "JavaScript",
  jsx: "JSX",
  ts: "TypeScript",
  tsx: "TSX",
  py: "Python",
  python: "Python",
  sh: "Shell",
  bash: "Bash",
  zsh: "Shell",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  json: "JSON",
  md: "Markdown",
  sql: "SQL",
  rs: "Rust",
  go: "Go",
  java: "Java",
  c: "C",
  cpp: "C++",
  cs: "C#",
  php: "PHP",
  rb: "Ruby",
  yml: "YAML",
  yaml: "YAML",
  xml: "XML",
  diff: "Diff",
  dockerfile: "Dockerfile",
  toml: "TOML",
  swift: "Swift",
  kotlin: "Kotlin",
  dart: "Dart",
};

const LANG_ALIAS: Record<string, string> = {
  js: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  py: "python",
  sh: "bash",
  zsh: "bash",
  yml: "yaml",
  rs: "rust",
  cs: "csharp",
};

const COLLAPSE_THRESHOLD = 24;

export default function CodeBlock({ code, lang, className, onPreview }: Props) {
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const label = (lang && (LANG_LABEL[lang.toLowerCase()] || lang.toUpperCase())) || "Code";
  const prismLang = useMemo(() => {
    if (!lang) return "text";
    const l = lang.toLowerCase();
    return LANG_ALIAS[l] || l;
  }, [lang]);

  const lineCount = useMemo(() => code.split("\n").length, [code]);
  const collapsible = lineCount > COLLAPSE_THRESHOLD;
  const showCollapsed = collapsible && !expanded;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div
      className="my-4 rounded-2xl overflow-hidden group/code"
      style={{
        backgroundColor: "var(--code-bg)",
        boxShadow:
          "inset 0 0 0 1px hsl(var(--foreground) / 0.10), 0 20px 50px -28px hsl(0 0% 0% / 0.6)",
      }}
      dir="ltr"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3.5 h-10 border-b"
        style={{
          backgroundColor: "var(--code-header-bg)",
          borderColor: "hsl(var(--foreground) / 0.10)",
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <FileCode2 className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--code-fg-muted)" }} />
          <span
            className="text-[11px] font-medium tracking-wide uppercase truncate"
            style={{ color: "var(--code-fg)" }}
          >
            {label}
          </span>
          <span className="text-[10.5px] tabular-nums" style={{ color: "var(--code-fg-subtle)" }}>
            · {lineCount} {lineCount === 1 ? "line" : "lines"}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setWrap((w) => !w)}
            title={wrap ? "Disable wrap" : "Wrap lines"}
            className={`inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
              wrap
                ? "text-indigo-300 bg-indigo-500/10"
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-label="Toggle wrap"
          >
            <WrapText className="w-3.5 h-3.5" />
          </button>
          {onPreview && lang && (
            <button
              type="button"
              onClick={() => onPreview(code, lang)}
              className="text-[11px] px-2 h-7 rounded-md text-muted-foreground hover:text-foreground transition-colors"
            >
              Preview
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 text-[11px] px-2 h-7 rounded-md text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Copy code"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" /> Copy
              </>
            )}
          </button>
        </div>
      </div>

      {/* Body */}
      <div
        className="relative overflow-x-auto code-block-body"
        style={{
          maxHeight: showCollapsed ? "320px" : undefined,
          overflowY: showCollapsed ? "hidden" : undefined,
        }}
      >
        <Suspense
          fallback={
            <pre
              style={{
                margin: 0,
                padding: "14px 16px",
                fontSize: "13px",
                lineHeight: "1.55",
                color: "var(--code-fg)",
                fontFamily:
                  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
                whiteSpace: wrap ? "pre-wrap" : "pre",
                wordBreak: wrap ? "break-word" : "normal",
              }}
            >
              <code>{code}</code>
            </pre>
          }
        >
          <CodeBlockHighlighter
            code={code}
            language={prismLang}
            showLineNumbers={lineCount > 3}
            wrap={wrap}
          />
        </Suspense>

        {showCollapsed && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-20"
            style={{
              background: "linear-gradient(to bottom, transparent, hsl(var(--card) / 0.95))",
            }}
          />
        )}
      </div>

      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="w-full flex items-center justify-center gap-1.5 h-8 text-[11px] text-muted-foreground hover:text-foreground transition-colors border-t border-foreground/[0.06]"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" /> Collapse
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" /> Show all {lineCount} lines
            </>
          )}
        </button>
      )}
    </div>
  );
}
