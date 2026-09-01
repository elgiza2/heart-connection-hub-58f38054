/** @doc In-chat live card for a Computer Agent task: status, steps and output files with view/download. */
import { useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, XCircle, Download, ExternalLink, Square } from "lucide-react";
import { toast } from "sonner";
import ToolCard from "@/components/chat/primitives/ToolCard";
import {
  pollComputerTask,
  stopComputerTask,
  computerErrorMessage,
  type ComputerTask,
  type ComputerEvent,
} from "@/lib/computer/client";

interface Props {
  taskId: string;
}

const POLL_MS = 4000;

export default function ComputerTaskCard({ taskId }: Props) {
  const [task, setTask] = useState<ComputerTask | null>(null);
  const [events, setEvents] = useState<ComputerEvent[]>([]);
  const [stopping, setStopping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await pollComputerTask(taskId);
        if (cancelled) return;
        setTask(res.task);
        setEvents(res.events || []);
        const finished = res.task.status === "done" || res.task.status === "failed";
        if (!finished) timer.current = setTimeout(tick, POLL_MS);
      } catch {
        if (!cancelled) timer.current = setTimeout(tick, POLL_MS * 2);
      }
    };
    void tick();

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [taskId]);

  const running = !task || task.status === "pending" || task.status === "running";
  const failed = task?.status === "failed";

  const handleStop = async () => {
    setStopping(true);
    try {
      await stopComputerTask(taskId);
      toast.success("Task stopped");
    } catch {
      toast.error("Couldn't stop the task");
    } finally {
      setStopping(false);
    }
  };

  return (
    <ToolCard
      title="Computer"
      subtitle={
        running
          ? task?.progress || "Working on your task…"
          : failed
            ? computerErrorMessage(task?.error) || "Task failed"
            : "Task complete"
      }
      trailing={
        running ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <button
              type="button"
              onClick={handleStop}
              disabled={stopping}
              className="rounded-full bg-foreground/[0.06] p-1.5 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Stop task"
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : failed ? (
          <XCircle className="h-4 w-4 text-destructive" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        )
      }
    >
      {events.length > 0 && (
        <ol className="space-y-1.5">
          {events.slice(-8).map((e) => (
            <li key={e.id} className="flex gap-2 text-[12px] text-muted-foreground">
              <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/25" />
              <span className="min-w-0 flex-1 truncate">{e.title}</span>
            </li>
          ))}
        </ol>
      )}

      {task?.result_text && (
        <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">
          {task.result_text}
        </p>
      )}

      {task?.files && task.files.length > 0 && (
        <div className="mt-3 space-y-2">
          {task.files.map((f) => {
            const isImage = /\.(png|jpe?g|webp|gif|avif)$/i.test(f.url) || f.type?.startsWith("image/");
            const isVideo = /\.(mp4|webm|mov)$/i.test(f.url) || f.type?.startsWith("video/");
            return (
              <div key={f.url} className="overflow-hidden rounded-ios border border-border/50">
                {isImage && (
                  <img src={f.url} alt={f.name} loading="lazy" className="max-h-64 w-full object-cover" />
                )}
                {isVideo && <video src={f.url} controls className="max-h-64 w-full" />}
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-[12px]">{f.name}</span>
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full bg-foreground/[0.06] p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={`View ${f.name}`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <a
                    href={f.url}
                    download={f.name}
                    className="rounded-full bg-foreground/[0.06] p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={`Download ${f.name}`}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ToolCard>
  );
}
