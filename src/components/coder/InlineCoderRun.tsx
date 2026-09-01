/** @doc Megsy Coder inline run — renders todo/files/terminal/integration cards INSIDE the chat feed (not modal). */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Check, Loader2, FileCode, Terminal, ListTodo, X, Github, Database, Image as ImageIcon,
  ExternalLink, Eye, ChevronDown, Copy, Download, Pencil, GitCompare, Zap, PlayCircle, RefreshCw, Undo2,
} from "lucide-react";


import { runKimiCoder, type KimiEvent, type KimiFile, type KimiTodo } from "@/lib/kimiCoder";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { publishProject } from "@/lib/publishProject";
import { toast } from "sonner";
import { extractProjectFiles, ensureProjectScaffold, type ProjectFile } from "@/lib/extractProjectFiles";
import { extractPatchBlocks, applyPatchBlocks } from "@/lib/coderPatch";
import { downloadProjectZip, pushProjectToGithub, getCoderIntegrationStatus } from "@/lib/coderExport";
import { openInStackBlitz } from "@/lib/coderStackBlitz";
import { startIntegrationConnection, waitForConnectionRefresh, loadIntegrationConnections } from "@/lib/integrationBackend";
import { integrations as integrationsCatalog } from "@/lib/integrationsData";
import { autoFixProjectFiles } from "@/lib/coderAutoFix";
import { detectRequiredIntegrations } from "@/lib/coderIntegrationDetect";
import {
  findAssetRequests, generateAssets, applyAssetsToFiles, stripUnresolvedTokens,
  estimateAssetCredits, generateCoderImage, generateCoderVideo,
  IMAGE_CREDITS, VIDEO_CREDITS, MAX_ASSETS_PER_RUN, type CoderAsset,
} from "@/lib/coderAssets";
import { saveCheckpoint, undoCheckpoint, listCheckpoints } from "@/lib/coderCheckpoints";




const ArtifactCanvas = lazy(() => import("@/components/chat/ArtifactCanvas"));
const CoderStudioModal = lazy(() => import("@/components/coder/CoderStudioModal"));
const CoderDiffModal = lazy(() => import("@/components/coder/CoderDiffModal"));

type BashLog = { command: string; output: string; ok: boolean };
type IntegrationReq = { kind: "github" | "supabase"; reason: string; state: "pending" | "connected" | "skipped" };

interface Props {
  runId: string;
  prompt: string;
  onClose: () => void;
  onFinish?: (files: KimiFile[], summary?: string) => void;
  /** Files from previous Coder run in the same thread — sent as edit context. */
  previousFiles?: KimiFile[];
  /** Prior conversation turns for continuity. */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /** Hosted media the user attached to this turn — used inside the site. */
  attachments?: Array<{ url: string; name?: string; type?: string }>;
}


// Module-level cache so remounts of the parent don't re-fetch or abort the SSE run.
type RunEntry = {
  events: KimiEvent[];
  subs: Set<(ev: KimiEvent) => void>;
  finished: boolean;
  controller: AbortController;
};
const CODER_RUNS = new Map<string, RunEntry>();

function collectFilesFromEvents(events: KimiEvent[]): KimiFile[] {
  const merged = new Map<string, string>();
  const text = events
    .filter((ev): ev is Extract<KimiEvent, { type: "text" }> => ev.type === "text")
    .map((ev) => ev.text)
    .join("\n\n");
  for (const file of extractProjectFiles(text)) merged.set(file.path, file.content);
  for (const ev of events) {
    if (ev.type === "file") merged.set(ev.path, ev.content);
    if (ev.type === "done") for (const file of ev.files || []) merged.set(file.path, file.content);
  }
  return Array.from(merged.entries()).map(([path, content]) => ({ path, content }));
}

