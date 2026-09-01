/** @doc Full-stack Coder Studio — Monaco file editor, terminal, Python (Pyodide), and GitHub/Supabase integrations, all inside the chat page. */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X, FileCode2, Terminal as TerminalIcon, Play, Plug, Github,
  Plus, Trash2, Save, FolderTree, Loader2, Check, SkipForward, Eye, RefreshCw,
  Pencil,
} from "lucide-react";
import type { ProjectFile } from "@/lib/extractProjectFiles";
import ConnectorsDialog from "@/components/integrations/ConnectorsDialog";
import { toast } from "sonner";
import { buildProjectPreviewHtml } from "@/lib/extractProjectFiles";
import { buildReactRuntimeHtml, isReactProject } from "@/lib/buildReactRuntime";
import { useRuntimeErrors } from "@/hooks/useRuntimeErrors";
import { withRuntimeShim } from "@/lib/publishProject";


const MonacoEditor = lazy(() => import("@monaco-editor/react").then((m) => ({ default: m.default })));

const MONACO_LANG: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
  json: "json", html: "html", css: "css", scss: "scss", md: "markdown",
  py: "python", sh: "shell", yml: "yaml", yaml: "yaml", sql: "sql", xml: "xml", svg: "xml",
};
const monacoLangFor = (path: string) => MONACO_LANG[(path.split(".").pop() || "").toLowerCase()] || "plaintext";

type Tab = "files" | "preview" | "terminal" | "python" | "integrations";

interface Props {
  open: boolean;
  onClose: () => void;
  initialFiles: ProjectFile[];
  filesOnly?: boolean;
  /** Called whenever the in-studio file set changes so callers persist edits. */
  onFilesChange?: (files: ProjectFile[]) => void;
}

interface HistoryLine {
  kind: "in" | "out" | "err" | "sys";
  text: string;
}

// Minimal in-browser POSIX-ish command runner over the virtual project files.
function useVirtualFS(initial: ProjectFile[]) {
  const [files, setFiles] = useState<ProjectFile[]>(initial);
  const [cwd, setCwd] = useState<string>("/");

  useEffect(() => { setFiles(initial); }, [initial]);

  const normalize = useCallback((p: string) => {
    if (!p.startsWith("/")) p = (cwd === "/" ? "" : cwd) + "/" + p;
    const parts: string[] = [];
    for (const seg of p.split("/")) {
      if (!seg || seg === ".") continue;
      if (seg === "..") parts.pop();
      else parts.push(seg);
    }
    return "/" + parts.join("/");
  }, [cwd]);

  const rel = (p: string) => p.replace(/^\/+/, "");

  const listDir = useCallback((dir: string) => {
    const prefix = dir === "/" ? "" : rel(dir) + "/";
    const set = new Set<string>();
    for (const f of files) {
      if (!f.path.startsWith(prefix)) continue;
      const rest = f.path.slice(prefix.length);
      if (!rest) continue;
      const first = rest.split("/")[0];
      set.add(rest.includes("/") ? first + "/" : first);
    }
    return Array.from(set).sort();
  }, [files]);

  const readFile = useCallback((p: string) => {
    const path = rel(normalize(p));
    return files.find((f) => f.path === path)?.content ?? null;
  }, [files, normalize]);

  const writeFile = useCallback((p: string, content: string) => {
    const path = rel(normalize(p));
    setFiles((prev) => {
      const idx = prev.findIndex((f) => f.path === path);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], content };
        return copy;
      }
      const ext = (path.split(".").pop() || "txt").toLowerCase();
      return [...prev, { path, content, lang: ext }];
    });
  }, [normalize]);

  const removeFile = useCallback((p: string) => {
    const path = rel(normalize(p));
    setFiles((prev) => prev.filter((f) => f.path !== path && !f.path.startsWith(path + "/")));
  }, [normalize]);

  return { files, setFiles, cwd, setCwd, normalize, rel, listDir, readFile, writeFile, removeFile };
}

