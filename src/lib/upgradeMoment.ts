/**
 * Value-moment upgrade prompts.
 *
 * Instead of dead-ending a free user with "this is premium only", we let them
 * reach the moment of value and then surface a contextual upgrade sheet.
 * UI only — the authoritative entitlement checks still live in the backend.
 */
export interface UpgradeMomentPayload {
  /** What the user was trying to do, e.g. "Ultra 4x research". */
  feature: string;
  /** Optional one-line explanation of what they unlock. */
  detail?: string;
}

export const UPGRADE_MOMENT_EVENT = "megsy:upgrade-moment";

export const promptUpgrade = (feature: string, detail?: string) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<UpgradeMomentPayload>(UPGRADE_MOMENT_EVENT, {
      detail: { feature, detail },
    }),
  );
};
