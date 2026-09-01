import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { DocsPlanState, DocsSection } from "@/lib/docs/planTypes";
import ToolCard from "./primitives/ToolCard";

import { ToolLoader, ToolStatusBadge, ToolStages } from "./primitives/ToolStatus";

interface DocsPlanCardProps {
  plan: DocsPlanState;
  messageId?: string;
  conversationId?: string | null;
  userId?: string | null;
  status?: "planning" | "generating" | "done";
  onStart?: () => void;
}

type Stage = "plan" | "research" | "review";

export default function DocsPlanCard({
  plan,
  messageId,
  conversationId,
  userId,
  status = "planning",
  onStart,
}: DocsPlanCardProps) {
  const ar = false; // UI copy is English-only for a unified look
  const [sections, setSections] = useState<DocsSection[]>(() => plan.sections || []);
  const [stage, setStage] = useState<Stage>("plan");
  const [busy, setBusy] = useState<null | "research" | "review" | "start">(null);
  const [research, setResearch] = useState(plan.research);
  const [content, setContent] = useState(plan.content || []);
  const [researchStatus, setResearchStatus] = useState("");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (plan.sections?.length) setSections(plan.sections);
  }, [plan.sections]);

  const generating = status === "generating" || plan.stage === "generating";
  const done = status === "done" || plan.stage === "done";
  const locked = generating || done;

  const currentPlan = useMemo<DocsPlanState>(
    () => ({
      ...plan,
      sections,
      research,
      content,
      stage: "generating",
    }),
    [plan, sections, research, content],
  );

  const persist = (patch: Partial<DocsPlanState>) => {
    if (!messageId) return;
    void import("@/pages/chat/services/conversationApi").then(({ updateMessageMetadata }) =>
      updateMessageMetadata(messageId, {
        kind: "docsPlan",
        docsPlan: { ...plan, sections, research, content, ...patch },
      }).catch(() => {}),
    );
  };

  // ── Step 1: plan editing ────────────────────────────────────────────────
  const updateTitle = (i: number, value: string) =>
    setSections((prev) => prev.map((s, idx) => (idx === i ? { ...s, title: value } : s)));
  const updatePoint = (i: number, j: number, value: string) =>
    setSections((prev) =>
      prev.map((s, idx) =>
        idx === i ? { ...s, points: s.points.map((p, k) => (k === j ? value : p)) } : s,
      ),
    );
  const addPoint = (i: number) =>
    setSections((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, points: [...(s.points || []), ""] } : s)),
    );
  const removePoint = (i: number, j: number) =>
    setSections((prev) =>
      prev.map((s, idx) =>
        idx === i ? { ...s, points: s.points.filter((_, k) => k !== j) } : s,
      ),
    );
  const addSection = () => setSections((prev) => [...prev, { title: "", points: [] }]);
  const removeSection = (i: number) => setSections((prev) => prev.filter((_, idx) => idx !== i));

  // ── Step 2: deep research ───────────────────────────────────────────────
  const runResearch = async () => {
    if (busy) return;
    setBusy("research");
    setResearchStatus("Starting research…");
    try {
      const { runDeepResearchTool } = await import("@/lib/research/deepResearchTool");
      const jobId = crypto.randomUUID();
      setResearch({ jobId, status: "searching" });
      let summary = "";
      let sources: { title: string; url: string }[] = [];
      summary = await runDeepResearchTool({
        query: plan.topic,
        context: plan.sourceText,
        depth: "ultra",
        onStatus: (value) => mounted.current && setResearchStatus(value),
        onSources: (value) => {
          sources = value.slice(0, 12).map(({ title, url }) => ({ title, url }));
        },
      });
      if (!mounted.current) return;
      setResearch({ jobId, status: "succeeded", summary, sources });
      persist({ research: { jobId, status: "succeeded", summary, sources } });
      // Re-plan the outline with the fresh findings.
      const { generateDocsOutline } = await import("@/lib/docs/generatePlan");
      const next = await generateDocsOutline({
        topic: plan.topic,
        docType: plan.docType,
        language: "en",
        userId: userId || undefined,
        sourceText: plan.sourceText,
        researchText: summary,
        sectionCount: sections.length || 6,
      });
      if (next?.sections?.length && mounted.current) setSections(next.sections);
      setStage("research");
    } catch (e: any) {
      toast.error(e?.message || ("Could not run research"));
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  // ── Step 3: review the written content ──────────────────────────────────
  const runReview = async () => {
    if (busy) return;
    setBusy("review");
    try {
      const { generateDocsContent } = await import("@/lib/docs/generatePlan");
      const written = await generateDocsContent({
        sections,
        topic: plan.topic,
        docType: plan.docType,
        language: "en",
        userId: userId || undefined,
        sourceText: plan.sourceText,
        researchText: research?.summary,
        sources: research?.sources,
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
      new CustomEvent("megsy:docs-generate", { detail: { messageId, plan: currentPlan } }),
    );
    onStart?.();
  };

  const t = {
    plan: "Plan",
    research: "Deep research",
    review: "Review content",
    generate: "Write document",
    addSection: "Add section",
    addPoint: "Add point",
  };

  return (
    <ToolCard
      title={"Document plan"}
      subtitle={`${plan.docType} · ${sections.length} ${`section${sections.length === 1 ? "" : "s"}`}`}
      trailing={
        <ToolStatusBadge
          status={generating ? "running" : done ? "done" : "idle"}
          runningLabel={"Writing…"}
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

      {plan.sourceFiles?.length ? (
        <p className="mb-2 text-[11px] text-muted-foreground">
          {"Imported data: "}
          {plan.sourceFiles.map((f) => f.name).join(", ")}
        </p>
      ) : null}

      {busy === "research" && (
        <ToolLoader
          className="mb-2"
          label={researchStatus || ("Researching…")}
        />
      )}

      {research?.sources?.length ? (
        <p className="mb-2 text-[11px] text-muted-foreground">
          {"Real references: "}
          {research.sources.length}
        </p>
      ) : null}

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
                rows={5}
                onChange={(e) =>
                  setContent((prev) =>
                    prev.map((x, k) => (k === i ? { ...x, body: e.target.value } : x)),
                  )
                }
                className="w-full resize-y bg-transparent text-[12.5px] leading-relaxed text-foreground/80 outline-none"
              />
            </li>
          ))}
        </ol>
      ) : (
        <ol className="space-y-2">
          {sections.map((sec, index) => (
            <li
              key={index}
              className="rounded-ios-md border border-border/40 bg-background/40 p-3 text-sm"
            >
              <div className="mb-1.5 flex items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                  {index + 1}
                </span>
                <input
                  value={sec.title}
                  disabled={locked}
                  onChange={(e) => updateTitle(index, e.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-foreground outline-none"
                />
                {!locked && (
                  <button
                    type="button"
                    aria-label="remove section"
                    onClick={() => removeSection(index)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <span aria-hidden className="text-[13px] leading-none">×</span>
                  </button>
                )}
              </div>
              <ul className="space-y-1 ps-8">
                {sec.points?.map((point, pIndex) => (
                  <li key={pIndex} className="flex items-center gap-2">
                    <input
                      value={point}
                      disabled={locked}
                      onChange={(e) => updatePoint(index, pIndex, e.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-[12px] leading-snug text-foreground/70 outline-none"
                    />
                    {!locked && (
                      <button
                        type="button"
                        aria-label="remove point"
                        onClick={() => removePoint(index, pIndex)}
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
                      onClick={() => addPoint(index)}
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
              onClick={addSection}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/50 px-3 text-[12px] text-muted-foreground hover:text-foreground"
            >
              {t.addSection}
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
            disabled={!!busy || !sections.length}
            onClick={runReview}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/50 px-3 text-[12px] text-foreground/80 hover:text-foreground disabled:opacity-50">
            {busy === "review" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            {t.review}
          </button>
          <button
            type="button"
            disabled={!!busy || !sections.length}
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
