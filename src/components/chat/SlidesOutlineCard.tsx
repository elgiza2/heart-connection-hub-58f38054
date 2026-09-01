import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { SlidesOutline, SlidesOutlineStep } from "@/lib/slidesOutlineParser";
import type { SlidesPlanState } from "@/lib/slides/planTypes";
import ToolCard from "./primitives/ToolCard";

import { ToolLoader, ToolStatusBadge, ToolStages } from "./primitives/ToolStatus";

interface SlidesOutlineCardProps {
  outline: SlidesOutline;
  /** Full staged-workflow state (planning → research → review → generate). */
  plan?: SlidesPlanState;
  messageId?: string;
  conversationId?: string | null;
  userId?: string | null;
  onStart?: () => void;
  status?: "planning" | "generating" | "done";
}

type Stage = "plan" | "research" | "review";

export default function SlidesOutlineCard({
  outline,
  plan,
  messageId,
  conversationId,
  userId,
  status = "planning",
  onStart,
}: SlidesOutlineCardProps) {
  // Detect Arabic UI (via html lang/dir) instead of hardcoding LTR. Falls back
  // to LTR when the DOM is unavailable (SSR / tests).
  const ar =
    typeof document !== "undefined" &&
    (document.documentElement.dir === "rtl" ||
      (document.documentElement.lang || "").toLowerCase().startsWith("ar"));
  const [steps, setSteps] = useState<SlidesOutlineStep[]>(
    () => plan?.outline?.steps || outline.steps || [],
  );
  const [stage, setStage] = useState<Stage>("plan");
  const [busy, setBusy] = useState<null | "research" | "review" | "start">(null);
  const [research, setResearch] = useState(plan?.research);
  const [content, setContent] = useState(plan?.content || []);
  const [researchStatus, setResearchStatus] = useState<string>("");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (plan?.outline?.steps?.length) setSteps(plan.outline.steps);
  }, [plan?.outline]);

  const generating = status === "generating" || plan?.stage === "generating";
  const done = status === "done" || plan?.stage === "done";
  const locked = generating || done;

  const persist = (patch: Partial<SlidesPlanState>) => {
    if (!messageId || !plan) return;
    void import("@/pages/chat/services/conversationApi").then(({ updateMessageMetadata }) =>
      updateMessageMetadata(messageId, {
        kind: "slidesPlan",
        slidesPlan: { ...plan, outline: { ...plan.outline, steps }, ...patch },
      }).catch(() => {}),
    );
  };

  const currentPlan = useMemo<SlidesPlanState>(
    () => ({
      topic: plan?.topic || outline.intro || "",
      templateId: plan?.templateId || "",
      language: plan?.language || "en",
      stage: "generating",
      sourceText: plan?.sourceText,
      sourceFiles: plan?.sourceFiles,
      outline: { intro: plan?.outline?.intro ?? outline.intro, steps },
      research,
      content,
    }),
    [plan, outline, steps, research, content],
  );

  // ── Step 1: plan editing ────────────────────────────────────────────────
  const updateTitle = (i: number, value: string) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, title: value } : s)));
  const updateItem = (i: number, j: number, value: string) =>
    setSteps((prev) =>
      prev.map((s, idx) =>
        idx === i ? { ...s, items: s.items.map((it, k) => (k === j ? value : it)) } : s,
      ),
    );
  const addItem = (i: number) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, items: [...s.items, ""] } : s)));
  const removeItem = (i: number, j: number) =>
    setSteps((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, items: s.items.filter((_, k) => k !== j) } : s)),
    );
  const addSlide = () => setSteps((prev) => [...prev, { title: "", items: [] }]);
  const removeSlide = (i: number) => setSteps((prev) => prev.filter((_, idx) => idx !== i));

  // ── Step 2: deep research ───────────────────────────────────────────────
  const runResearch = async () => {
    if (busy) return;
    setBusy("research");
    setResearchStatus("Starting research…");
    try {
      const { runDeepResearchTool } = await import("@/lib/research/deepResearchTool");
      const jobId = crypto.randomUUID();
      setResearch({ jobId, status: "searching" });
      let sources: { title: string; url: string }[] = [];
      const summary = await runDeepResearchTool({
        query: currentPlan.topic,
        context: plan?.sourceText,
        depth: "ultra",
        onStatus: (value) => mounted.current && setResearchStatus(value),
        onSources: (value) => {
          sources = value.slice(0, 10).map(({ title, url }) => ({ title, url }));
        },
      });
      if (!mounted.current) return;
      setResearch({ jobId, status: "succeeded", summary, sources });
      persist({ research: { jobId, status: "succeeded", summary, sources } });
      // Re-plan the outline with the fresh findings.
      const { generateSlidesOutline } = await import("@/lib/slides/generateOutline");
      const next = await generateSlidesOutline({
        topic: currentPlan.topic,
        language: "en",
        userId: userId || undefined,
        sourceText: plan?.sourceText,
        researchText: summary,
        slideCount: steps.length || 8,
      });
      if (next?.outline?.steps?.length && mounted.current) setSteps(next.outline.steps);
      setStage("research");
    } catch (e: any) {
      toast.error(e?.message || ("Could not run research"));
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  // ── Step 3: review generated content ────────────────────────────────────
  const runReview = async () => {
    if (busy) return;
    setBusy("review");
    try {
      const { generateSlidesContent } = await import("@/lib/slides/generateOutline");
      const written = await generateSlidesContent({
        outline: { intro: "", steps },
        topic: currentPlan.topic,
        language: "en",
        userId: userId || undefined,
        sourceText: plan?.sourceText,
        researchText: research?.summary,
      });
      if (!written) throw new Error("Could not draft content");
      if (!mounted.current) return;
      setContent(written);
      setStage("review");
      persist({ content: written, stage: "reviewing" });
    } catch (e: any) {
      toast.error(e?.message || "Review failed");
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  const startGeneration = () => {
    if (busy || locked) return;
    setBusy("start");
    persist({ stage: "generating", content });
    window.dispatchEvent(
      new CustomEvent("megsy:slides-generate", {
        detail: { messageId, plan: currentPlan },
      }),
    );
    onStart?.();
  };

  const t = {
    plan: "Plan",
    research: "Deep research",
    review: "Review content",
    generate: "Generate slides",
    addSlide: "Add slide",
    addPoint: "Add point",
  };

  return (
    <ToolCard
      title={"Slide outline"}
      subtitle={`${steps.length} ${`slide${steps.length === 1 ? "" : "s"}`}`}
      trailing={
        <ToolStatusBadge
          status={generating ? "running" : done ? "done" : "idle"}
          runningLabel={"Generating…"}
          doneLabel={"Done"}
        />
      }
    >
      <ToolStages
        active={stage}
        stages={[
          { key: "plan", label: t.plan },
          { key: "research", label: t.research },
          { key: "review", label: t.review },
        ]}
      />

      {plan?.sourceFiles?.length ? (
        <p className="mb-2 text-[11px] text-muted-foreground">
          {"Imported data: "}
          {plan.sourceFiles.map((f) => f.name).join(", ")}
        </p>
      ) : null}

      {outline.intro && stage === "plan" && (
        <p className="mb-3 text-sm leading-relaxed text-foreground/90">{outline.intro}</p>
      )}

      {busy === "research" && (
        <ToolLoader
          className="mb-2"
          label={researchStatus || ("Researching…")}
        />
      )}

      {stage === "review" && content.length > 0 ? (
        <ol className="space-y-2">
          {content.map((c, i) => (
            <li key={i} className="rounded-ios-md border border-border/40 bg-background/40 p-3">
              <input
                value={c.title}
                disabled={locked}
                onChange={(e) =>
                  setContent((prev) =>
                    prev.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)),
                  )
                }
                className="mb-1 w-full bg-transparent text-sm font-semibold text-foreground outline-none"
              />
              <textarea
                value={c.body}
                disabled={locked}
                rows={3}
                onChange={(e) =>
                  setContent((prev) =>
                    prev.map((x, k) => (k === i ? { ...x, body: e.target.value } : x)),
                  )
                }
                className="w-full resize-y bg-transparent text-[12.5px] leading-snug text-foreground/80 outline-none"
              />
            </li>
          ))}
        </ol>
      ) : (
        <ol className="space-y-2">
          {steps.map((slide, index) => (
            <li
              key={index}
              className="rounded-ios-md border border-border/40 bg-background/40 p-3 text-sm"
            >
              <div className="mb-1.5 flex items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                  {index + 1}
                </span>
                <input
                  value={slide.title}
                  disabled={locked}
                  onChange={(e) => updateTitle(index, e.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-foreground outline-none"
                />
                {!locked && (
                  <button
                    type="button"
                    aria-label="remove slide"
                    onClick={() => removeSlide(index)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <span aria-hidden className="text-[13px] leading-none">×</span>
                  </button>
                )}
              </div>
              <ul className="space-y-1 ps-8">
                {slide.items?.map((item, itemIndex) => (
                  <li key={itemIndex} className="flex items-center gap-2">
                    <input
                      value={item}
                      disabled={locked}
                      onChange={(e) => updateItem(index, itemIndex, e.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-[12px] leading-snug text-foreground/70 outline-none"
                    />
                    {!locked && (
                      <button
                        type="button"
                        aria-label="remove point"
                        onClick={() => removeItem(index, itemIndex)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <span aria-hidden className="text-[13px] leading-none">×</span>
                      </button>
                    )}
                  </li>
                ))}
                {!locked && (
                  <li>
                    <button
                      type="button"
                      onClick={() => addItem(index)}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      {t.addPoint}
                    </button>
                  </li>
                )}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {!locked && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {stage !== "review" && (
            <button
              type="button"
              onClick={addSlide}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/50 px-3 text-[12px] text-muted-foreground hover:text-foreground"
            >
              {t.addSlide}
            </button>
          )}
          <button
            type="button"
            disabled={!!busy || research?.status === "succeeded"}
            onClick={runResearch}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/50 px-3 text-[12px] text-foreground/80 hover:text-foreground disabled:opacity-50">
            {busy === "research" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            {research?.status === "succeeded" ? ("Research done") : t.research}
          </button>
          <button
            type="button"
            disabled={!!busy || !steps.length}
            onClick={runReview}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/50 px-3 text-[12px] text-foreground/80 hover:text-foreground disabled:opacity-50">
            {busy === "review" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            {t.review}
          </button>
          <button
            type="button"
            disabled={!!busy || !steps.length}
            onClick={startGeneration}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-4 text-[12px] font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
            {busy === "start" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {t.generate}
          </button>
        </div>
      )}
    </ToolCard>
  );
}
