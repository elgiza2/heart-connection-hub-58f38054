import { PLANS } from "@/data/pricingData";

export type WorkspacePaidPlan = "starter" | "pro" | "elite" | "business";

export interface WorkspacePlanOption {
  id: WorkspacePaidPlan | "free";
  name: string;
  monthlyPrice: number;
  yearlyPrice?: number;
  tagline: string;
  perks: string[];
  creditsLabel?: string;
}

export const WORKSPACE_PRODUCT_MAP: Record<WorkspacePaidPlan, { monthly: string; yearly: string }> =
  {
    starter: {
      monthly: "pdt_0NfOHJoiT8SDfibwKrYkd",
      yearly: "pdt_0NfOI5bIL4ENBrcV8JEvM",
    },
    pro: {
      monthly: "pdt_0NfOIP9Cjs7MnsYwuOHA5",
      yearly: "pdt_0NfOIbGR12Bk6zmVhIfho",
    },
    elite: {
      monthly: "pdt_0NfOIsOWsAjKTv5MycEUK",
      yearly: "pdt_0NfOJ0bn0DYGJudz1v5dO",
    },
    business: {
      monthly: "pdt_0NfOJ8SCeVWcmpoJtiHaX",
      yearly: "pdt_0NfOJHY75Ky5FtnhU3ZPL",
    },
  };

// Two paid plans only (Pro + Max). Prices and perks come from pricingData so
// the workspace picker can never drift from the /pricing page.
export const WORKSPACE_PLANS: WorkspacePlanOption[] = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    tagline: "Basic shared space to get started",
    creditsLabel: "No subscription",
    perks: ["3 members", "Megsy Lite chat", "Personal use or small team"],
  },
  ...PLANS.map<WorkspacePlanOption>((plan) => ({
    id: plan.tier as WorkspacePaidPlan,
    name: plan.name,
    monthlyPrice: plan.monthlyPrice,
    yearlyPrice: plan.yearlyPrice,
    tagline:
      plan.firstMonthPrice != null
        ? `First month $${plan.firstMonthPrice}, then $${plan.monthlyPrice}/month`
        : `$${plan.monthlyPrice}/month`,
    creditsLabel: plan.monthlyCredits,
    perks: plan.features.slice(0, 5),
  })),
];

export function isWorkspacePaidPlan(plan: string | null | undefined): plan is WorkspacePaidPlan {
  return plan === "starter" || plan === "pro" || plan === "elite" || plan === "business";
}