// Pyodide loader (cached across mounts).
let pyodidePromise: Promise<any> | null = null;
function loadPyodide(): Promise<any> {
  if (pyodidePromise) return pyodidePromise;
  pyodidePromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-pyodide]");
    const start = () => {
      // @ts-ignore
      (window as any).loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/",
      }).then(resolve).catch(reject);
    };
    if (existing && (window as any).loadPyodide) return start();
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
    s.dataset.pyodide = "1";
    s.onload = start;
    s.onerror = () => reject(new Error("Failed to load Pyodide"));
    document.head.appendChild(s);
  });
  return pyodidePromise;
}

const CoderStudioModal = ({ open, onClose, initialFiles, filesOnly, onFilesChange }: Props) => {
  const [tab, setTab] = useState<Tab>("files");
  const fs = useVirtualFS(initialFiles);
  const [selected, setSelected] = useState<string>(initialFiles[0]?.path || "");
  const [buffer, setBuffer] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [history, setHistory] = useState<HistoryLine[]>([
    { kind: "sys", text: "Megsy Coder Studio — terminal ready. Type `help` to list commands." },
  ]);
  const [cmd, setCmd] = useState("");
  const [pyReady, setPyReady] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const pyRef = useRef<any>(null);
  const [pyCode, setPyCode] = useState<string>("# Real Python 3 in your browser (Pyodide)\nimport sys\nprint('Python', sys.version.split()[0])\nprint(sum(range(100)))\n");
  const [pyOut, setPyOut] = useState<string>("");
  const [pyRunning, setPyRunning] = useState(false);
  const [connectorsOpen, setConnectorsOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const previewHtml = useMemo(() => {
    if (tab !== "preview" || fs.files.length === 0) return "";
    try {
      const html =
        buildProjectPreviewHtml(fs.files) ||
        (isReactProject(fs.files) ? buildReactRuntimeHtml(fs.files, "Preview") : "") ||
        "";
      // The preview iframe runs without `allow-same-origin`, so storage APIs
      // throw unless the same shim used by published sites is injected.
      return html ? withRuntimeShim(html) : "";
    } catch {
      return "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, fs.files, previewKey]);

  const termRef = useRef<HTMLDivElement>(null);
  const saveFileRef = useRef<(() => void) | null>(null);
  const { logs: runtimeLogs, clear: clearRuntimeLogs } = useRuntimeErrors(tab === "preview");



  useEffect(() => {
    if (!selected && fs.files[0]) setSelected(fs.files[0].path);
  }, [fs.files, selected]);

  // Load the editor buffer when the *selection* changes. Depending on
  // `fs.files` here wiped unsaved typing every time any file changed (terminal
  // commands, asset injection, autosave), so only react to the path.
  const loadedPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (loadedPathRef.current === selected) return;
    loadedPathRef.current = selected;
    const f = fs.files.find((x) => x.path === selected);
    setBuffer(f?.content ?? "");
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Esc closes the studio, but never silently discards unsaved edits.
  const requestClose = useCallback(() => {
    if (dirty && !window.confirm("You have unsaved changes. Close anyway?")) return;
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveFileRef.current?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, requestClose]);


  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [history]);

  // Bubble edits back to the caller so Publish/Download see the latest files.
  const lastEmittedRef = useRef<string>("");
  useEffect(() => {
    if (!onFilesChange) return;
    const key = JSON.stringify(fs.files.map((f) => [f.path, f.content]));
    if (key === lastEmittedRef.current) return;
    lastEmittedRef.current = key;
    onFilesChange(fs.files);
  }, [fs.files, onFilesChange]);

  const ensurePython = useCallback(async () => {
    if (pyRef.current) return pyRef.current;
    setPyReady("loading");
    try {
      const py = await loadPyodide();
      pyRef.current = py;
      setPyReady("ready");
      return py;
    } catch (e) {
      setPyReady("error");
      throw e;
    }
  }, []);

  const runPython = useCallback(async () => {
    setPyRunning(true);
    setPyOut("");
    try {
      const py = await ensurePython();
      let out = "";
      py.setStdout({ batched: (s: string) => { out += s + "\n"; } });
      py.setStderr({ batched: (s: string) => { out += s + "\n"; } });
      const result = await py.runPythonAsync(pyCode);
      if (result !== undefined && result !== null) out += String(result) + "\n";
      setPyOut(out || "(no output)");
    } catch (e: any) {
      setPyOut(String(e?.message || e));
    } finally {
      setPyRunning(false);
    }
  }, [pyCode, ensurePython]);

  const appendHistory = (lines: HistoryLine[]) => setHistory((h) => [...h, ...lines]);

  const runCommand = useCallback(async (raw: string) => {
    const line = raw.trim();
    appendHistory([{ kind: "in", text: `${fs.cwd} $ ${line}` }]);
    if (!line) return;
    const [cmdName, ...args] = line.split(/\s+/);
    const argStr = line.slice(cmdName.length).trim();
    const out = (t: string) => appendHistory([{ kind: "out", text: t }]);
    const err = (t: string) => appendHistory([{ kind: "err", text: t }]);

    try {
      switch (cmdName) {
        case "help":
          out([
            "Commands:",
            "  ls [dir]              list files",
            "  cd <dir>              change dir",
            "  pwd                   print dir",
            "  cat <file>            show file",
            "  echo <text>           print text",
            "  write <file> <text>   create/overwrite file (one-liner)",
            "  mkdir <dir>           create folder (implicit via write)",
            "  rm <file>             remove file",
            "  tree                  list all files",
            "  node <expr>           evaluate JS expression",
            "  python <expr>         evaluate Python (Pyodide)",
            "  py-run                run current Python editor code",
            "  npm/git/vite/…        simulated (project runs via preview)",
            "  clear                 clear terminal",
          ].join("\n"));
          break;
        case "clear":
          setHistory([]);
          break;
        case "pwd":
          out(fs.cwd);
          break;
        case "ls": {
          const target = args[0] ? fs.normalize(args[0]) : fs.cwd;
          out(fs.listDir(target).join("  ") || "(empty)");
          break;
        }
        case "cd": {
          const target = args[0] ? fs.normalize(args[0]) : "/";
          fs.setCwd(target || "/");
          break;
        }
        case "cat": {
          if (!args[0]) return err("cat: missing file");
          const content = fs.readFile(args[0]);
          if (content == null) return err(`cat: ${args[0]}: not found`);
          out(content);
          break;
        }
        case "echo":
          out(argStr);
          break;
        case "write": {
          const m = argStr.match(/^(\S+)\s+([\s\S]*)$/);
          if (!m) return err("write: usage: write <file> <text>");
          fs.writeFile(m[1], m[2]);
          out(`wrote ${m[1]}`);
          break;
        }
        case "mkdir":
          if (!args[0]) return err("mkdir: missing name");
          fs.writeFile(args[0] + "/.gitkeep", "");
          out(`created ${args[0]}/`);
          break;
        case "rm":
          if (!args[0]) return err("rm: missing file");
          fs.removeFile(args[0]);
          out(`removed ${args[0]}`);
          break;
        case "tree":
          out(fs.files.map((f) => "  " + f.path).join("\n") || "(no files)");
          break;
        case "node": {
          // Never evaluate arbitrary JavaScript in the application origin: it
          // would give generated code access to the signed-in user's session.
          err("node: JavaScript execution is disabled in the browser sandbox");
          break;
        }
        case "python":
        case "py": {
          const py = await ensurePython();
          let acc = "";
          py.setStdout({ batched: (s: string) => { acc += s + "\n"; } });
          py.setStderr({ batched: (s: string) => { acc += s + "\n"; } });
          const r = await py.runPythonAsync(argStr);
          if (r !== undefined && r !== null) acc += String(r) + "\n";
          out(acc.trim() || "(ok)");
          break;
        }
        case "py-run": {
          const py = await ensurePython();
          let acc = "";
          py.setStdout({ batched: (s: string) => { acc += s + "\n"; } });
          py.setStderr({ batched: (s: string) => { acc += s + "\n"; } });
          const r = await py.runPythonAsync(pyCode);
          if (r !== undefined && r !== null) acc += String(r) + "\n";
          out(acc.trim() || "(ok)");
          break;
        }
        case "npm":
        case "bun":
        case "pnpm":
        case "yarn":
          out(`${cmdName} ${argStr}\n→ dependencies pre-bundled in preview runtime (esm.sh). No install needed.`);
          break;
        case "vite":
        case "dev":
        case "start":
          out("→ Open the preview tab: your project runs live in-browser via the built-in React runtime.");
          break;
        case "git":
          out("→ Use the Integrations tab to push to GitHub with one click.");
          break;
        default:
          err(`command not found: ${cmdName} (try \`help\`)`);
      }
    } catch (e: any) {
      err(String(e?.message || e));
    }
  }, [fs, pyCode, ensurePython]);

  const saveFile = () => {
    if (!selected) return;
    fs.writeFile(selected, buffer);
    setDirty(false);
    toast.success("Saved");
  };
  saveFileRef.current = saveFile;


  const newFile = () => {
    const name = window.prompt("New file name (e.g. src/utils/helpers.ts)")?.trim();
    if (!name) return;
    fs.writeFile(name, "");
    setSelected(name);
  };

  /** Rename in place. Without it users had to delete + recreate, which lost
   *  the file's edit history and broke imports silently. */
  const renameCurrent = () => {
    if (!selected) return;
    const next = window.prompt("Rename file", selected)?.trim();
    if (!next || next === selected) return;
    if (fs.files.some((f) => f.path === next)) {
      toast.error("A file with that name already exists");
      return;
    }
    const content = fs.files.find((f) => f.path === selected)?.content ?? buffer;
    fs.writeFile(next, content);
    fs.removeFile(selected);
    setSelected(next);
    toast.success(`Renamed to ${next}`);
  };

  const deleteCurrent = () => {
    if (!selected) return;
    if (!window.confirm(`Delete ${selected}?`)) return;
    fs.removeFile(selected);
    setSelected(fs.files.find((f) => f.path !== selected)?.path || "");
  };

  const modal = useMemo(() => (
    <div className="theme-fixed coder-fixed fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="w-full h-full sm:w-[min(1200px,96vw)] sm:h-[min(820px,92vh)] bg-background border border-foreground/10 rounded-none sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-3 sm:px-4 h-12 border-b border-foreground/10 bg-background/40">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <div className="w-2 h-2 rounded-full bg-yellow-500" />
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="ml-2 text-[13px] font-semibold text-foreground truncate">Megsy Coder Studio</span>
          </div>
          <button aria-label="Close studio" onClick={requestClose} className="p-1.5 rounded-lg hover:bg-foreground/10 text-foreground/70 hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs (hidden in filesOnly mode) */}
        {!filesOnly && (
          <div className="flex items-center gap-1 px-2 sm:px-3 h-11 border-b border-foreground/10 bg-background/20 overflow-x-auto">
            {([
              { id: "files", label: "Files", icon: FolderTree },
              { id: "preview", label: "Preview", icon: Eye },
              { id: "terminal", label: "Terminal", icon: TerminalIcon },
              { id: "python", label: "Python", icon: FileCode2 },
              { id: "integrations", label: "Integrations", icon: Plug },
            ] as { id: Tab; label: string; icon: any }[]).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12.5px] font-medium whitespace-nowrap transition-colors ${
                  tab === t.id ? "bg-foreground text-background" : "text-foreground/70 hover:bg-foreground/10"
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {tab === "preview" && (
            <div className="h-full flex flex-col bg-background">
              <div className="flex items-center justify-between px-3 h-9 border-b border-foreground/10">
                <span className="text-[12px] text-foreground/60">Live preview — reflects saved files</span>
                <button
                  onClick={() => { clearRuntimeLogs(); setPreviewKey((k) => k + 1); }}
                  className="inline-flex items-center gap-1.5 px-2 h-7 rounded-md text-[12px] text-foreground/70 hover:bg-foreground/10"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
              </div>
              {previewHtml ? (
                <iframe
                  key={previewKey}
                  title="Project preview"
                  srcDoc={previewHtml}
                  sandbox="allow-scripts allow-forms allow-popups allow-modals"
                  className="flex-1 w-full bg-white"
                />
              ) : (
                <div className="flex-1 grid place-items-center text-[12.5px] text-foreground/50 p-6 text-center">
                  No runnable entry found yet. Add an index.html or a React entry file.
                </div>
              )}
              {runtimeLogs.length > 0 && (
                <div className="shrink-0 max-h-40 overflow-auto border-t border-red-500/30 bg-red-950/30">
                  <div className="flex items-center justify-between px-3 h-8 sticky top-0 bg-red-950/60 backdrop-blur">
                    <span className="text-[11.5px] font-medium text-red-200">
                      {runtimeLogs.length} runtime issue{runtimeLogs.length > 1 ? "s" : ""}
                    </span>
                    <button
                      onClick={clearRuntimeLogs}
                      className="text-[11.5px] text-red-200/70 hover:text-red-100 px-2 h-6 rounded-md hover:bg-foreground/10"
                    >
                      Clear
                    </button>
                  </div>
                  <ul className="px-3 py-2 space-y-1">
                    {runtimeLogs.map((l) => (
                      <li key={l.id} className="text-[11.5px] font-mono leading-relaxed text-red-100/90 break-words">
                        <span className="opacity-60 uppercase mr-1.5">{l.level}</span>
                        {l.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            </div>
          )}
          {tab === "files" && (
            <div className="h-full flex">
              <aside className="w-56 sm:w-64 shrink-0 border-l border-foreground/10 bg-background/30 flex flex-col">
                <div className="flex items-center justify-between px-3 h-9 border-b border-foreground/10">
                  <span className="text-[11px] uppercase tracking-wider text-foreground/50">Files</span>
                  <div className="flex items-center gap-1">
                    <button onClick={newFile} className="p-1 rounded hover:bg-foreground/10 text-foreground/70" title="New">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={renameCurrent} className="p-1 rounded hover:bg-foreground/10 text-foreground/70" title="Rename">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={deleteCurrent} className="p-1 rounded hover:bg-foreground/10 text-foreground/70" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto py-1 text-[12.5px]">
                  {fs.files.map((f) => (
                    <button
                      key={f.path}
                      onClick={() => setSelected(f.path)}
                      className={`w-full text-right px-3 py-1.5 truncate ${
                        selected === f.path ? "bg-foreground/10 text-foreground" : "text-foreground/70 hover:bg-foreground/5"
                      }`}
                      dir="ltr"
                    >
                      {f.path}
                    </button>
                  ))}
                  {!fs.files.length && (
                    <div className="px-3 py-4 text-[12px] text-foreground/65">No files</div>
                  )}
                </div>
              </aside>
              <section className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center justify-between px-3 h-9 border-b border-foreground/10">
                  <span className="text-[12px] text-foreground/60 truncate" dir="ltr">{selected || "—"}</span>
                  <button
                    onClick={saveFile}
                    disabled={!dirty}
                    className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11.5px] font-medium bg-foreground text-background disabled:opacity-40"
                  >
                    <Save className="w-3.5 h-3.5" /> Save
                  </button>
                </div>
                <div className="flex-1 min-h-0">
                  {selected ? (
                    <Suspense fallback={<div className="p-3 text-xs text-foreground/50">Loading editor…</div>}>
                      <MonacoEditor
                        height="100%"
                        theme="vs-dark"
                        language={monacoLangFor(selected)}
                        value={buffer}
                        onChange={(v) => { setBuffer(v ?? ""); setDirty(true); }}
                        options={{
                          fontSize: 13,
                          minimap: { enabled: false },
                          scrollBeyondLastLine: false,
                          tabSize: 2,
                          wordWrap: "on",
                          automaticLayout: true,
                          smoothScrolling: true,
                        }}
                      />
                    </Suspense>
                  ) : (
                    <div className="p-4 text-xs text-foreground/50">Choose a file to start editing…</div>
                  )}
                </div>
              </section>
            </div>
          )}

          {tab === "terminal" && (
            <div className="h-full flex flex-col bg-background">
              <div ref={termRef} className="flex-1 overflow-y-auto p-3 font-mono text-[12.5px] leading-relaxed" dir="ltr">
                {history.map((h, i) => (
                  <div
                    key={i}
                    className={
                      h.kind === "in" ? "text-emerald-400" :
                      h.kind === "err" ? "text-red-400" :
                      h.kind === "sys" ? "text-foreground/65" : "text-foreground/85"
                    }
                    style={{ whiteSpace: "pre-wrap" }}
                  >
                    {h.text}
                  </div>
                ))}
              </div>
              <form
                onSubmit={(e) => { e.preventDefault(); const c = cmd; setCmd(""); void runCommand(c); }}
                className="flex items-center gap-2 border-t border-foreground/10 px-3 h-11 bg-background"
                dir="ltr"
              >
                <span className="text-emerald-400 font-mono text-[12.5px]">{fs.cwd} $</span>
                <input
                  value={cmd}
                  onChange={(e) => setCmd(e.target.value)}
                  autoFocus
                  spellCheck={false}
                  className="flex-1 bg-transparent outline-none text-foreground/90 font-mono text-[12.5px]"
                  placeholder="Type a command… (help)"
                />
              </form>
            </div>
          )}

          {tab === "python" && (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between px-3 h-10 border-b border-foreground/10 bg-background/40">
                <div className="flex items-center gap-2 text-[12px] text-foreground/70">
                  <FileCode2 className="w-3.5 h-3.5" />
                  Python 3 (Pyodide) — runs in the browser
                  {pyReady === "loading" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {pyReady === "ready" && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                </div>
                <button
                  onClick={runPython}
                  disabled={pyRunning}
                  className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[12px] font-semibold bg-emerald-500 text-background disabled:opacity-50"
                >
                  {pyRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" fill="currentColor" />}
                  Run
                </button>
              </div>
              <div className="flex-1 grid grid-rows-2 min-h-0">
                <textarea
                  value={pyCode}
                  onChange={(e) => setPyCode(e.target.value)}
                  spellCheck={false}
                  dir="ltr"
                  className="w-full h-full bg-background text-foreground/90 font-mono text-[12.5px] leading-relaxed p-3 outline-none resize-none border-b border-foreground/10"
                />
                <pre
                  dir="ltr"
                  className="w-full h-full overflow-auto bg-background/60 text-foreground/80 font-mono text-[12px] leading-relaxed p-3 whitespace-pre-wrap"
                >{pyOut || "// Press Run to see results"}</pre>
              </div>
            </div>
          )}

          {tab === "integrations" && (
            <div className="h-full overflow-y-auto p-6">
              <div className="max-w-2xl mx-auto space-y-4">
                <h3 className="text-foreground text-lg font-bold">Connect external tools</h3>
                <p className="text-foreground/60 text-[13px]">
                  Connect GitHub to push code, or Supabase to run the database — or skip and start right away.
                  The AI can also skip the integration automatically if not needed for this project.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={() => setConnectorsOpen(true)}
                    className="flex items-center gap-3 p-4 rounded-2xl border border-foreground/15 bg-foreground/5 hover:bg-foreground/10 text-right transition"
                  >
                    <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-foreground text-background">
                      <Github className="w-5 h-5" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-foreground text-[14px] font-semibold">Connect GitHub</span>
                      <span className="block text-foreground/60 text-[12px]">Push code and manage repos</span>
                    </span>
                  </button>
                  <button
                    onClick={() => setConnectorsOpen(true)}
                    className="flex items-center gap-3 p-4 rounded-2xl border border-foreground/15 bg-foreground/5 hover:bg-foreground/10 text-right transition"
                  >
                    <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500 text-background font-black">
                      S
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-foreground text-[14px] font-semibold">Connect Supabase</span>
                      <span className="block text-foreground/60 text-[12px]">Database, auth, and storage</span>
                    </span>
                  </button>
                </div>
                <button
                  onClick={() => { toast.success("Skipped — you can continue without connecting"); setTab("files"); }}
                  className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-2xl border border-foreground/15 bg-transparent hover:bg-foreground/5 text-foreground/80 text-[13px] font-medium"
                >
                  <SkipForward className="w-4 h-4" /> Skip and start now
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConnectorsDialog
        open={connectorsOpen}
        onOpenChange={setConnectorsOpen}
        onNavigateIntegrations={() => { window.location.href = "/integrations"; }}
      />
    </div>
  ), [tab, fs, selected, buffer, dirty, history, cmd, pyCode, pyOut, pyRunning, pyReady, connectorsOpen, runCommand, runPython, saveFile, newFile, renameCurrent, deleteCurrent, requestClose, previewHtml, previewKey, runtimeLogs, clearRuntimeLogs]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(modal, document.body);
};

export default CoderStudioModal;
