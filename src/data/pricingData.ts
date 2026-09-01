// =====================================================================
// CENTRALIZED PRICING DATA — single source of truth for plans, prices,
// intro offers, services, FAQs and enterprise features.
// Imported by /pricing (desktop + mobile), workspace plans, and the
// support chat knowledge base so they NEVER drift apart.
//
// Pricing model (clean, two paid plans):
//   Pro  $20 / month  · first month $7  · $160 / year (4 months free)
//   Max  $40 / month  · first month $17 · $320 / year (4 months free)
// =====================================================================

export type PlanTier = "starter" | "pro" | "elite" | "business";

/** Monthly Megsy Credits included with each tier. */
export const PLAN_MONTHLY_CREDITS: Record<PlanTier, number> = {
  starter: 70,
  pro: 240,
  elite: 600,
  business: 1200,
};

/**
 * Retention offer shown right after the first successful payment:
 * "Take your second month for $7 too" with a Pay now button.
 */
export const SECOND_MONTH_OFFER = {
  enabled: true,
  price: 7,
  /** Hours the offer stays claimable after the first payment. */
  windowHours: 48,
  titleEn: "Your second month for $7",
  bodyEn:
    "You just unlocked Pro. Lock in month two at the same $7 intro price — pay now and you are covered for two full months.",
  ctaEn: "Pay $7 now",
} as const;

export interface PlanCardConfig {
  tier: PlanTier;
  name: string;
  label?: string;
  bg: string;
  text: string;
  subText: string;
  /** Standard recurring monthly price. */
  monthlyPrice: number;
  /** Yearly price = 8 × monthly (4 months free). */
  yearlyPrice: number;
  /** Promotional first-month price. */
  firstMonthPrice?: number;
  monthlyCredits: string;
  yearlyCredits: string;
  features: string[];
  monthlyFeatures?: string[];
  yearlyFeatures?: string[];
  ctaBg: string;
  ctaText: string;
  ctaHover: string;
  bubbleColor: string;
  topBadge?: boolean;
  glow?: string;
  isDark?: boolean;
}

// Specs are written in a fixed order so Pro and Max read as the same list
// with different numbers, and the headline capabilities come first:
// cloud computer → long-running tasks → agents → research → chat →
// images/video → docs & build → workspace → support.
const PRO_FEATURES = [
  "Cloud Computer — Megsy operates a real browser and desktop for you",
  "Long-running tasks up to 4 hours, continue while you are offline",
  "3 background agents working in parallel",
  "Deep Research with citation-backed reports",
  "Unlimited chat with every flagship model",
  "Unlimited image generation — no caps, no credits",
  `Up to 40 premium videos a month (${PLAN_MONTHLY_CREDITS.pro} MC)`,
  "Docs, Slides & Megsy Coder — export, build and deploy",
  "Team workspace with shared projects and files",
  "Priority support · cancel anytime",
];

const MAX_FEATURES = [
  "Cloud Computer with longer sessions and parallel machines",
  "Long-running tasks up to 12 hours with automatic recovery",
  "Unlimited parallel background agents",
  "Deep Research at Ultra depth — longer, deeper report runs",
  "Everything in Pro, without daily limits",
  "Unlimited image generation — no caps, no credits",
  `Up to 120 premium videos a month (${PLAN_MONTHLY_CREDITS.elite} MC)`,
  "Priority compute lane — up to 3× faster runs",
  "Larger uploads, longer context and usage analytics",
  "24/7 priority support · cancel anytime",
];


/** Yearly = 8 × monthly, i.e. 4 months free. */
export const YEARLY_FREE_MONTHS = 4;

const yearlyIntro = (savings: number, bonus: number) => [
  `Save $${savings} a year — ${YEARLY_FREE_MONTHS} months free`,
  `+${bonus.toLocaleString("en-US")} bonus MC delivered upfront`,
  "Price locked for 12 months",
];

