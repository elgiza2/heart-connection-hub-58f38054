/** @doc Multi-file diff viewer for Coder — compares baseline (previous run) vs current files using Monaco DiffEditor. */
import { lazy, Suspense, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, FileDiff, Plus, Minus, Edit3 } from "lucide-react";
import type { ProjectFile } from "@/lib/extractProjectFiles";

const DiffEditor = lazy(() =>
  import("@monaco-editor/react").then((m) => ({ default: m.DiffEditor })),
);

const LANG: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
  json: "json", html: "html", css: "css", scss: "scss", md: "markdown",
  py: "python", sh: "shell", yml: "yaml", yaml: "yaml", sql: "sql",
};
const langFor = (p: string) => LANG[(p.split(".").pop() || "").toLowerCase()] || "plaintext";

type FileChange = {
  path: string;
  kind: "added" | "removed" | "modified" | "unchanged";
  before: string;
  after: string;
};

function diffFiles(baseline: ProjectFile[], current: ProjectFile[]): FileChange[] {
  const baseMap = new Map(baseline.map((f) => [f.path, f.content]));
  const curMap = new Map(current.map((f) => [f.path, f.content]));
  const allPaths = new Set([...baseMap.keys(), ...curMap.keys()]);
  const out: FileChange[] = [];
  for (const path of allPaths) {
    const before = baseMap.get(path) ?? "";
    const after = curMap.get(path) ?? "";
    let kind: FileChange["kind"];
    if (!baseMap.has(path)) kind = "added";
    else if (!curMap.has(path)) kind = "removed";
    else if (before === after) kind = "unchanged";
    else kind = "modified";
    out.push({ path, kind, before, after });
  }
  // Modified/added/removed first, then unchanged; alphabetical within groups.
  const order: Record<FileChange["kind"], number> = { modified: 0, added: 1, removed: 2, unchanged: 3 };
  out.sort((a, b) => order[a.kind] - order[b.kind] || a.path.localeCompare(b.path));
  return out;
}

interface Props {
  open: boolean;
  onClose: () => void;
  baseline: ProjectFile[];
  current: ProjectFile[];
}

export default function CoderDiffModal({ open, onClose, baseline, current }: Props) {
  const changes = useMemo(() => diffFiles(baseline, current), [baseline, current]);
  const changed = useMemo(() => changes.filter((c) => c.kind !== "unchanged"), [changes]);
  const [selected, setSelected] = useState<string>(() => changed[0]?.path || changes[0]?.path || "");
  const active = changes.find((c) => c.path === selected) || changes[0];
  const counts = useMemo(() => ({
    added: changes.filter((c) => c.kind === "added").length,
    modified: changes.filter((c) => c.kind === "modified").length,
    removed: changes.filter((c) => c.kind === "removed").length,
  }), [changes]);

  if (!open || typeof document === "undefined") return null;

  const iconFor = (kind: FileChange["kind"]) =>
    kind === "added" ? <Plus className="w-3 h-3 text-emerald-400" /> :
    kind === "removed" ? <Minus className="w-3 h-3 text-red-400" /> :
    kind === "modified" ? <Edit3 className="w-3 h-3 text-amber-400" /> :
    <span className="w-3 h-3 rounded-full border border-foreground/20 inline-block" />;

  return createPortal(
    <div className="fixed inset-0 z-[110] bg-background/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="w-full h-full sm:w-[min(1200px,96vw)] sm:h-[min(820px,92vh)] bg-background border border-foreground/10 rounded-none sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 h-12 border-b border-foreground/10 bg-background/40">
          <div className="flex items-center gap-2 min-w-0">
            <FileDiff className="w-4 h-4 text-foreground/70" />
            <span className="text-[13px] font-semibold text-foreground">Diff Viewer</span>
            <span className="text-[11px] text-foreground/50 ml-2">
              <span className="text-emerald-400">+{counts.added}</span>{" "}
              <span className="text-amber-400">~{counts.modified}</span>{" "}
              <span className="text-red-400">−{counts.removed}</span>
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-foreground/10 text-foreground/70 hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex">
          <aside className="w-64 shrink-0 border-l border-foreground/10 bg-background/30 overflow-y-auto py-1 text-[12.5px]">
            {changes.length === 0 && (
              <div className="px-3 py-4 text-[12px] text-foreground/65">No files</div>
            )}
            {changes.map((c) => (
              <button
                key={c.path}
                onClick={() => setSelected(c.path)}
                className={`w-full text-right px-3 py-1.5 truncate flex items-center gap-2 ${
                  selected === c.path ? "bg-foreground/10 text-foreground" : "text-foreground/70 hover:bg-foreground/5"
                } ${c.kind === "unchanged" ? "opacity-50" : ""}`}
                dir="ltr"
              >
                {iconFor(c.kind)}
                <span className="truncate flex-1 text-left">{c.path}</span>
              </button>
            ))}
          </aside>
          <section className="flex-1 min-w-0 min-h-0">
            {active ? (
              <Suspense fallback={<div className="p-3 text-xs text-foreground/50">Loading diff…</div>}>
                <DiffEditor
                  height="100%"
                  theme="vs-dark"
                  language={langFor(active.path)}
                  original={active.before}
                  modified={active.after}
                  options={{
                    fontSize: 13,
                    renderSideBySide: true,
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    wordWrap: "on",
                  }}
                />
              </Suspense>
            ) : (
              <div className="p-4 text-xs text-foreground/50">Select a file</div>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
