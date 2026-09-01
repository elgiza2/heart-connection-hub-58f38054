import { useEffect, useRef } from "react";

import { supabase } from "@/integrations/supabase/client";
import { notifyJobComplete } from "@/lib/notifyJobComplete";

/**
 * Global background-work notifier.
 *
 * Every long-running service (chat/agent, deep research, slides, docs, images,
 * video, code builds) writes its lifecycle to `background_jobs`, and autonomous
 * agent runs write to `long_runs`. This component watches both for the signed-in
 * user and raises a single completion notification (in-app toast + native
 * notification when the tab is hidden) as soon as the work finishes — so the
 * user can leave the page and be told when it's done.
 *
 * It never reloads or navigates on its own.
 */

type Kind = "video" | "slides" | "research";

const KIND_LABEL: Record<string, { label: string; kind: Kind; url?: string }> = {
  chat: { label: "Your answer is ready", kind: "research" },
  deep_research: { label: "Deep research finished", kind: "research" },
  docs: { label: "Your document is ready", kind: "research" },
  slides: { label: "Your presentation is ready", kind: "slides" },
  image: { label: "Your image is ready", kind: "video" },
  video: { label: "Your video is ready", kind: "video" },
  code_build: { label: "Your build finished", kind: "research" },
};

const POLL_MS = 30_000;

export default function BackgroundJobNotifier() {
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let userId: string | null = null;
    let jobChannel: ReturnType<typeof supabase.channel> | null = null;
    let runChannel: ReturnType<typeof supabase.channel> | null = null;
    let timer: number | undefined;

    const announceJob = (row: any) => {
      if (!row?.id) return;
      const key = `job:${row.id}:${row.status}`;
      if (seen.current.has(key)) return;
      if (row.status !== "done" && row.status !== "error") return;
      seen.current.add(key);
      const meta = KIND_LABEL[row.kind as string] ?? { label: "Task finished", kind: "research" as Kind };
      const title = row.status === "error" ? "A background task failed" : meta.label;
      const body =
        row.status === "error"
          ? String(row.error || "Something went wrong. Your progress was saved.").slice(0, 180)
          : row.status_text || undefined;
      notifyJobComplete({
        kind: meta.kind,
        title,
        body,
        onClickUrl: row.conversation_id ? `/chat/${row.conversation_id}` : undefined,
      });
    };

    const announceRun = (row: any) => {
      if (!row?.id) return;
      const done = row.status === "done" || row.status === "completed" || row.status === "error" || row.status === "failed";
      if (!done) return;
      const key = `run:${row.id}:${row.status}`;
      if (seen.current.has(key)) return;
      seen.current.add(key);
      const failed = row.status === "error" || row.status === "failed";
      notifyJobComplete({
        kind: "research",
        title: failed ? "The agent stopped with an error" : "The agent finished your task",
        body: (row.summary || row.goal || undefined)?.slice?.(0, 180),
        onClickUrl: row.conversation_id ? `/chat/${row.conversation_id}` : undefined,
      });
    };

    // Poll fallback (also covers rows finished while the tab was closed within
    // this session and tables without realtime replication).
    const sweep = async () => {
      if (!userId || cancelled) return;
      const since = new Date(Date.now() - 10 * 60_000).toISOString();
      const [jobs, runs] = await Promise.all([
        supabase
          .from("background_jobs" as any)
          .select("id,kind,status,status_text,error,conversation_id,updated_at")
          .eq("user_id", userId)
          .in("status", ["done", "error"])
          .gte("updated_at", since)
          .limit(20),
        supabase
          .from("long_runs" as any)
          .select("id,status,goal,conversation_id,updated_at")
          .eq("user_id", userId)
          .gte("updated_at", since)
          .limit(20),
      ]);
      if (cancelled) return;
      (jobs.data as any[] | null)?.forEach(announceJob);
      (runs.data as any[] | null)?.forEach(announceRun);
    };

    const start = async () => {
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
      if (!userId || cancelled) return;

      // Seed `seen` with what already finished so we don't replay old work.
      const since = new Date(Date.now() - 10 * 60_000).toISOString();
      const { data: old } = await supabase
        .from("background_jobs" as any)
        .select("id,status")
        .eq("user_id", userId)
        .in("status", ["done", "error"])
        .gte("updated_at", since)
        .limit(50);
      (old as any[] | null)?.forEach((r) => seen.current.add(`job:${r.id}:${r.status}`));

      jobChannel = supabase
        .channel(`bg-jobs-notify-${userId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "background_jobs", filter: `user_id=eq.${userId}` },
          (payload) => announceJob(payload.new),
        )
        .subscribe();

      runChannel = supabase
        .channel(`long-runs-notify-${userId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "long_runs", filter: `user_id=eq.${userId}` },
          (payload) => announceRun(payload.new),
        )
        .subscribe();

      timer = window.setInterval(() => void sweep(), POLL_MS);
    };

    void start();

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      if (jobChannel) void supabase.removeChannel(jobChannel);
      if (runChannel) void supabase.removeChannel(runChannel);
    };
  }, []);

  return null;
}