export const PLANS: PlanCardConfig[] = [
  {
    tier: "pro",
    name: "Megsy Pro",
    label: "",
    bg: "linear-gradient(165deg, #1e64ff 0%, #2563eb 55%, #1d4fd8 100%)",
    text: "#ffffff",
    subText: "rgba(255, 255, 255, 0.78)",
    monthlyPrice: 20,
    yearlyPrice: 160,
    firstMonthPrice: 7,

    monthlyCredits: `${PLAN_MONTHLY_CREDITS.pro} MC / month`,
    yearlyCredits: "Save $80 + 720 bonus MC",
    features: PRO_FEATURES,
    monthlyFeatures: PRO_FEATURES,
    yearlyFeatures: [...yearlyIntro(80, 720), ...PRO_FEATURES.slice(0, 7)],

    ctaBg: "#0b1020",
    ctaText: "#ffffff",
    ctaHover: "#15203f",
    bubbleColor: "rgba(147, 197, 253, 0.45)",
    isDark: true,
  },
  {
    tier: "elite",
    name: "Max",
    bg: "linear-gradient(165deg, #8b5cf6 0%, #7c3aed 55%, #6d28d9 100%)",
    text: "#ffffff",
    subText: "rgba(255, 255, 255, 0.78)",
    monthlyPrice: 40,
    yearlyPrice: 320,
    firstMonthPrice: 17,

    monthlyCredits: `${PLAN_MONTHLY_CREDITS.elite} MC / month`,
    yearlyCredits: "Save $160 + 1,800 bonus MC",
    features: MAX_FEATURES,
    monthlyFeatures: MAX_FEATURES,
    yearlyFeatures: [...yearlyIntro(160, 1800), ...MAX_FEATURES.slice(0, 7)],

    ctaBg: "#0b0420",
    ctaText: "#ffffff",
    ctaHover: "#1a0a3a",
    bubbleColor: "rgba(216, 180, 254, 0.45)",
    topBadge: true,
    isDark: true,
  },
];

/** Short benefit lines used by the compact mobile pricing screen. */
export const PLAN_HIGHLIGHTS: Record<"pro" | "max", string[]> = {
  pro: PRO_FEATURES.slice(0, 5),
  max: MAX_FEATURES.slice(0, 5),
};

/**
 * Retention (save) offer shown when a subscriber starts the cancel flow:
 * 50% off for two months, or pause the subscription instead of cancelling.
 */
export const SAVE_OFFER = {
  enabled: true,
  discountPercent: 50,
  months: 2,
  pauseMonths: [1, 2, 3] as const,
  titleEn: "Before you cancel — keep it for half price",
  bodyEn:
    "Take 50% off your next 2 months, or pause your plan and keep everything exactly where you left it.",
  discountCtaEn: "Claim 50% off for 2 months",
  pauseCtaEn: "Pause instead",
} as const;

/** Half-price amount for the save offer, per plan tier. */
export const saveOfferPrice = (monthlyPrice: number) =>
  Math.round((monthlyPrice * (100 - SAVE_OFFER.discountPercent)) / 100);


export const getPlan = (tier: PlanTier) => PLANS.find((p) => p.tier === tier);

/**
 * Price actually charged today, plus the crossed-out reference price.
 * Monthly uses the intro (first month) price when the plan has one;
 * yearly uses the yearly price against 12× monthly.
 */
export function getDisplayPrice(plan: PlanCardConfig, yearly: boolean) {
  if (yearly) {
    const reference = plan.monthlyPrice * 12;
    return {
      price: plan.yearlyPrice,
      strike: reference,
      isIntro: false,
      discountLabel: `Save $${reference - plan.yearlyPrice}`,
      unit: "year" as const,
    };
  }
  const intro = plan.firstMonthPrice;
  if (intro && intro < plan.monthlyPrice) {
    return {
      price: intro,
      strike: plan.monthlyPrice,
      isIntro: true,
      discountLabel: `${Math.round((1 - intro / plan.monthlyPrice) * 100)}% Off`,
      unit: "1st mo" as const,
    };
  }
  return {
    price: plan.monthlyPrice,
    strike: plan.monthlyPrice,
    isIntro: false,
    discountLabel: "",
    unit: "month" as const,
  };
}

export const ENTERPRISE_FEATURES: string[] = [
  "Custom MC Allocation",
  "Priority Megsy AI compute lane",
  "Dedicated Infrastructure",
  "SLA Guarantees",
  "Custom API Access & Integrations",
  "Enterprise Security (SOC2-ready, GDPR & Advanced Encryption)",
  "Data Privacy & Compliance",
  "Early access to new Megsy capabilities",
  "Advanced Analytics & Reporting",
  "Dedicated Account Manager",
  "24/7 Priority Support",
  "Priority Onboarding & Training",
  "Monthly Business Reviews",
  "Volume Discounts",
  "Custom Contract, Invoicing & Billing",
];

