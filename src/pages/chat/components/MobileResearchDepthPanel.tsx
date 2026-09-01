import { Check, Lock } from "lucide-react";
import { m as motion } from "framer-motion";
import { toast } from "sonner";
import { promptUpgrade } from "@/lib/upgradeMoment";
import type { ResearchDepth } from "../hooks/useChatTier";
import { isPaidUser } from "@/lib/subscriptionGating";

interface Props {
  researchDepth: ResearchDepth;
  setResearchDepth: (d: ResearchDepth) => void;
  userPlan: string | null | undefined;
  onSelect?: () => void;
}

const DEPTH_OPTIONS: {
  id: ResearchDepth;
  label: string;
  description: string;
  pro?: boolean;
}[] = [
  { id: "pro", label: "Pro", description: "Exploratory · 2–10 min" },
  { id: "ultra", label: "Ultra", description: "Recommended · 5–25 min" },
  { id: "ultra2x", label: "Ultra 2x", description: "2x compute · 5–50 min", pro: true },
  { id: "ultra4x", label: "Ultra 4x", description: "4x compute · 5–90 min", pro: true },
  { id: "ultra8x", label: "Ultra 8x", description: "8x compute · up to 2 hr", pro: true },
];

export function MobileResearchDepthPanel({ researchDepth, setResearchDepth, userPlan, onSelect }: Props) {
  const paid = isPaidUser(userPlan);
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <div className="overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.03]">
        {DEPTH_OPTIONS.map(({ id, label, description, pro }) => {
          const active = researchDepth === id;
          const locked = !!pro && !paid;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                if (locked) {
                  promptUpgrade(label);
                  return;
                }
                setResearchDepth(id);
                onSelect?.();
              }}
              className={`flex w-full items-center gap-3 px-4 py-3.5 text-start border-t border-foreground/[0.05] first:border-t-0 transition-colors ${active ? "bg-foreground/[0.04]" : "hover:bg-foreground/[0.02]"}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-foreground">{label}</span>
                <span className="mt-0.5 block text-[12px] text-foreground/50">{description}</span>
              </span>
              {locked ? (
                <Lock className="h-4 w-4 shrink-0 text-foreground/65" />
              ) : active ? (
                <Check className="h-5 w-5 shrink-0" strokeWidth={2.75} style={{ color: "var(--megsy-blue)" }} />
              ) : (
                <span className="h-5 w-5 shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
