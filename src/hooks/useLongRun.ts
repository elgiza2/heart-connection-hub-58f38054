import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import * as localKernel from "@/lib/agentkernel/kernel";
import {
  KEEPALIVE_MS,
  type AgentQuestion,
  type LongRun,
  type LongRunEvent,
} from "@/lib/longrun/types";

/**
 * The kernel runs in the `long-run` edge function whenever it is reachable —
 * that version keeps working with the tab closed. If the function is missing or
 * erroring, we transparently fall back to the in-tab kernel, which drives the
 * same rows so the UI is identical (it just needs the tab open).
 */
let edgeAvailable = true;

async function call(action: string, body: Record<string, unknown> = {}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("سجّل الدخول أولاً لتشغيل مهام الكمبيوتر");
  const { data, error } = await supabase.functions.invoke<{
    run?: LongRun;
    question?: AgentQuestion | null;
  }>("long-run", {
    body: { action, ...body, token },
  });
  if (error) {
    edgeAvailable = false;
    throw error;
  }
  edgeAvailable = true;
  return data ?? {};
}

/** Runs the edge action, and on failure the equivalent in-tab kernel action. */
async function withFallback(
  action: string,
  body: Record<string, unknown>,
  local: () => Promise<LongRun | null>,
): Promise<LongRun | null> {
  if (edgeAvailable) {
    try {
      const res = await call(action, body);
      if (res.run) return res.run;
    } catch {
      /* fall through to the in-tab kernel */
    }
  }
  return local();
}

export async function startLongRun(
  goal: string,
  conversationId?: string | null,
  budgetMs?: number,
) {
  return withFallback(
    "start",
    {
      goal,
      conversation_id: conversationId ?? null,
      ...(budgetMs ? { budget_ms: budgetMs } : {}),
    },
    () => localKernel.startRun(goal, conversationId ?? null, budgetMs),
  );
}

export async function stopLongRun(runId: string) {
  await withFallback("stop", { run_id: runId }, () => localKernel.stop(runId));
}

export async function approveLongRunPlan(runId: string, planSteps?: string[]) {
  return withFallback(
    "approve_plan",
    { run_id: runId, ...(planSteps && planSteps.length ? { plan_steps: planSteps } : {}) },
    () => localKernel.approvePlan(runId, planSteps),
  );
}

export async function guideLongRun(runId: string, guidance: string) {
  return withFallback("guide", { run_id: runId, guidance }, () =>
    localKernel.guide(runId, guidance),
  );
}

export async function steerLongRun(runId: string, guidance: string) {
  return withFallback("steer", { run_id: runId, guidance }, () =>
    localKernel.steer(runId, guidance),
  );
}

export async function softStopLongRun(runId: string) {
  return withFallback("soft_stop", { run_id: runId }, () => localKernel.softStop(runId));
}

export async function answerLongRun(runId: string, answer: string) {
  return withFallback("answer", { run_id: runId, answer }, () =>
    localKernel.answer(runId, answer),
  );
}

/**
 * Live view of a long run.
 *
 * When the edge kernel is reachable the run is advanced server-side by cron, so
 * it keeps going with the tab closed and this hook only mirrors state. When we
 * are on the in-tab fallback, this hook's poll is what advances the run.
 */
export function useLongRun(runId: string | null) {
  const [run, setRun] = useState<LongRun | null>(null);
  const [events, setEvents] = useState<LongRunEvent[]>([]);
  const [question, setQuestion] = useState<AgentQuestion | null>(null);
  const beating = useRef(false);

  const loadQuestion = useCallback(async (id: string) => {
    const { data } = await supabase
      .from("agent_questions")
      .select("*")
      .eq("run_id", id)
      .eq("status", "open")
      .order("asked_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setQuestion((data as unknown as AgentQuestion) ?? null);
  }, []);

  useEffect(() => {
    if (!runId) {
      setRun(null);
      setEvents([]);
      setQuestion(null);
      return;
    }
    let cancelled = false;

    void (async () => {
      const [{ data: r }, { data: ev }] = await Promise.all([
        supabase.from("long_runs").select("*").eq("id", runId).maybeSingle(),
        supabase
          .from("long_run_events")
          .select("*")
          .eq("run_id", runId)
          .order("created_at", { ascending: true }),
      ]);
      if (cancelled) return;
      if (r) setRun(r as unknown as LongRun);
      setEvents((ev ?? []) as unknown as LongRunEvent[]);
      await loadQuestion(runId);
    })();

    const channel = supabase
      .channel(`long-run-${runId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "long_runs", filter: `id=eq.${runId}` },
        (p) => setRun(p.new as unknown as LongRun),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "long_run_events",
          filter: `run_id=eq.${runId}`,
        },
        (p) => setEvents((prev) => [...prev, p.new as unknown as LongRunEvent]),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agent_questions", filter: `run_id=eq.${runId}` },
        () => void loadQuestion(runId),
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [runId, loadQuestion]);

  // Advance the run while the tab is open. With the edge kernel this only
  // refreshes faster than cron; on the fallback it is the engine itself.
  useEffect(() => {
    if (!runId) return;
    const active = run?.status === "running" || run?.status === "paused" || run?.status === "queued";
    if (!active || run?.needs_input) return;
    // NB: awaiting_plan_ack runs stay polled — the tick auto-continues them.
    const ping = async () => {
      if (beating.current || document.hidden) return;
      beating.current = true;
      try {
        if (edgeAvailable) {
          try {
            const res = await call("keepalive", { run_id: runId });
            if (res.run) setRun(res.run);
            if (res.question !== undefined) setQuestion(res.question ?? null);
            return;
          } catch {
            /* fall through to the in-tab kernel */
          }
        }
        const updated = await localKernel.tick(runId);
        if (updated) setRun(updated);
        await loadQuestion(runId);
      } catch {
        /* next poll retries */
      } finally {
        beating.current = false;
      }
    };
    void ping();
    const id = window.setInterval(ping, Math.min(8_000, KEEPALIVE_MS));
    return () => window.clearInterval(id);
  }, [runId, run?.status, run?.needs_input, loadQuestion]);

  const approvePlan = useCallback(
    async (planSteps?: string[]) => {
      if (!runId) return;
      const updated = await approveLongRunPlan(runId, planSteps);
      if (updated) setRun(updated);
    },
    [runId],
  );

  const guide = useCallback(
    async (text: string) => {
      if (!runId || !text.trim()) return;
      const updated = await guideLongRun(runId, text.trim());
      if (updated) setRun(updated);
    },
    [runId],
  );

  const steer = useCallback(
    async (text: string) => {
      if (!runId || !text.trim()) return;
      const updated = await steerLongRun(runId, text.trim());
      if (updated) setRun(updated);
    },
    [runId],
  );

  const softStop = useCallback(async () => {
    if (!runId) return;
    const updated = await softStopLongRun(runId);
    if (updated) setRun(updated);
  }, [runId]);

  const stop = useCallback(async () => {
    if (runId) await stopLongRun(runId);
  }, [runId]);

  const answer = useCallback(
    async (text: string) => {
      if (!runId || !text.trim()) return;
      const updated = await answerLongRun(runId, text.trim());
      if (updated) setRun(updated);
      setQuestion(null);
    },
    [runId],
  );

  return { run, events, question, stop, softStop, answer, approvePlan, guide, steer };
}