export const SERVICES_GUIDE: { name: string; desc: string }[] = [
  {
    name: "Cloud Computer",
    desc: "Megsy drives a real cloud browser and desktop — it clicks, types, fills forms, downloads files and finishes the job while you watch. Included on Pro; Max gets longer sessions and parallel machines.",
  },
  {
    name: "Long-Running Tasks",
    desc: "Hand over work that takes hours. Tasks keep running after you close the app and pick up where they stopped — up to 4 hours on Pro and 12 hours on Max, with automatic recovery.",
  },
  {
    name: "Background Agents",
    desc: "Agents work in parallel on separate jobs and report back when done. 3 in parallel on Pro, unlimited on Max.",
  },
  {
    name: "Unlimited Chat",
    desc: "Talk to Megsy AI with every flagship model and no daily caps on Pro and Max. The free plan uses Megsy Lite.",
  },
  {
    name: "Image Generation",
    desc: "Generate high-quality images on any paid plan. Images draw from your monthly MC balance.",
  },
  {
    name: "Slides & Presentations",
    desc: "Create complete, editable decks from a prompt and export to PPTX or PDF. Free plan: 3 / day.",
  },
  {
    name: "Docs & Deep Research",
    desc: "Long-form documents and multi-source research reports with citations. Free plan: 3 of each per day.",
  },
  {
    name: "Megsy Coder",
    desc: "Build full apps and websites in natural language with one-click deploy. Included on every paid plan.",
  },
  {
    name: "Video Generation",
    desc: "Premium video models use MC from your monthly balance — about 40 videos on Pro and 120 on Max. DeAPI video models are always free and unlimited.",
  },
  {
    name: "Megsy OS",
    desc: "Your autonomous 24/7 agent. Runs tasks, monitors projects and executes multi-step work in the background.",
  },
  {
    name: "Megsy Credits (MC)",
    desc: "Image generation is unlimited. MC is spent on premium video and premium model runs only, and refreshes at the start of each billing cycle."
      ,
  },
  {
    name: "Team Workspace",
    desc: "Shared projects, files and chats for your team — included on Pro and Max.",
  },
  {
    name: "Priority Queue",
    desc: "Max gets a priority compute lane with up to 3× faster generations.",
  },
];

export const FAQS: { q: string; a: string }[] = [
  {
    q: "How does the $7 first month work?",
    a: "Your first month of Pro is $7 instead of $20 (Max is $17 instead of $40). Right after your payment clears we offer you a second month at the same intro price — one tap on Pay now and you are covered for two full months. After that, the plan renews at its standard monthly price and you can cancel anytime.",
  },
  {
    q: "Can I change or cancel my plan anytime?",
    a: "Yes. From Billing settings you can upgrade, downgrade or cancel anytime. Upgrades are prorated and take effect immediately; downgrades and cancellations take effect at the end of the current cycle, and you keep full access until then.",
  },
  {
    q: "What are Megsy Credits (MC)?",
    a: "Chat and image generation are unlimited on every paid plan. MC is a separate monthly balance used for premium video generation and premium model runs — 240 MC on Pro (about 40 videos) and 600 MC on Max (about 120 videos). DeAPI video models never cost MC.",
  },
  {
    q: "What happens when I run out of MC?",
    a: "Chat, images, docs, slides and research stay available — images are always unlimited, and free DeAPI video models keep working. Only premium video and premium model runs need MC, so you can top up anytime from Billing or wait for your next renewal.",
  },
  {
    q: "Do unused credits roll over?",
    a: "No. Monthly MC reset at the start of each cycle. Yearly plans get bonus MC delivered upfront (Pro +720, Max +1,800) on top of four months free.",
  },
  {
    q: "Do prices include tax?",
    a: "Prices are shown excluding tax. VAT/GST is calculated at checkout based on your billing country and shown before you confirm.",
  },
  {
    q: "Do you offer refunds?",
    a: "Yes — new paid subscriptions include a 7-day no-questions-asked refund window, provided no more than 10% of your included credits have been consumed. Credit packs are non-refundable once any credit has been spent. Failed generations are auto-refunded within minutes. Email support@megsyai.com (subject: \"Refund Request\") and we respond within 5 business days.",
  },
  {
    q: "Is my payment secure? Which payment methods do you accept?",
    a: "All payments are processed by Dodo Payments, a PCI-DSS Level 1 merchant of record. Your card details never touch our servers. We accept Visa, Mastercard, American Express, JCB, UnionPay, Apple Pay, Google Pay, Amazon Pay and WeChat Pay, with 3-D Secure 2 on eligible transactions. Your statement will show \"DODO * MEGSY AI\".",
  },
  {
    q: "Do you offer team or enterprise plans?",
    a: "Yes. Max includes team workspaces, and for custom MC allocation, SSO, dedicated infrastructure, custom contracts or volume discounts contact our enterprise team via the Enterprise page or support@megsyai.com.",
  },
];
