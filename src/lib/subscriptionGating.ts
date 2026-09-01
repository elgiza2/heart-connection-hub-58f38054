/**
 * ADVISORY UI GATING ONLY.
 *
 * These helpers decide what the interface shows or greys out. They are NOT a
 * security boundary — anyone can call the backend directly. The authoritative
 * check runs in Postgres; use `assertModelAccess` / `consumeModelUse` from
 * `@/lib/modelAccess` (RPC → `assert_model_access` / `consume_model_use`)
 * before performing any paid work.
 */
import { FREE_MODEL_IDS } from "@/lib/modelDetails";


export const PAID_PLANS = [
  "starter",
  "pro",
  "pro_plus",
  "plus",
  "elite",
  "max",
  "business",
  "team",
  "enterprise",
  "ultimate",
  "premium",
];

export const FREE_IMAGE_MODEL_IDS = [
  "megsy-image",
  "nano-banana",
  "wan2.7-image-pro",
  "wan2.7-image",
  "wan2.6-image",
  "wan2.6-t2i",
  "qwen-image",
  "z-image-turbo",
];

/**
 * Video is a paid capability: ONLY DeAPI-served video models are free.
 * Every other video model requires a paid plan and burns credits.
 */
export const FREE_VIDEO_MODEL_IDS = [
  "deapi-ltx-video",
  "deapi-ltx-2-3",
  "deapi-minimax-h3",
];

export const isFreeModel = (modelId: string): boolean => {
  const normalized = (modelId || "").toLowerCase();
  return (
    FREE_MODEL_IDS.includes(modelId) ||
    FREE_IMAGE_MODEL_IDS.includes(normalized) ||
    FREE_VIDEO_MODEL_IDS.includes(normalized) ||
    normalized.startsWith("deapi-") ||
    normalized.startsWith("megsy-lite")
  );
};

export const isPaidUser = (plan: string | null | undefined): boolean => {
  return PAID_PLANS.includes((plan || "free").toLowerCase());
};

export const canUseModel = (modelId: string, plan: string | null | undefined): boolean => {
  return isFreeModel(modelId) || isPaidUser(plan);
};

export const canUseCodeWorkspace = (plan: string | null | undefined): boolean => {
  return isPaidUser(plan);
};

// Research depths that require a paid subscription.
export const PAID_RESEARCH_DEPTHS = ["ultra2x", "ultra4x", "ultra8x"] as const;
export type PaidResearchDepth = (typeof PAID_RESEARCH_DEPTHS)[number];

export const isPaidResearchDepth = (
  depth: string | null | undefined,
): depth is PaidResearchDepth => {
  return PAID_RESEARCH_DEPTHS.includes((depth || "") as PaidResearchDepth);
};

export const canUseResearchDepth = (
  depth: string | null | undefined,
  plan: string | null | undefined,
): boolean => {
  if (!isPaidResearchDepth(depth)) return true;
  return isPaidUser(plan);
};

