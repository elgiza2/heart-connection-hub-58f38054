/** @doc Realtime card for the build_website tool — shows progress, preview URL, and the source files of an AI-generated website inside the chat. */
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronRight,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import JSZip from "jszip";
import { m as motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import StatusBadge from "../primitives/StatusBadge";

type Task = {
  step?: string;
  label?: string;
  status?: "running" | "done" | "error";
  detail?: string;
};

interface SiteRow {
  id: string;
  title: string | null;
  status: string;
  progress: number;
  tasks: Task[] | null;
  preview_url: string | null;
  published_url: string | null;
  error_message: string | null;
  files: Array<{ path: string; content: string; truncated?: boolean }> | null;
}

interface Props {
  siteId: string;
}

export default function SiteBuildCard({ siteId }: Props) {
  const [row, setRow] = useState<SiteRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [filesOpen, setFilesOpen] = useState(false);
  const [openFile, setOpenFile] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("generated_sites")
        .select("id,title,status,progress,tasks,preview_url,published_url,error_message,files")
        .eq("id", siteId)
        .maybeSingle();
      if (!cancelled) {
        setRow(data as any);
        setLoading(false);
      }
    })();
    const channel = supabase
      .channel(`site:${siteId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "generated_sites",
          filter: `id=eq.${siteId}`,
        },
        (payload) => setRow(payload.new as any),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [siteId]);

  const status = row?.status || (loading ? "loading" : "unknown");
  const isDone = status === "published" || status === "done";
  const isError = status === "failed" || status === "error";
  const url = row?.published_url || row?.preview_url || "";
  const tasks = (row?.tasks || []).filter(Boolean);
  const currentTask =
    [...tasks].reverse().find((t) => t.status === "running") || tasks[tasks.length - 1];

  const downloadZip = async () => {
    if (!row?.files?.length) return toast.error("No source files saved");
    const zip = new JSZip();
    for (const f of row.files) zip.file(f.path, f.content || "");
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(row.title || "website").replace(/[^\w-]+/g, "_")}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-2 max-w-[640px] rounded-2xl border border-border/60 bg-gradient-to-br from-card/80 to-card/40 backdrop-blur p-4 space-y-3"
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            isError
              ? "bg-destructive/15 text-destructive"
              : isDone
                ? "bg-primary/15 text-primary"
                : "bg-primary/10 text-primary"
          }`}
        >
          {isError ? (
            <AlertCircle className="w-5 h-5" />
          ) : isDone ? (
            <Sparkles className="w-5 h-5" />
          ) : (
            <Loader2 className="w-5 h-5 animate-spin" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">
            {row?.title || (loading ? "Loading website…" : "Generated Website")}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {isDone
              ? "✓ Website ready"
              : isError
                ? row?.error_message || "Build failed"
                : currentTask?.label || "Starting build…"}
          </div>
        </div>
      </div>

      {/* Progress */}
      {!isDone && !isError && (
        <div className="space-y-1.5">
          <Progress value={row?.progress ?? 5} className="h-1.5" />
          <div className="flex flex-wrap gap-1.5">
            {tasks.slice(-4).map((t, i) => (
              <StatusBadge
                key={i}
                status={t.status ?? "running"}
                label={t.label}
                size="md"
              />
            ))}
          </div>
        </div>
      )}

      {/* Done actions */}
      {isDone && url && (
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" className="gap-1.5">
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink className="w-3.5 h-3.5" />
              Open Website
            </a>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={downloadZip}
            disabled={!row?.files?.length}
          >
            <Download className="w-3.5 h-3.5" />
            Download ZIP
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5"
            onClick={() => setFilesOpen((v) => !v)}
            disabled={!row?.files?.length}
          >
            <FileCode2 className="w-3.5 h-3.5" />
            {row?.files?.length || 0} files
            <ChevronRight
              className={`w-3.5 h-3.5 transition-transform ${filesOpen ? "rotate-90" : ""}`}
            />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5"
            onClick={() => {
              navigator.clipboard.writeText(url);
              toast.success("Link copied");
            }}
          >
            <Copy className="w-3.5 h-3.5" />
            Copy URL
          </Button>
        </div>
      )}

      {/* Files list */}
      <AnimatePresence initial={false}>
        {filesOpen && row?.files?.length ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-border/60 bg-background/40 max-h-64 overflow-auto divide-y divide-border/40">
              {row.files.map((f) => (
                <button
                  key={f.path}
                  type="button"
                  onClick={() => setOpenFile(f.path)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 text-[12px] font-mono"
                >
                  <Code2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1">{f.path}</span>
                  {f.truncated && <span className="text-[9px] text-amber-500">truncated</span>}
                  <span className="text-[10px] text-muted-foreground">
                    {(f.content?.length || 0).toLocaleString()} ch
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Error */}
      {isError && (
        <div className="text-[12px] text-destructive bg-destructive/5 border border-destructive/30 rounded-lg p-2">
          {row?.error_message || "Build failed — try a simpler brief."}
        </div>
      )}

      {/* Code viewer modal */}
      {openFile && row?.files && (
        <CodeViewer
          file={row.files.find((f) => f.path === openFile)!}
          onClose={() => setOpenFile(null)}
        />
      )}
    </motion.div>
  );
}

function CodeViewer({
  file,
  onClose,
}: {
  file: { path: string; content: string };
  onClose: () => void;
}) {
  const lines = useMemo(() => (file.content || "").split("\n"), [file.content]);
  return (
    <div
      className="fixed inset-0 z-[120] bg-background/70 backdrop-blur flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-background w-full max-w-3xl max-h-[85vh] rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
          <Code2 className="w-4 h-4 text-muted-foreground" />
          <span className="text-[12px] font-mono truncate flex-1">{file.path}</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1"
            onClick={() => {
              navigator.clipboard.writeText(file.content || "");
              toast.success("Copied");
            }}
          >
            <Copy className="w-3.5 h-3.5" />
            Copy
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto bg-[hsl(var(--muted))]/20">
          <pre className="text-[12px] font-mono leading-relaxed">
            <code>
              {lines.map((ln, i) => (
                <div key={i} className="flex">
                  <span className="select-none text-muted-foreground pr-3 ps-3 text-right w-12 shrink-0 border-r border-border/30">
                    {i + 1}
                  </span>
                  <span className="px-3 whitespace-pre-wrap break-all">{ln || " "}</span>
                </div>
              ))}
            </code>
          </pre>
        </div>
      </motion.div>
    </div>
  );
}
