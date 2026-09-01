import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { notifyJobComplete } from "@/lib/notifyJobComplete";
import { ServiceProgress, type ProgressStep } from "./ServiceProgress";

interface VideoJobProgressProps {
  jobId: string;
  className?: string;
}

type VideoJob = {
  id: string;
  status: string | null;
  error: string | null;
  video_url: string | null;
};

const STAGES: Array<{ id: string; label: string; statuses: string[] }> = [
  { id: "queued", label: "Queued", statuses: ["queued", "pending"] },
  { id: "generating", label: "Generating video", statuses: ["running", "generating", "processing", "in_progress"] },
  { id: "encoding", label: "Encoding", statuses: ["encoding", "finalizing"] },
  { id: "done", label: "Ready", statuses: ["succeeded", "completed", "done", "ready"] },
];

function buildSteps(job: VideoJob | null): ProgressStep[] {
  if (!job) return STAGES.map((s) => ({ id: s.id, label: s.label, state: "pending" }));
  const status = (job.status || "").toLowerCase();
  const failed = status === "failed" || status === "error" || status === "cancelled";
  const idx = STAGES.findIndex((s) => s.statuses.includes(status));
  return STAGES.map((s, i) => {
    if (failed && i === Math.max(idx, 0))
      return { id: s.id, label: s.label, state: "error", detail: job.error || undefined };
    if (idx < 0) return { id: s.id, label: s.label, state: i === 0 ? "active" : "pending" };
    if (i < idx) return { id: s.id, label: s.label, state: "done" };
    if (i === idx) return { id: s.id, label: s.label, state: STAGES[idx].id === "done" ? "done" : "active" };
    return { id: s.id, label: s.label, state: "pending" };
  });
}

/**
 * Live progress card for a running video generation job.
 * Subscribes to `pending_video_jobs` via realtime.
 */
export function VideoJobProgress({ jobId, className }: VideoJobProgressProps) {
  const [job, setJob] = useState<VideoJob | null>(null);
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("pending_video_jobs")
        .select("id,status,error,video_url")
        .eq("id", jobId)
        .maybeSingle();
      if (!cancelled && data) setJob(data as VideoJob);
    })();

    const channel = supabase
      .channel(`video_job_${jobId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pending_video_jobs", filter: `id=eq.${jobId}` },
        (payload) => {
          const row = (payload.new || payload.old) as VideoJob;
          if (row) setJob(row);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  const status = (job?.status || "").toLowerCase();
  const success =
    !!job?.video_url ||
    status === "succeeded" ||
    status === "completed" ||
    status === "done" ||
    status === "ready";
  const failed = status === "failed" || status === "error" || status === "cancelled";

  if (success) {
    if (!notifiedRef.current) {
      notifiedRef.current = true;
      notifyJobComplete({ kind: "video", title: "🎬 Your video is ready", body: "Tap to view it in chat." });
    }
    return null;
  }

  // On failure, keep the progress card visible with the last-known stage marked
  // as error + the provider error message, so users see WHY it failed instead
  // of the card silently disappearing.
  return <ServiceProgress steps={buildSteps(job)} accent="primary" className={className} />;
}

export default VideoJobProgress;