function subscribeCoderRun(
  runId: string,
  prompt: string,
  onEvent: (ev: KimiEvent) => void,
  opts?: {
    previousFiles?: KimiFile[];
    history?: Array<{ role: "user" | "assistant"; content: string }>;
    attachments?: Array<{ url: string; name?: string; type?: string }>;
  },

): () => void {
  let entry = CODER_RUNS.get(runId);
  if (!entry) {
    const controller = new AbortController();
    const nextEntry: RunEntry = { events: [], subs: new Set(), finished: false, controller };
    const emit = (ev: KimiEvent) => {
      nextEntry.events.push(ev);
      if (ev.type === "done" || ev.type === "error") nextEntry.finished = true;
      nextEntry.subs.forEach((s) => { try { s(ev); } catch { /* ignore */ } });
    };
    entry = nextEntry;
    CODER_RUNS.set(runId, nextEntry);
    runKimiCoder({
      prompt,
      history: opts?.history,
      contextFiles: opts?.previousFiles,
      attachments: opts?.attachments,
      signal: controller.signal,
      onEvent: emit,

    }).then(() => {
      if (nextEntry.finished || controller.signal.aborted) return;
      const files = collectFilesFromEvents(nextEntry.events);
      if (files.length > 0) {
        emit({ type: "done", files, summary: "Project generated." });
      } else {
        emit({ type: "error", error: "The connection ended before the project finished generating. Please try again." });
      }
    }).catch((e) => {
      const ev: KimiEvent = { type: "error", error: e?.message || "network error" };
      emit(ev);
    });
  }

  for (const ev of entry.events) { try { onEvent(ev); } catch { /* ignore */ } }
  entry.subs.add(onEvent);
  const activeEntry = entry;
  return () => { activeEntry.subs.delete(onEvent); };
}


function abortCoderRun(runId: string) {
  const entry = CODER_RUNS.get(runId);
  if (!entry) return;
  try { entry.controller.abort(); } catch { /* ignore */ }
  CODER_RUNS.delete(runId);
}

/** Signal for the run's fetch, so paid asset jobs stop when the user stops. */
function coderRunSignal(runId: string): AbortSignal | undefined {
  return CODER_RUNS.get(runId)?.controller.signal;
}


