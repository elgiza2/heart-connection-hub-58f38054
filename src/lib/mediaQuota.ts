/**
 * Media generation policy (UI-advisory only — the server re-validates).
 *
 * Images: unlimited on every paid plan (and on the free DeAPI models).
 * Video:  metered. Every premium video model costs MC from the monthly
 *         balance, and each plan gets a soft monthly video allowance.
 *         DeAPI-served video models stay unlimited and cost nothing.
 */

export type MediaPlanTier = "free" | "pro" | "elite";

/** DeAPI-served models are free & unlimited (images and video alike). */
export function isUnlimitedMediaModel(model: {
  slug?: string;
  id?: string;
  provider?: string;
  name?: string;
  credits?: number;
}): boolean {
  const key = `${model?.slug || model?.id || ""} ${model?.provider || ""} ${model?.name || ""}`;
  return /deapi/i.test(key);
}

/** Images never consume the video allowance — they are unlimited. */
export const IMAGES_UNLIMITED = true;

/** Soft monthly video allowance per plan (premium video models only). */
export const VIDEO_MONTHLY_ALLOWANCE: Record<MediaPlanTier, number> = {
  free: 0,
  pro: 40,
  elite: 120,
};

export function normalizeMediaPlan(plan: string | null | undefined): MediaPlanTier {
  const p = (plan || "free").toLowerCase();
  if (["elite", "max", "business", "team", "enterprise", "ultimate"].includes(p)) return "elite";
  if (["pro", "plus", "pro_plus", "premium", "starter"].includes(p)) return "pro";
  return "free";
}

/** Fallback MC cost for a premium video model with no explicit price row. */
export const DEFAULT_VIDEO_CREDIT_COST = 10;

/** MC cost shown on a media model card. 0 means free/unlimited. */
export function mediaModelCost(model: { credits?: number }, unlimited: boolean): number {
  return unlimited ? 0 : Number(model?.credits || 0);
}

/** Short badge label for a media model card. */
export function mediaModelBadge(
  model: { slug?: string; id?: string; provider?: string; name?: string; credits?: number },
  kind: "image" | "video",
): string {
  if (isUnlimitedMediaModel(model)) return "Unlimited";
  if (kind === "image") return "Unlimited";
  // Paid video model: always price it, never show it as included.
  const cost = Number(model?.credits || 0) || DEFAULT_VIDEO_CREDIT_COST;
  return `${cost} MC`;
}
