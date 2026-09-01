import { markOnboardingStep } from "@/components/onboarding/OnboardingChecklist";

type AhaKey = "chat" | "image" | "doc" | "slide" | "video" | "code";

/**
 * Trigger after a successful user action. Celebratory toasts and Pro upsells
 * were removed — this now only advances the silent onboarding checklist.
 */
export const triggerAha = (
  key: AhaKey,
  _opts?: { onShare?: () => void; onUpgrade?: () => void },
) => {
  const checklistMap: Record<AhaKey, "chat" | "image" | "doc" | undefined> = {
    chat: "chat",
    image: "image",
    doc: "doc",
    slide: "doc",
    video: undefined,
    code: undefined,
  };
  const step = checklistMap[key];
  if (step) markOnboardingStep(step);
};
