import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Monitor } from "lucide-react";
import { useLongRun } from "@/hooks/useLongRun";
import { clearActiveComputerRun, setActiveComputerRun } from "@/lib/computer/activeRun";
import ThinkingTrace from "@/components/chat/ThinkingTrace";
import { Button } from "@/components/ui/button";

/**
 * Computer surface, reduced to two things only:
 *   1. a single thinking badge in the chat while the agent works,
 *   2. the computer card itself — clean rounded frame, one open/close toggle,
 *      no titles, no buttons, no step lists.
 * The final answer is rendered as plain chat text.
 */
export function ComputerPreview({
  runId,
  plan,
  onClose,
}: {
  runId: string;
  plan?: string[];
  onClose?: () => void;
}) {
  const { run, events, question, answer, approvePlan } = useLongRun(runId);
  const [open, setOpen] = useState(true);
  const [summary, setSummary] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [approving, setApproving] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const summarizedRef = useRef(false);

  const active = run?.status === "running" || run?.status === "queued" || run?.status === "paused";
  const finished = !!run && !active;
  const failed = run?.status === "error" || run?.status === "canceled";

  useEffect(() => {
    if (active) setActiveComputerRun(runId);
    else if (finished) clearActiveComputerRun(runId);
  }, [active, finished, runId]);
  useEffect(() => () => clearActiveComputerRun(runId), [runId]);

  // The run keeps going server-side, so tell the user when it lands or blocks.
  const notifiedRef = useRef<string | null>(null);
  useEffect(() => {
    const state = finished ? "finished" : question ? "needs_input" : null;
    if (!state || notifiedRef.current === state) return;
    notifiedRef.current = state;
    if (!("Notification" in window) || !document.hidden) return;
    const show = () => {
      try {
        new Notification(
          state === "needs_input" ? "الوكيل محتاج ردّك" : failed ? "المهمة فشلت" : "المهمة خلصت",
          { body: run?.goal?.slice(0, 120) || "" },
        );
      } catch {
        /* notifications blocked — the in-chat badge is enough */
      }
    };
    if (Notification.permission === "granted") show();
    else if (Notification.permission === "default")
      void Notification.requestPermission().then((p) => {
        if (p === "granted") show();
      });
  }, [finished, question, failed, run?.goal]);

  const url = useMemo(() => {
    if (!run?.live_view_url || finished) return null;
    return `${run.live_view_url}?view_only=true`;
  }, [run?.live_view_url, finished]);

  const rawOutput =
    (run?.result && (run.result.output as string | null)) ||
    (run?.status === "error" ? run?.error : null) ||
    null;

  // Model-written wrap-up, generated once when the run settles.
  useEffect(() => {
    if (!finished || summarizedRef.current || !run) return;
    summarizedRef.current = true;
    void (async () => {
      try {
        const { generateRunSummary } = await import("@/lib/computer/narration");
        const text = await generateRunSummary({
          task: run.goal || "",
          steps: events.map((e) => (e.detail ? `${e.title} — ${e.detail}` : e.title)),
          output: rawOutput,
          failed,
          conversationId: (run as { conversation_id?: string | null }).conversation_id ?? null,
        });
        if (text) setSummary(text);
      } catch {
        /* fall back to the raw output below */
      }
    })();
  }, [finished, run, events, rawOutput, failed]);

  const finalText =
    summary || rawOutput || (run?.status === "canceled" ? "تم إيقاف المهمة." : null);

  const lastStep = events.length ? events[events.length - 1] : null;
  const thinking = run?.status_text || lastStep?.summary || lastStep?.title || "";

  // Real activity trace: every persisted kernel event, newest last. Nothing is
  // synthesised here — the badge only ever shows what the backend reported.
  const traceSteps = useMemo(
    () =>
      events
        .map((e) => (e.summary || e.title || "").trim())
        .filter((v, i, arr) => v.length > 0 && arr[i - 1] !== v),
    [events],
  );

  // Reasoning / observations the kernel attached to its events.
  const traceText = useMemo(() => {
    const out: string[] = [];
    for (const e of events) {
      const meta = (e.metadata ?? null) as Record<string, unknown> | null;
      const thought = meta && typeof meta.thought === "string" ? meta.thought.trim() : "";
      const detail = (e.detail || "").trim();
      const line = thought || detail;
      if (line && out[out.length - 1] !== line) out.push(line);
    }
    return out.join("\n\n");
  }, [events]);

  const activeTool = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const fam = events[i]?.tool;
      if (fam) return fam;
    }
    return null;
  }, [events]);

  // Last screenshot captured by the agent — keeps the card meaningful after
  // the live view is torn down.
  const lastShot = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      if (events[i]?.screenshot_url) return events[i].screenshot_url as string;
    }
    return null;
  }, [events]);

  const hasScreen = !!url || !!lastShot;
  const awaitingApproval = run?.awaiting_plan_ack === true;

  const handleApprove = async () => {
    if (approving) return;
    setApproving(true);
    setApprovalError(null);
    try {
      await approvePlan(plan);
    } catch {
      setApprovalError("مقدرتش أسجل الموافقة. جرّب تاني.");
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* thinking badge — the only status surface in the chat */}
      {!question && (
        <ThinkingTrace
          active={active}
          status={thinking}
          steps={traceSteps}
          text={traceText}
          tool={activeTool}
          className="mb-0"
        />
      )}

      {awaitingApproval && !question && (
        <div className="flex flex-col items-start gap-2" role="group" aria-label="الموافقة على خطة التنفيذ">
          <Button
            type="button"
            variant="neutral"
            size="sm"
            onClick={() => void handleApprove()}
            disabled={approving}
            className="min-w-36"
          >
            {approving ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Check aria-hidden />
            )}
            {approving ? "ببدأ التنفيذ…" : "موافق، ابدأ التنفيذ"}
          </Button>
          {approvalError && (
            <p className="text-xs text-destructive" role="alert">
              {approvalError}
            </p>
          )}
        </div>
      )}

      {/* the agent needs a human answer — plain text + one line of input */}
      {question && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[13.5px] leading-relaxed text-foreground">{question.question}</p>
          {question.reason && (
            <p className="text-[12.5px] text-muted-foreground">{question.reason}</p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const text = reply.trim();
              if (!text) return;
              setReply("");
              void answer(text);
            }}
            className="flex items-center gap-2"
          >
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              type={question.sensitive ? "password" : "text"}
              placeholder="اكتب ردّك…"
              className="flex-1 border-0 border-b border-border/60 bg-transparent px-0 py-1 text-[13.5px] outline-none focus:border-primary"
            />
            <button type="submit" className="text-[12.5px] text-primary">
              إرسال
            </button>
          </form>
        </div>
      )}

      {/* computer card — clean frame, single open/close toggle, nothing else */}
      {hasScreen && (
        <div className="overflow-hidden rounded-2xl border border-border/40 bg-card/30">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "إغلاق شاشة الكمبيوتر" : "فتح شاشة الكمبيوتر"}
            className="flex w-full items-center justify-between px-3 py-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <Monitor className="h-4 w-4" />
            <ChevronDown
              className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>

          {open && (
            <div className="relative aspect-[16/10] w-full bg-black/80">
              {url ? (
                <iframe
                  key={url}
                  src={url}
                  title="Megsy Computer"
                  className="absolute inset-0 h-full w-full border-0"
                  allow="clipboard-read; clipboard-write"
                  sandbox="allow-scripts allow-same-origin allow-forms"
                />
              ) : lastShot ? (
                <img
                  src={lastShot}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover object-top"
                />
              ) : null}
              {url && <div className="absolute inset-0" aria-hidden />}
            </div>
          )}
        </div>
      )}

      {/* final answer, plain text */}
      {finished && finalText && (
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
          {finalText}
        </p>
      )}

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="self-start text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          إغلاق
        </button>
      )}
    </div>
  );
}

export default ComputerPreview;
