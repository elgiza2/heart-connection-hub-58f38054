import { m as motion } from "framer-motion";
import { Play, Pencil, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import ToolCard from "../primitives/ToolCard";

import { ToolStatusBadge } from "../primitives/ToolStatus";

export interface MediaPlanScene {
  index: number;
  title: string;
  prompt: string;
  duration_seconds?: number;
  first_frame_url?: string;
  last_frame_url?: string;
  /** صورة مرجعية للتعديل أو للحفاظ على هوية الشخصية. */
  reference_image_url?: string;
  image_url?: string;
  /** وصف هوية الشخصية المستخدمة في هذا المشهد. */
  identity?: string;
  /** بُعد خاص بهذه اللقطة (لتوليد أكثر من بُعد لنفس الفيديو). */
  aspect_ratio?: string;
}

export interface MediaPlan {
  mode: "images" | "video";
  modelSlug: string;
  modelName: string;
  summary: string;
  scenes: MediaPlanScene[];
  estimatedTotalSeconds?: number;
  notes?: string;
  aspectRatio?: string;
  lyrics?: string;
  /** نص المستخدم الأصلي قبل تحسين "الروبوت الداخلي". */
  originalPrompt?: string;
  /** السيناريو الممتد المعروض للمستخدم قبل الموافقة (فيديو). */
  storyline?: string;
  /** وصف الشخصية/المنتج الثابت عبر كل اللقطات. */
  identity?: string;
  /** هل الخطة بUGC style؟ */
  ugc?: boolean;
  /** كل الأبعاد المولَّدة لنفس الفيديو. */
  aspectRatios?: string[];
  /** Stable turn key used to prevent duplicate generation across React remounts. */
  generationKey?: string;
}

interface Props {
  plan: MediaPlan;
  status: "awaiting" | "running" | "done" | "cancelled" | "error";
  currentSceneIndex?: number;
  onStart: () => void;
  onEditPrompt: () => void;
  errorMessage?: string;
}

export default function MediaPlanCard({
  plan,
  status,
  currentSceneIndex,
  onStart,
  onEditPrompt,
  errorMessage,
}: Props) {
  const service = plan.mode === "video" ? "video" : "images";
  const totalCount = plan.scenes.length;
  const hasGeneratedOutput = status === "running" || status === "done";

  return (
    <ToolCard
      title={plan.mode === "video" ? "Video plan" : "Image plan"}
      subtitle={plan.modelName}
      trailing={
        status === "running" || status === "done" || status === "error" ? (
          <ToolStatusBadge
            status={status === "running" ? "running" : status === "done" ? "done" : "error"}
            runningLabel="Generating…"
            doneLabel="Done"
            errorLabel="Failed"
          />
        ) : plan.estimatedTotalSeconds ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />~{plan.estimatedTotalSeconds}s
          </span>
        ) : null
      }
    >
      {plan.summary && (
        <p className="mb-3 text-sm leading-relaxed text-foreground/90">{plan.summary}</p>
      )}

      {(plan.identity || plan.ugc || (plan.aspectRatios?.length ?? 0) > 1) && (
        <div className="mb-3 space-y-2 rounded-ios-md border border-border/40 bg-background/40 p-3">
          {plan.identity && (
            <div className="text-[12px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground/85">Consistent character / product: </span>
              {plan.identity}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {plan.ugc && (
              <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10.5px]">UGC</span>
            )}
            {(plan.aspectRatios ?? []).map((a) => (
              <span key={a} className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10.5px]">
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      {hasGeneratedOutput ? (
        <ol className="mb-3 space-y-2">
          {plan.scenes.map((s) => {
            const active = status === "running" && currentSceneIndex === s.index;
            const done =
              (status === "running" &&
                typeof currentSceneIndex === "number" &&
                s.index < currentSceneIndex) ||
              status === "done";
            return (
              <li
                key={s.index}
                className={
                  "rounded-ios-md border border-border/40 bg-background/40 p-3 text-sm transition-colors " +
                  (active
                    ? "ring-1 ring-primary/60 bg-primary/5"
                    : done
                      ? "ring-1 ring-emerald-500/40 bg-emerald-500/5"
                      : "")
                }
              >
                <div className="mb-1 flex items-center gap-2.5">
                  <span
                    className={
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold " +
                      (done || active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground")
                    }
                  >
                    {s.index}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.title}</span>
                  {s.duration_seconds && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {s.duration_seconds}s
                    </span>
                  )}
                </div>
                <p className="text-[12px] leading-snug text-foreground/70 ps-8">{s.prompt}</p>
              </li>
            );
          })}
        </ol>
      ) : null}

      {plan.notes && (
        <p className="mb-3 text-[11px] italic text-muted-foreground">{plan.notes}</p>
      )}

      {status === "awaiting" && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onStart} className="gap-1.5">
            <Play className="h-3.5 w-3.5" />
            Generate {totalCount}{" "}
            {plan.mode === "video"
              ? totalCount === 1
                ? "scene"
                : "scenes"
              : totalCount === 1
                ? "image"
                : "images"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onEditPrompt} className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" />
            Edit prompt
          </Button>
        </div>
      )}

      {status === "running" && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-xs text-foreground">
            <span className="inline-flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              Generating {currentSceneIndex ?? 1} of {totalCount}…
            </span>
            <span className="text-muted-foreground">
              {Math.round((((currentSceneIndex ?? 1) - 1) / totalCount) * 100)}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={{ width: 0 }}
              animate={{
                width: `${(((currentSceneIndex ?? 1) - 1) / totalCount) * 100}%`,
              }}
              transition={{ type: "spring", stiffness: 120, damping: 22 }}
            />
          </div>
        </div>
      )}

      {status === "done" && (
        <div className="pt-1 text-xs text-muted-foreground">All outputs are ready.</div>
      )}
      {status === "cancelled" && (
        <div className="pt-1 text-xs text-muted-foreground">Cancelled</div>
      )}
      {status === "error" && (
        <div className="rounded-ios-sm border border-destructive/30 bg-destructive/5 p-2 text-[12px] text-destructive">
          {errorMessage || "Generation failed — try editing the prompt."}
        </div>
      )}
    </ToolCard>
  );
}
