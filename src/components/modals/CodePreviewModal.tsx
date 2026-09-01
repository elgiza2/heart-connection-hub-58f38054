import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Code2, Copy, Check, Download, ExternalLink, Eye, FileCode2, Maximize2, Minimize2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { m as motion } from "framer-motion";
import {
  buildProjectPreviewHtml,
  type ProjectFile,
} from "@/lib/extractProjectFiles";
import { buildReactRuntimeHtml, isReactProject } from "@/lib/buildReactRuntime";

interface CodePreviewModalProps {
  code: string;
  lang: string;
  onClose: () => void;
  /** All sibling files from the same assistant message so the preview shows a full project. */
  files?: ProjectFile[];
  /** Path of the file initially selected in the tree. */
  initialPath?: string;
}

const wrapCodeForPreview = (lang: string, code: string): string => {
  const l = lang.toLowerCase();
  if (["html", "htm"].includes(l)) return code;

  // Python → Pyodide (WASM), runs entirely in the browser. Captures stdout/stderr.
  if (["python", "py"].includes(l)) {
    const escaped = code.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js"><\/script>
<style>html,body{margin:0;padding:0;min-height:100vh;background:#0a0a0a;color:#e5e5e5;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px}#out{padding:16px;white-space:pre-wrap}#status{padding:12px 16px;color:#7DD3FC;border-bottom:1px solid #222}.err{color:#f88}</style>
</head><body>
<div id="status">Loading Python runtime (Pyodide)…</div>
<div id="out"></div>
<script>
(async () => {
  const status = document.getElementById('status');
  const out = document.getElementById('out');
  try {
    const pyodide = await loadPyodide();
    status.textContent = 'Running…';
    pyodide.setStdout({ batched: (s) => { out.textContent += s + '\\n'; } });
    pyodide.setStderr({ batched: (s) => { const span = document.createElement('span'); span.className='err'; span.textContent = s + '\\n'; out.appendChild(span); } });
    await pyodide.loadPackagesFromImports(\`${escaped}\`);
    await pyodide.runPythonAsync(\`${escaped}\`);
    status.textContent = 'Done ✓';
  } catch (e) {
    status.textContent = 'Error';
    const span = document.createElement('span'); span.className='err'; span.textContent = String(e); out.appendChild(span);
  }
})();
<\/script>
</body></html>`;
  }

  // React/JSX/TSX → wrap with React 18 UMD + Babel Standalone from CDN.
  if (["jsx", "tsx", "react"].includes(l) || /^\s*(import\s+React|export\s+default|function\s+App|const\s+App\s*=)/m.test(code)) {
    // Strip ES module imports/exports (CDN globals are used instead).
    const cleaned = code
      .replace(/^\s*import[^;]+;?\s*$/gm, "")
      .replace(/^\s*export\s+default\s+/gm, "const __App = ")
      .replace(/^\s*export\s+/gm, "");
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"><\/script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
<script src="https://cdn.tailwindcss.com"><\/script>
<style>html,body,#root{margin:0;padding:0;min-height:100vh;background:#0a0a0a;color:#fff;font-family:system-ui,sans-serif}</style>
</head><body><div id="root"></div>
<script type="text/babel" data-presets="env,react,typescript">
try {
${cleaned}
const __root = ReactDOM.createRoot(document.getElementById('root'));
__root.render(React.createElement(typeof __App!=='undefined'?__App:(typeof App!=='undefined'?App:()=>React.createElement('div',{style:{padding:24}},'No default export found'))));
} catch(e){ document.getElementById('root').innerHTML='<pre style="color:#f88;padding:16px;white-space:pre-wrap">'+e.message+'</pre>'; }
<\/script>
</body></html>`;
  }

  // Plain JS
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://cdn.tailwindcss.com"><\/script>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;min-height:100vh;background:#0a0a0a;color:#fff;padding:16px}</style>
</head><body>
<div id="root"></div>
<script>try{${code}}catch(e){document.body.innerHTML='<pre style="color:#f88;padding:16px;white-space:pre-wrap">'+e.message+'</pre>'}<\/script>
</body></html>`;
};

const CodePreviewModal = ({ code, lang, onClose, files, initialPath }: CodePreviewModalProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(true);

  // Deduplicated file list — always includes the block the user clicked from.
  const projectFiles: ProjectFile[] = useMemo(() => {
    const list: ProjectFile[] = [];
    const seen = new Set<string>();
    for (const f of files || []) {
      if (seen.has(f.path)) continue;
      seen.add(f.path);
      list.push(f);
    }
    if (!list.length) list.push({ path: initialPath || `snippet.${lang || "txt"}`, lang, content: code });
    return list;
  }, [files, code, lang, initialPath]);

  const hasProject = projectFiles.length > 1;

  const [selectedPath, setSelectedPath] = useState<string>(
    initialPath && projectFiles.find((f) => f.path === initialPath)
      ? initialPath
      : projectFiles[0].path,
  );
  const [mode, setMode] = useState<"preview" | "code">("preview");
  const [copied, setCopied] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const selected = projectFiles.find((f) => f.path === selectedPath) || projectFiles[0];

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(selected.content);
      setCopied(true);
      toast.success("Code copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };

  const downloadHtml = () => {
    const blob = new Blob([previewHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `artifact-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("File downloaded");
  };

  const openInNewTab = () => {
    const blob = new Blob([previewHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const previewHtml = useMemo(() => {
    const combined = buildProjectPreviewHtml(projectFiles);
    if (combined) return combined;
    if (isReactProject(projectFiles)) return buildReactRuntimeHtml(projectFiles);
    return wrapCodeForPreview(selected.lang || lang, selected.content);
  }, [projectFiles, selected, lang]);

  useEffect(() => {
    if (iframeRef.current && mode === "preview") {
      const blob = new Blob([previewHtml], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      iframeRef.current.src = url;
      return () => URL.revokeObjectURL(url);
    }
  }, [previewHtml, mode, refreshKey]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-secondary/30 shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex items-center gap-1 rounded-lg bg-muted/40 p-0.5">
          <button
            onClick={() => setMode("preview")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors ${
              mode === "preview" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            <Eye className="w-3.5 h-3.5" /> Preview
          </button>
          <button
            onClick={() => setMode("code")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors ${
              mode === "code" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            <Code2 className="w-3.5 h-3.5" /> Code
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={copyCode}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            title="Copy code"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
          {mode === "preview" && (
            <>
              <button
                onClick={() => setRefreshKey((k) => k + 1)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                title="Refresh preview"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={openInNewTab}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                title="Open in new tab"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
              <button
                onClick={downloadHtml}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                title="Download HTML"
              >
                <Download className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0" dir="ltr">
        {hasProject && (
          <aside className="w-56 shrink-0 border-r border-border/40 bg-muted/20 overflow-y-auto">
            <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
              Project files
            </div>
            <ul className="py-1">
              {projectFiles.map((f) => (
                <li key={f.path}>
                  <button
                    onClick={() => {
                      setSelectedPath(f.path);
                      setMode("code");
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono transition-colors ${
                      selectedPath === f.path
                        ? "bg-primary/10 text-foreground"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    }`}
                  >
                    <FileCode2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{f.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}

        <div className="flex-1 min-w-0 flex flex-col">
          {mode === "preview" ? (
            <iframe
              ref={iframeRef}
              className="flex-1 w-full bg-background"
              sandbox="allow-scripts allow-same-origin"
              title="Code preview"
            />
          ) : (
            <pre className="flex-1 overflow-auto p-4 text-[12.5px] leading-relaxed font-mono bg-[#0b0d10] text-foreground whitespace-pre">
              <code>{selected.content}</code>
            </pre>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default CodePreviewModal;
