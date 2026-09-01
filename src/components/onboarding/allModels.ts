/**
 * Real models available in Megsy — chat models come from the composer menu,
 * image/video models mirror the active rows in the models tables.
 */
export type OnboardingModel = { name: string; provider: string };

export const CHAT_MODELS: OnboardingModel[] = [
  { name: "Megsy 3.9", provider: "megsy" },
  { name: "GPT Sol", provider: "openai" },
  { name: "Claude Sonnet 5", provider: "anthropic" },
  { name: "Claude Opus 4.8", provider: "anthropic" },
  { name: "Gemini 3 Pro", provider: "google" },
  { name: "GLM 5.3", provider: "zhipu" },
  { name: "Kimi K3", provider: "moonshot" },
];

export const IMAGE_MODELS: OnboardingModel[] = [
  { name: "Nano Banana Pro", provider: "google" },
  { name: "Nano Banana 2", provider: "google" },
  { name: "Seedream 4.5", provider: "bytedance" },
  { name: "Seedream 5 Lite", provider: "bytedance" },
  { name: "GPT Image 2", provider: "openai" },
  { name: "GPT Image 1.5", provider: "openai" },
  { name: "FLUX.2 Klein", provider: "black forest labs" },
  { name: "FLUX Schnell", provider: "black forest labs" },
  { name: "Wan 2.5", provider: "alibaba" },
];

export const VIDEO_MODELS: OnboardingModel[] = [
  { name: "Veo 3.1", provider: "google" },
  { name: "Sora 2", provider: "openai" },
  { name: "Kling 3.0", provider: "kling" },
  { name: "Seedance 2.0", provider: "bytedance" },
  { name: "Hailuo 2.3", provider: "minimax" },
  { name: "Runway Gen-4.5", provider: "runway" },
  { name: "Luma Ray 3", provider: "luma" },
  { name: "Pika 2.5", provider: "pika" },
  { name: "Grok Video", provider: "xai" },
];

export const ALL_MODELS_COUNT =
  CHAT_MODELS.length + IMAGE_MODELS.length + VIDEO_MODELS.length;

export const MODEL_ROWS: OnboardingModel[][] = [
  CHAT_MODELS.slice(0, 2),
  CHAT_MODELS.slice(2, 4),
  CHAT_MODELS.slice(4, 7),
  IMAGE_MODELS.slice(0, 3),
  IMAGE_MODELS.slice(3, 6),
  IMAGE_MODELS.slice(6, 9),
  VIDEO_MODELS.slice(0, 3),
  VIDEO_MODELS.slice(3, 6),
  VIDEO_MODELS.slice(6, 9),
];
