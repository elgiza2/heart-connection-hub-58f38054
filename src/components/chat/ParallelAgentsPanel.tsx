import { memo, useMemo } from "react";
import { m as motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import MegsyStar from "@/components/files/MegsyStar";
import { resolveToolActivity, brandIconUrl } from "@/lib/toolActivity";
import StatusBadge from "./primitives/StatusBadge";

export interface ParallelAgentTask {
  id: string;
  name: string;
  appSlug?: string;
  target?: string;
  status: "running" | "done" | "error";
}

interface Props {
  tasks: ParallelAgentTask[];
  active?: boolean;
}

const arRe = /[\u0600-\u06ff]/;

function taskLabel(task: ParallelAgentTask, ar: boolean) {
  const meta = resolveToolActivity(task.name, task.appSlug);
  const verb = ar ? meta.ar : meta.en;
  return task.target ? `${verb} ${task.target}` : verb;
}

function iconFor(task: ParallelAgentTask) {
  const meta = resolveToolActivity(task.name, task.appSlug);
  if (meta.slug) {
    return (
      <img loading="lazy" decoding="async" src={brandIconUrl(meta.slug)} alt="" className="h-3.5 w-3.5 opacity-80 dark:invert" />
    );
  }
  return <MegsyStar size={14} static className="text-[var(--megsy-blue)]" />;
}

const ParallelAgentsPanel = ({ tasks, active = true }: Props) => {
  const visibleTasks = tasks.slice(-6);
  const isArabic = useMemo(
    () => visibleTasks.some((task) => arRe.test(`${task.target || ""} ${task.name || ""}`)),
    [visibleTasks],
  );
  if (visibleTasks.length === 0) return null;

  const running = visibleTasks.filter((task) => task.status === "running").length;
  const done = visibleTasks.filter((task) => task.status === "done").length;
  const intro = isArabic
    ? running > 1
      ? `Started ${running} tasks in parallel`
      : running === 1
        ? "Working on the task now"
        : "Tasks finished"
    : running > 1
      ? `Running ${running} tasks together`
      : running === 1
        ? "Working on this task"
        : "Tasks complete";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-3 max-w-[640px] rounded-2xl border border-border/50 bg-card/90 p-3.5 text-card-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)] dark:bg-card/70 dark:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_8px_24px_-12px_rgba(0,0,0,0.5)]"
      dir={isArabic ? "rtl" : undefined}
    >
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
          <MegsyStar size={16} className="text-[var(--megsy-blue)]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold leading-tight">{intro}</div>
          <div className="text-[11px] text-muted-foreground">
            {`${done}/${visibleTasks.length} complete`}
          </div>
        </div>
        {active && running > 0 && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      <div className="space-y-1">
        {visibleTasks.map((task) => (
          <div
            key={task.id}
            className="flex min-h-8 items-center gap-2.5 rounded-lg border border-border/40 bg-background/60 px-2.5 py-1.5 transition-colors hover:bg-background/80 dark:bg-background/30 dark:hover:bg-background/45"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center">
              {iconFor(task)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground/85">
              {taskLabel(task, isArabic)}
            </span>
            <StatusBadge status={task.status} className="shrink-0" />
          </div>
        ))}
      </div>
    </motion.div>
  );
};

export default memo(ParallelAgentsPanel);