export default function InlineCoderRun({ runId, prompt, onClose, onFinish, previousFiles, history, attachments }: Props) {
  const instId = useRef(Math.random().toString(36).slice(2, 6)).current;
  const [todos, setTodos] = useState<KimiTodo[]>([]);
  const [files, setFiles] = useState<Map<string, string>>(new Map());
  const [bash, setBash] = useState<BashLog[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationReq[]>([]);
  const [status, setStatus] = useState<"running" | "done" | "error">("running");
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [assets, setAssets] = useState<CoderAsset[]>([]);
  const [assetPhase, setAssetPhase] = useState<"idle" | "running" | "done">("idle");
  const [tab, setTab] = useState<"plan" | "files" | "assets" | "logs" | "notes">("plan");

  // Collapsed by default: the build reads as a normal chat turn, and the
  // files/terminal detail is one tap away for anyone who wants it.
  const [collapsed, setCollapsed] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [connecting, setConnecting] = useState<"github" | "supabase" | null>(null);
  const checkpointId = `run:${runId}`;
  const finished = useRef(false);
  const filesRef = useRef<Map<string, string>>(new Map());
  const notesRef = useRef("");
  const integStatusRef = useRef<{ github: boolean; supabase: boolean }>({ github: false, supabase: false });

  

  


  const mergeProjectFiles = (projectFiles: ProjectFile[]) => {
    if (projectFiles.length === 0) return;
    setFiles((prev) => {
      const next = new Map(prev);
      for (const file of projectFiles) next.set(file.path, file.content);
      filesRef.current = next;
      return next;
    });
    setSelectedFile((cur) => cur ?? projectFiles[0]?.path ?? null);
  };

  /**
   * Finish a run: resolve every media placeholder into a real generated asset,
   * inject the hosted URLs into the project, then hand the final files back to
   * the chat. Without this step the model's images never make it into the site.
   */
  const assetsRef = useRef<CoderAsset[]>([]);
  const completeRun = async (scaffolded: ProjectFile[], summary?: string) => {
    // A "done" event carrying zero files is a failed build, not a finished one.
    // Marking it done showed users an empty "Done - 0 files" card with no reason.
    if (scaffolded.length === 0) {
      setStatus("error");
      setError("The build finished without producing any files. Please try again.");
      return;
    }
    addIntegrations(detectRequiredIntegrations(prompt, scaffolded));
    mergeProjectFiles(scaffolded);
    setStatus("done");

    let final = scaffolded;
    const allRequests = findAssetRequests(scaffolded, prompt.slice(0, 60));
    // Hard cap: a huge gallery prompt could otherwise queue dozens of paid
    // generations. Everything past the cap falls back to a neutral placeholder.
    const requests = allRequests.slice(0, MAX_ASSETS_PER_RUN);
    if (allRequests.length > requests.length) {
      toast.message(
        `Generating the first ${requests.length} of ${allRequests.length} media items to keep the cost predictable.`,
      );
    }
    if (requests.length > 0) {
      setAssetPhase("running");
      setTab("assets");
      const pending: CoderAsset[] = requests.map((r) => ({
        ...r,
        status: "pending",
        credits: r.kind === "video" ? VIDEO_CREDITS : IMAGE_CREDITS,
      }));
      assetsRef.current = pending;
      setAssets(pending);
      const done = await generateAssets(
        requests,
        (a) => {
          assetsRef.current = assetsRef.current.map((x) => (x.id === a.id ? a : x));
          setAssets(assetsRef.current);
        },
        coderRunSignal(runId),
      );
      final = stripUnresolvedTokens(applyAssetsToFiles(scaffolded, done));
      mergeProjectFiles(final);
      setAssetPhase("done");
      const ok = done.filter((a) => a.status === "done");
      if (ok.length > 0) {
        toast.success(`${ok.length} media asset${ok.length > 1 ? "s" : ""} added · ${estimateAssetCredits(ok)} credits`);
      }
      const failed = done.length - ok.length;
      if (failed > 0) toast.error(`${failed} asset${failed > 1 ? "s" : ""} failed — you can regenerate them`);
    } else {
      final = stripUnresolvedTokens(scaffolded);
      if (final !== scaffolded) mergeProjectFiles(final);
    }

    // Snapshot the finished project so manual Studio edits are always undoable.
    try {
      saveCheckpoint(checkpointId, final, "generated");
      setCanUndo(listCheckpoints(checkpointId).length > 1);
    } catch { /* storage full — undo is best-effort */ }

    onFinish?.(final.map(({ path, content }) => ({ path, content })), summary);
  };


  /** Regenerate a single asset and re-inject it across the project. */
  const regenerateAsset = async (id: string) => {
    const target = assetsRef.current.find((a) => a.id === id);
    if (!target) return;
    const update = (next: CoderAsset) => {
      assetsRef.current = assetsRef.current.map((x) => (x.id === id ? next : x));
      setAssets(assetsRef.current);
    };
    update({ ...target, status: "running", error: undefined });
    try {
      const url =
        target.kind === "video"
          ? await generateCoderVideo(target.prompt)
          : await generateCoderImage(target.prompt);
      const done: CoderAsset = { ...target, status: "done", url };
      update(done);
      const current = Array.from(filesRef.current.entries()).map(([path, content]) => ({
        path, content, lang: (path.split(".").pop() || "txt").toLowerCase(),
      }));
      // Swap the old URL (already injected) as well as the original token.
      const withOld: CoderAsset = { ...done, tokens: [...target.tokens, ...(target.url ? [target.url] : [])] };
      mergeProjectFiles(applyAssetsToFiles(current, [withOld]));
      toast.success(`Regenerated · ${done.credits} credits`);
    } catch (e) {
      update({ ...target, status: "error", error: e instanceof Error ? e.message : "failed" });
      toast.error("Regeneration failed");
    }
  };



  /** Merge backend-emitted and locally-detected integration needs (no duplicates). */
  const addIntegrations = (reqs: { kind: "github" | "supabase"; reason: string }[]) => {
    if (reqs.length === 0) return;
    setIntegrations((prev) => {
      const next = [...prev];
      for (const r of reqs) {
        if (next.some((p) => p.kind === r.kind)) continue;
        next.push({ ...r, state: integStatusRef.current[r.kind] ? "connected" : "pending" });
      }
      return next;
    });
    void getCoderIntegrationStatus().then((s) => {
      integStatusRef.current = { github: s.github, supabase: s.supabase };
      setIntegrations((prev) =>
        prev.map((p) => (s[p.kind] && p.state === "pending" ? { ...p, state: "connected" } : p)),
      );
    }).catch(() => {});
  };

  const appliedPatchesRef = useRef<Set<string>>(new Set());
  const applyPatchesFromNotes = (raw: string) => {
    const patches = extractPatchBlocks(raw);
    if (patches.length === 0) return;
    const fresh = patches.filter((p) => {
      const key = `${p.path}::${p.search.length}::${p.search.slice(0, 40)}`;
      if (appliedPatchesRef.current.has(key)) return false;
      appliedPatchesRef.current.add(key);
      return true;
    });
    if (fresh.length === 0) return;
    const current = Array.from(filesRef.current.entries()).map(([path, content]) => ({
      path, content, lang: (path.split(".").pop() || "txt").toLowerCase(),
    }));
    const { files: patched } = applyPatchBlocks(current, fresh);
    mergeProjectFiles(patched);
  };

  // Seed with the previous run's files so a follow-up turn edits the existing
  // project instead of shrinking it to whatever the model re-emitted.
  useEffect(() => {
    if (!previousFiles?.length) return;
    setFiles((prev) => {
      if (prev.size > 0) return prev;
      const next = new Map(prev);
      for (const f of previousFiles) next.set(f.path, f.content);
      filesRef.current = next;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  // Watchdog: if the stream goes silent after producing files (dropped SSE tail,
  // worker timeout), finalize instead of showing "Building…" forever.
  const lastEventRef = useRef(Date.now());
  const sawEventRef = useRef(false);
  const finalizeFromRef = (summary?: string) => {
    if (finished.current || filesRef.current.size === 0) return false;
    finished.current = true;
    const scaffolded = ensureProjectScaffold(
      autoFixProjectFiles(
        Array.from(filesRef.current.entries()).map(([path, content]) => ({
          path, content, lang: (path.split(".").pop() || "txt").toLowerCase(),
        })),
      ),
    );
    void completeRun(scaffolded, summary ?? notesRef.current.slice(0, 500));
    return true;

  };

  useEffect(() => {
    lastEventRef.current = Date.now();
    sawEventRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  useEffect(() => {
    if (status !== "running") return;
    const id = setInterval(() => {
      const idle = Date.now() - lastEventRef.current;
      // Never finalize a run that hasn't emitted anything yet — the model may
      // still be thinking. Only give up (with a clear error) after 3 minutes.
      if (!sawEventRef.current) {
        if (idle > 180_000 && !finished.current) {
          finished.current = true;
          setStatus("error");
          setError("The build didn't start — the connection timed out. Please try again.");
        }
        return;
      }
      if (idle > 45_000) {
        if (finalizeFromRef()) return;
        // Stream went silent without producing a single file: stop pretending
        // we're still building.
        if (idle > 90_000 && !finished.current) {
          finished.current = true;
          setStatus("error");
          setError("The build stopped before producing any files. Please try again.");
        }
      }
    }, 5_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);


  useEffect(() => {
    const unsub = subscribeCoderRun(runId, prompt, (ev: KimiEvent) => {
      lastEventRef.current = Date.now();
      sawEventRef.current = true;
      if (ev.type === "todo") setTodos(ev.todos);

      else if (ev.type === "text") {
        const next = `${notesRef.current}${notesRef.current && ev.text ? "\n\n" : ""}${ev.text || ""}`;
        notesRef.current = next;
        setNotes(next);
        mergeProjectFiles(extractProjectFiles(next));
        applyPatchesFromNotes(next);
      }
      else if (ev.type === "file") {
        setFiles((prev) => {
          const next = new Map(prev);
          next.set(ev.path, ev.content);
          filesRef.current = next;
          return next;
        });
        setSelectedFile((cur) => cur ?? ev.path);
      } else if (ev.type === "bash")
        setBash((prev) => [...prev, { command: ev.command, output: ev.output, ok: ev.ok }]);
      else if (ev.type === "integration") {
        setIntegrations((prev) => {
          if (prev.find((p) => p.kind === ev.kind)) return prev;
          const preState = integStatusRef.current[ev.kind] ? "connected" : "pending";
          return [...prev, { kind: ev.kind, reason: ev.reason, state: preState }];
        });
        getCoderIntegrationStatus().then((s) => {
          integStatusRef.current = { github: s.github, supabase: s.supabase };
          if ((ev.kind === "github" && s.github) || (ev.kind === "supabase" && s.supabase)) {
            setIntegrations((prev) => prev.map((p) => (p.kind === ev.kind ? { ...p, state: "connected" } : p)));
          }
        }).catch(() => {});
      } else if (ev.type === "done") {
        if (finished.current) return;
        finished.current = true;
        // Merge (never replace): late-parsed files, streamed `file` events,
        // patched files and the backend's own file list all contribute.
        mergeProjectFiles(extractProjectFiles(notesRef.current));
        applyPatchesFromNotes(notesRef.current);
        const merged = new Map(filesRef.current);
        for (const f of ev.files || []) if (f?.path) merged.set(f.path, f.content ?? "");
        filesRef.current = merged;
        const scaffolded = ensureProjectScaffold(
          autoFixProjectFiles(
            Array.from(merged.entries()).map(([path, content]) => ({
              path, content, lang: (path.split(".").pop() || "txt").toLowerCase(),
            })),
          ),
        );
        void completeRun(scaffolded, ev.summary || notesRef.current.slice(0, 500));
      } else if (ev.type === "error") {
        if (finished.current) return;
        // Fallback: if the stream errored/closed but we already have files,
        // treat as done so the user can preview/publish/download.
        if (finalizeFromRef()) return;
        setStatus("error");
        setError(ev.error);

      }
    }, { previousFiles, history, attachments });

    return () => { unsub(); };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);
  // Pre-warm integration status once so integration cards render without a "pending" flash.
  useEffect(() => {
    getCoderIntegrationStatus().then((s) => {
      integStatusRef.current = { github: s.github, supabase: s.supabase };
    }).catch(() => {});
  }, []);





  const doneCount = todos.filter((t) => t.done).length;
  const fileList = useMemo(() => Array.from(files.keys()).sort(), [files]);
  const runningLabel =
    todos.length > 0
      ? `Building… ${doneCount}/${todos.length} · ${files.size} files`
      : files.size > 0
        ? `Building… finalizing · ${files.size} files`
        : "Building… preparing";

  const projectFiles = useMemo<ProjectFile[]>(
    () => Array.from(files.entries()).map(([path, content]) => ({
      path,
      content,
      lang: (path.split(".").pop() || "txt").toLowerCase(),
    })),
    [files],
  );

  const copyAllFiles = async () => {
    if (projectFiles.length === 0) return toast.error("No files yet");
    await navigator.clipboard.writeText(
      projectFiles.map((f) => `--- ${f.path} ---\n${f.content}`).join("\n\n"),
    );
    toast.success("Files copied");
  };

  const downloadProjectJson = () => {
    if (projectFiles.length === 0) return toast.error("No files yet");
    const blob = new Blob([JSON.stringify(projectFiles, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "megsy-coder-project.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePreview = async () => {
    if (projectFiles.length === 0) {
      toast.error("No files yet");
      return;
    }
    setPublishing(true);
    try {
      const { url, id, degraded } = await publishProject(projectFiles, { title: prompt.slice(0, 60), prompt, siteId: publishedId ?? undefined });
      setPublishedId(id);
      try {
        await navigator.clipboard.writeText(url);
        toast.success(degraded ? "Published as source view — link copied" : "Published — link copied", { description: degraded ? `${url} · this project can\u2019t run standalone, so the page shows its source files.` : url });
      } catch {
        toast.success("Published", { description: url });
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      const msg = e?.message || "Publish failed";
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

  /** Roll the project back to the previous saved snapshot. */
  const handleUndo = () => {
    const prev = undoCheckpoint(checkpointId);
    if (!prev) {
      toast.info("No previous version to restore");
      setCanUndo(false);
      return;
    }
    const next = new Map<string, string>();
    for (const f of prev.files) next.set(f.path, f.content);
    filesRef.current = next;
    setFiles(next);
    setCanUndo(listCheckpoints(checkpointId).length > 1);
    onFinish?.(prev.files.map(({ path, content }) => ({ path, content })));
    toast.success("Reverted to the previous version");
  };

  const updateIntegration = (kind: "github" | "supabase", state: "connected" | "skipped") => {
    setIntegrations((prev) => prev.map((p) => (p.kind === kind ? { ...p, state } : p)));
  };

  const connectIntegration = async (kind: "github" | "supabase") => {
    if (connecting) return; // a connect popup is already in flight
    const integration = integrationsCatalog.find((i) => i.app === kind);
    if (!integration) {
      toast.error(`${kind} integration not available`);
      return;
    }
    setConnecting(kind);
    try {
      // Fast path: already connected via /integrations.
      const status = await getCoderIntegrationStatus();
      if ((kind === "github" && status.github) || (kind === "supabase" && status.supabase)) {
        updateIntegration(kind, "connected");
        toast.success(`${kind === "github" ? "GitHub" : "Supabase"} already connected`);
        return;
      }
      const result = await startIntegrationConnection(integration);
      if (result.mode === "local") {
        updateIntegration(kind, "connected");
        toast.success(`${kind === "github" ? "GitHub" : "Supabase"} connected`);
        return;
      }
      toast.success(`Finish connecting ${kind} in the popup`);
      await waitForConnectionRefresh(async () => {
        const snap = await loadIntegrationConnections([integration]);
        return !!snap.connectedApps[integration.app];
      }, (result as { popup?: Window | null }).popup ?? undefined);
      updateIntegration(kind, "connected");
      toast.success(`${kind === "github" ? "GitHub" : "Supabase"} connected`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${kind} connect failed`);
    } finally {
      setConnecting(null);
    }
  };



  return (
    <div className="my-3 w-full">
      {/* Quiet status row — reads like part of the conversation, not a product panel. */}
      <div className="flex flex-wrap items-center gap-2 pb-1">
        <div className="flex items-center gap-2 min-w-[140px] flex-1">
          {status === "running" ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-foreground/60" />
          ) : status === "done" ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          ) : (
            <X className="h-3.5 w-3.5 shrink-0 text-destructive" />
          )}
          <div className="truncate text-[13px] text-foreground/70">
            {status === "running"
              ? runningLabel
              : status === "done"
                ? `Done · ${files.size} files`
                : `Error: ${error}`}
          </div>
        </div>

        {status === "done" && todos.length > 0 && todos.some((t) => !t.done) && (
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs"
            title="The build stopped before every task was done — continue it"
            onClick={() => {
              const remaining = todos.filter((t) => !t.done).map((t) => `- ${t.title}`).join("\n");
              window.dispatchEvent(
                new CustomEvent("megsy:coder-continue", {
                  detail: {
                    prompt: `Continue the previous build. Finish these remaining tasks without redoing completed work:\n${remaining}`,
                  },
                }),
              );
              toast.success("Continuing the build…");
            }}
          >
            <PlayCircle className="h-3.5 w-3.5 mr-1" />
            Continue
          </Button>
        )}
        {status === "done" && files.size > 0 && (
          <Button size="sm" variant="secondary" onClick={() => setCanvasOpen(true)} className="h-7 text-xs">
            <Eye className="h-3.5 w-3.5 mr-1" />
            Canvas
          </Button>
        )}
        {status === "done" && files.size > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setStudioOpen(true)} className="h-7 text-xs text-foreground/80">
            <Pencil className="h-3.5 w-3.5 mr-1" />
            Studio
          </Button>
        )}
        {status === "done" && files.size > 0 && (
          <Button size="sm" variant="ghost" onClick={handlePreview} disabled={publishing} className="h-7 text-xs text-foreground/80">
            {publishing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5 mr-1" />}
            {publishing ? "Publishing…" : publishedId ? "Update site" : "Publish"}
          </Button>
        )}
        {status === "done" && files.size > 0 && canUndo && (
          <Button aria-label="Undo last change" size="sm" variant="ghost" onClick={handleUndo} className="h-7 text-xs text-foreground/80" title="Undo last change">
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
        )}
        {status === "done" && files.size > 0 && (
          <Button aria-label="Download project as ZIP" size="sm" variant="ghost" onClick={() => downloadProjectZip(projectFiles)} className="h-7 text-xs text-foreground/80" title="Download ZIP">
            <Download className="h-3.5 w-3.5" />
          </Button>
        )}
        {status === "done" && files.size > 0 && previousFiles && previousFiles.length > 0 && (
          <Button aria-label="View changes vs previous run" size="sm" variant="ghost" onClick={() => setDiffOpen(true)} className="h-7 text-xs text-foreground/80" title="View diff vs previous run">
            <GitCompare className="h-3.5 w-3.5" />
          </Button>
        )}
        {status === "done" && files.size > 0 && (
          <Button aria-label="Open in StackBlitz" size="sm" variant="ghost" onClick={() => openInStackBlitz(projectFiles, prompt.slice(0, 40) || "megsy-project")} className="h-7 text-xs text-foreground/80" title="Open in StackBlitz (real Vite build)">
            <Zap className="h-3.5 w-3.5" />
          </Button>
        )}
        {status === "done" && files.size > 0 && (
          <Button aria-label="Push project to GitHub" size="sm" variant="ghost" onClick={() => pushProjectToGithub(projectFiles, prompt.slice(0, 40) || "megsy-project")} className="h-7 text-xs text-foreground/80" title="Push to GitHub">
            <Github className="h-3.5 w-3.5" />
          </Button>
        )}


        <Button aria-label={collapsed ? "Expand run" : "Collapse run"} variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCollapsed((c) => !c)}>
          <ChevronDown className={cn("h-4 w-4 text-foreground/70 transition-transform", collapsed && "-rotate-90")} />
        </Button>
        <Button
          aria-label={status === "running" ? "Stop and close run" : "Close run"}
          title={status === "running" ? "Stop this build" : "Close"}
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => {
            // Closing a live run used to leave the SSE stream and the paid
            // asset jobs running in the background with no UI attached.
            if (status === "running") {
              finished.current = true;
              abortCoderRun(runId);
              setStatus("error");
              setError("Build stopped.");
            }
            onClose();
          }}
        >
          <X className="h-4 w-4 text-foreground/70" />
        </Button>
      </div>

      {collapsed ? null : (
        <div className="theme-fixed coder-fixed overflow-hidden rounded-2xl border border-foreground/10 bg-foreground/[0.02]">
          {/* Integration prompts */}
          {integrations.length > 0 && (
            <div className="flex flex-wrap gap-2 border-b border-foreground/10 p-3">
              {integrations.map((ig) => (
                <div
                  key={ig.kind}
                  className="flex min-w-[240px] flex-1 items-center gap-3 rounded-xl border border-foreground/10 bg-foreground/5 p-3"
                >
                  {ig.kind === "github" ? (
                    <Github className="h-5 w-5 text-foreground/80" />
                  ) : (
                    <Database className="h-5 w-5 text-emerald-400" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground capitalize">
                      Connect {ig.kind === "github" ? "GitHub" : "Supabase"}
                    </div>
                    <div className="text-[10px] text-foreground/60 truncate">{ig.reason}</div>
                  </div>
                  {ig.state === "pending" ? (
                    <>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={connecting !== null}
                        onClick={() => connectIntegration(ig.kind)}
                      >
                        {connecting === ig.kind ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Connecting…
                          </>
                        ) : (
                          <>
                            Connect <ExternalLink className="h-3 w-3 mr-1" />
                          </>
                        )}
                      </Button>


                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-foreground/70"
                        onClick={() => updateIntegration(ig.kind, "skipped")}
                      >
                        Skip
                      </Button>
                    </>
                  ) : (
                    <span
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full",
                        ig.state === "connected"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-foreground/10 text-foreground/50",
                      )}
                    >
                      {ig.state === "connected" ? "✓ Connected" : "Skipped"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 border-b border-foreground/10 px-2 py-1.5">
            {(
              [
                { id: "plan", icon: ListTodo, label: "Plan", count: todos.length },
                { id: "files", icon: FileCode, label: "Files", count: files.size },
                { id: "assets", icon: ImageIcon, label: "Media", count: assets.length },
                { id: "logs", icon: Terminal, label: "Log", count: bash.length },

                { id: "notes", icon: Copy, label: "Notes", count: notes ? 1 : 0 },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                  tab === t.id
                    ? "bg-primary/20 text-foreground"
                    : "text-foreground/60 hover:bg-foreground/5",
                )}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
                {t.count > 0 && (
                  <span className="rounded-full bg-foreground/10 px-1.5 text-[10px]">{t.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="max-h-[420px] min-h-[180px] overflow-hidden">
            {tab === "plan" && (
              <div className="h-full max-h-[420px] overflow-y-auto p-4">
                {todos.length === 0 ? (
                  <div className="text-sm text-foreground/50">
                    {status === "running" ? "Preparing plan…" : "No plan"}
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {todos.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-start gap-2.5 rounded-lg border border-foreground/10 bg-foreground/5 px-3 py-2"
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded",
                            t.done ? "bg-emerald-500 text-foreground" : "border border-foreground/30",
                          )}
                        >
                          {t.done && <Check className="h-3 w-3" />}
                        </span>
                        <span className={cn("text-sm text-foreground", t.done && "text-foreground/65 line-through")}>
                          {t.title}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {tab === "files" && (
              <div className="flex h-full max-h-[420px]">
                <div className="w-52 shrink-0 overflow-y-auto border-r border-foreground/10 p-2">
                  {fileList.length === 0 && (
                    <div className="p-2 text-xs text-foreground/50">No files yet…</div>
                  )}
                  {fileList.map((path) => (
                    <button
                      key={path}
                      onClick={() => setSelectedFile(path)}
                      className={cn(
                        "block w-full truncate rounded px-2 py-1 text-left text-xs",
                        selectedFile === path
                          ? "bg-primary/20 text-foreground"
                          : "text-foreground/70 hover:bg-foreground/5",
                      )}
                    >
                      {path}
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-auto bg-background/40">
                  {selectedFile ? (
                    <div className="min-h-full">
                      <div className="sticky top-0 z-10 flex items-center justify-end gap-1 border-b border-foreground/10 bg-background/70 px-2 py-1 backdrop-blur">
                        <button onClick={copyAllFiles} className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-foreground/70 hover:bg-foreground/10">
                          <Copy className="h-3 w-3" /> Copy all
                        </button>
                        <button onClick={downloadProjectJson} className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-foreground/70 hover:bg-foreground/10">
                          <Download className="h-3 w-3" /> JSON
                        </button>
                      </div>
                      <pre className="p-3 text-xs leading-relaxed text-foreground/90">
                        <code>{files.get(selectedFile)}</code>
                      </pre>
                    </div>
                  ) : (
                    <div className="p-4 text-xs text-foreground/50">Choose a file</div>
                  )}
                </div>
              </div>
            )}

            {tab === "assets" && (
              <div className="h-full max-h-[420px] overflow-y-auto p-3">
                {assets.length === 0 ? (
                  <div className="text-sm text-foreground/50">
                    {status === "running"
                      ? "Media is generated after the build finishes."
                      : "This project needs no generated media."}
                  </div>
                ) : (
                  <>
                    <div className="mb-3 flex items-center justify-between text-[11px] text-foreground/60">
                      <span>
                        {assetPhase === "running" ? "Generating media…" : "Media used in the site"}
                      </span>
                      <span className="rounded-full bg-foreground/10 px-2 py-0.5">
                        {estimateAssetCredits(assets.filter((a) => a.status === "done"))} credits used ·{" "}
                        {estimateAssetCredits(assets)} total
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {assets.map((a) => (
                        <div key={a.id} className="overflow-hidden rounded-xl border border-foreground/10 bg-foreground/5">
                          <div className="flex aspect-video items-center justify-center bg-background/40">
                            {a.status === "done" && a.url ? (
                              a.kind === "video" ? (
                                <video src={a.url} className="h-full w-full object-cover" muted loop playsInline />
                              ) : (
                                <img decoding="async" src={a.url} alt={a.prompt} loading="lazy" className="h-full w-full object-cover" />
                              )
                            ) : a.status === "error" ? (
                              <span className="px-2 text-center text-[10px] text-red-300">{a.error}</span>
                            ) : (
                              <Loader2 className="h-4 w-4 animate-spin text-foreground/50" />
                            )}
                          </div>
                          <div className="p-2">
                            <div className="truncate text-[11px] text-foreground/80" title={a.prompt}>{a.prompt}</div>
                            <div className="mt-1 flex items-center justify-between">
                              <span className="text-[10px] text-foreground/65">
                                {a.kind === "video" ? "Video" : "Image"} · {a.credits} credits
                              </span>
                              <button
                                onClick={() => regenerateAsset(a.id)}
                                disabled={a.status === "running"}
                                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-foreground/70 hover:bg-foreground/10 disabled:opacity-40"
                              >
                                <RefreshCw className={cn("h-3 w-3", a.status === "running" && "animate-spin")} />
                                Redo
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}


            {tab === "logs" && (
              <div className="h-full max-h-[420px] overflow-y-auto bg-background p-3 font-mono text-xs text-emerald-300">
                {bash.length === 0 && <div className="text-foreground/65">No commands yet…</div>}
                {bash.map((b, i) => (
                  <div key={i} className="mb-2">
                    <div className={cn("font-semibold", b.ok ? "text-cyan-300" : "text-red-400")}>
                      $ {b.command}
                    </div>
                    <div className="whitespace-pre-wrap opacity-80">{b.output}</div>
                  </div>
                ))}
              </div>
            )}

            {tab === "notes" && (
              <div className="h-full max-h-[420px] overflow-y-auto bg-background/60 p-3 text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap">
                {notes || (status === "running" ? "Waiting for coder notes…" : "No notes")}
              </div>
            )}
          </div>
        </div>

      )}
      <Suspense fallback={null}>
        {canvasOpen && (
          <ArtifactCanvas
            open={canvasOpen}
            onOpenChange={setCanvasOpen}
            content={notes || prompt}
            files={projectFiles}
          />
        )}
        {studioOpen && (
          <CoderStudioModal
            open={studioOpen}
            onClose={() => setStudioOpen(false)}
            initialFiles={projectFiles}
            onFilesChange={(next) => {
              setFiles(() => {
                const m = new Map<string, string>();
                for (const f of next) m.set(f.path, f.content);
                filesRef.current = m;
                return m;
              });
              try {
                saveCheckpoint(checkpointId, next, "studio edit");
                setCanUndo(listCheckpoints(checkpointId).length > 1);
              } catch { /* best-effort */ }
              onFinish?.(next.map(({ path, content }) => ({ path, content })));
            }}

          />
        )}
        {diffOpen && (
          <CoderDiffModal
            open={diffOpen}
            onClose={() => setDiffOpen(false)}
            baseline={(previousFiles || []).map((f) => ({ path: f.path, content: f.content, lang: (f.path.split(".").pop() || "txt").toLowerCase() }))}
            current={projectFiles}
          />
        )}
      </Suspense>
    </div>
  );
}
