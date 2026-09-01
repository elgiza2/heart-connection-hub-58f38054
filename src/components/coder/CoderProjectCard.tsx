/** @doc Compact card that renders a saved Megsy Coder project in the chat history — replaces raw fenced markdown. */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { FileCode, Eye, Pencil, ExternalLink, Github, Download, Sparkles, Undo2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { ProjectFile } from "@/lib/extractProjectFiles";
import { downloadProjectZip, pushProjectToGithub } from "@/lib/coderExport";
import { saveCheckpoint, undoCheckpoint, listCheckpoints } from "@/lib/coderCheckpoints";

const CoderStudioModal = lazy(() => import("@/components/coder/CoderStudioModal"));
const ArtifactCanvas = lazy(() => import("@/components/chat/ArtifactCanvas"));

interface Props {
  files: ProjectFile[];
  summary?: string;
  /** Stable identifier for checkpoint history — defaults to derived hash. */
  projectId?: string;
}

/** Remembers the published site id per project so re-publishing updates the
 *  same URL instead of minting a new one, and the link survives a reload. */
const siteKey = (pid: string) => `megsy:coder-site:${pid}`;
const readSiteId = (pid: string): string | null => {
  try { return window.localStorage.getItem(siteKey(pid)); } catch { return null; }
};
/** Remembers the Anything.com project so re-deploys iterate instead of duplicating. */
const anythingKey = (pid: string) => `megsy:coder-anything:${pid}`;


export default function CoderProjectCard({ files: initialFiles, summary, projectId }: Props) {
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(null);

  const pid = useMemo(
    () => projectId || `pc:${initialFiles.length}:${initialFiles[0]?.path || ""}:${(summary || "").slice(0, 40)}`,
    [projectId, initialFiles, summary],
  );
  // Restore the newest saved version so Studio edits survive a page refresh or
  // the message scrolling out of the virtualized list.
  const [files, setFiles] = useState<ProjectFile[]>(() => {
    const saved = listCheckpoints(pid);
    return saved.length > 0 ? saved[saved.length - 1].files : initialFiles;
  });
  const [canUndo, setCanUndo] = useState(() => listCheckpoints(pid).length > 1);
  const hydrated = useRef(false);
  useEffect(() => {
    setPublishedId(readSiteId(pid));
    // Skip the first pass: snapshotting on mount used to push a duplicate
    // checkpoint and swallow the user's first undo.
    if (!hydrated.current) { hydrated.current = true; return; }
    saveCheckpoint(pid, files, "edit");
    setCanUndo(listCheckpoints(pid).length > 1);
  }, [pid, files]);

  const fileNames = useMemo(() => files.slice(0, 6).map((f) => f.path), [files]);
  const remaining = Math.max(0, files.length - fileNames.length);

  const handleUndo = () => {
    const prev = undoCheckpoint(pid);
    if (!prev) { toast.info("No previous version"); return; }
    setFiles(prev.files);
    toast.success("Reverted to previous version");
  };

  const handlePublish = async () => {
    if (files.length === 0) return;
    setPublishing(true);
    try {
      const { publishProject } = await import("@/lib/publishProject");
      const title = summary?.split("\n")[0]?.slice(0, 80) || "Megsy Project";
      const { url, id, degraded } = await publishProject(files, { title, siteId: publishedId ?? undefined });
      setPublishedId(id);
      try { window.localStorage.setItem(siteKey(pid), id); } catch { /* private mode */ }
      try {
        await navigator.clipboard.writeText(url);
        toast.success(degraded ? "Published as source view — link copied" : "Published — link copied", { description: degraded ? `${url} · this project can\u2019t run standalone, so the page shows its source files.` : url });
      } catch {
        toast.success("Published", { description: url });
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Publish failed";
      if (/sign in/i.test(msg)) {
        toast.error("Sign in to publish", {
          description: "Publishing saves your project so anyone with the link can view it.",
          action: { label: "Sign in", onClick: () => { window.location.href = "/auth"; } },
        });
      } else {
        toast.error(msg);
      }
    } finally {
      setPublishing(false);
    }
  };

  /** Hand the project to Anything.com for a real full-stack build + hosting. */
  const handleDeployFullStack = async () => {
    if (files.length === 0) return;
    setDeploying(true);
    const toastId = toast.loading("Sending project to Anything.com…");
    try {
      const { deployCoderProjectToAnything } = await import("@/lib/anything/coderBridge");
      const existing = (() => { try { return window.localStorage.getItem(anythingKey(pid)); } catch { return null; } })();
      const res = await deployCoderProjectToAnything(files, {
        title: summary?.split("\n")[0]?.slice(0, 60) || "Megsy project",
        summary,
        projectId: existing ?? undefined,
        publish: true,
        onProgress: (stage) => toast.loading(`Anything.com: ${stage}…`, { id: toastId }),
      });
      try { window.localStorage.setItem(anythingKey(pid), res.projectId); } catch { /* private mode */ }
      if (res.buildErrors) {
        toast.error("Anything.com build failed", { id: toastId, description: res.buildErrors.slice(0, 200) });
      } else if (res.url) {
        toast.success(res.published ? "Deployed & published" : "Deployed", { id: toastId, description: res.url });
        window.open(res.url, "_blank", "noopener,noreferrer");
      } else {
        toast.message("Build started on Anything.com", { id: toastId, description: "It is still building — check back shortly." });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Deploy failed", { id: toastId });
    } finally {
      setDeploying(false);
    }
  };




  return (
    <div className="my-3 w-full">
      <div className="flex items-center gap-2 pb-1">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-foreground/55" />
        <div className="truncate text-[13px] text-foreground/70">
          Project · {files.length} files
        </div>
      </div>

      {fileNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pb-2">
          {fileNames.map((p) => (
            <span
              key={p}
              className="inline-flex items-center gap-1 rounded-md border border-foreground/10 bg-foreground/[0.04] px-2 py-1 text-[11px] font-mono text-foreground/70"
            >
              <FileCode className="h-3 w-3 text-foreground/65" />
              {p}
            </span>
          ))}
          {remaining > 0 && (
            <span className="text-[11px] text-foreground/65 self-center">+{remaining} more</span>
          )}
        </div>
      )}


      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setCanvasOpen(true)} className="h-8 text-xs">
          <Eye className="h-3.5 w-3.5 mr-1" /> Preview
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setStudioOpen(true)} className="h-8 text-xs">
          <Pencil className="h-3.5 w-3.5 mr-1" /> Open Studio
        </Button>
        <Button size="sm" variant="ghost" onClick={handlePublish} disabled={publishing} className="h-8 text-xs text-foreground/80">
          <ExternalLink className="h-3.5 w-3.5 mr-1" />
          {publishing ? "Publishing…" : "Publish"}
        </Button>
        <Button size="sm" variant="ghost" onClick={handleDeployFullStack} disabled={deploying} className="h-8 text-xs text-foreground/80">
          <Rocket className="h-3.5 w-3.5 mr-1" />
          {deploying ? "Deploying…" : "Deploy full-stack"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => downloadProjectZip(files)}
          className="h-8 text-xs text-foreground/80"
        >
          <Download className="h-3.5 w-3.5 mr-1" /> Download ZIP
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => pushProjectToGithub(files, (summary?.split("\n")[0] || "megsy-project").slice(0, 40))}
          className="h-8 text-xs text-foreground/80"
        >
          <Github className="h-3.5 w-3.5 mr-1" /> Push to GitHub
        </Button>
        {canUndo && (
          <Button size="sm" variant="ghost" onClick={handleUndo} className="h-8 text-xs text-foreground/80">
            <Undo2 className="h-3.5 w-3.5 mr-1" /> Undo
          </Button>
        )}

      </div>

      <Suspense fallback={null}>
        {canvasOpen && (
          <ArtifactCanvas open={canvasOpen} onOpenChange={setCanvasOpen} content={summary || ""} files={files} />
        )}
        {studioOpen && (
          <CoderStudioModal
            open={studioOpen}
            onClose={() => setStudioOpen(false)}
            initialFiles={files}
            onFilesChange={setFiles}
          />
        )}
      </Suspense>
    </div>
  );
}
