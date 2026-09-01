// Centralized model details — descriptions, capabilities, modes, and requirements
// Image/Video models are now fully dynamic via admin bot. Only chat models are hardcoded.

export type ModelType =
  | "chat"
  | "image"
  | "image-tool"
  | "video"
  | "video-i2v"
  | "video-avatar"
  | "video-effect"
  | "video-motion";

export interface ModelDetail {
  id: string;
  name: string;
  type: ModelType;
  credits: number;
  description: string;
  longDescription: string;
  icon: string;
  modes: string[];
  acceptsImages: boolean;
  requiresImage: boolean;
  maxImages: number;
  acceptedMimeTypes: string[];
  inputLabels?: string[];
  resolutions?: string[];
  notes?: string;
  provider: string;
  speed?: "fast" | "standard" | "slow";
  quality?: "standard" | "high" | "ultra";
  customization?: Record<string, any>;
  iconUrl?: string;
  badges?: string[];
  isFree?: boolean;
  // DB-driven capability fields (populated when the model is sourced from
  // fal_image_models / fal_video_models in useDynamicModels).
  slug?: string;
  supportedAspects?: string[];
  supportedResolutions?: string[];
  supportedDurations?: number[];
  defaultAspect?: string;
  defaultResolution?: string;
  defaultDuration?: number;
  supportsStartEndFrame?: boolean;
  supportsMultiImage?: boolean;
  supportsAudio?: boolean;
  unit?: "image" | "megapixel" | "second" | "video";
  creditsPerSecond?: number | null;
  creditsPerVideo?: number | null;
  isPremium?: boolean;
  isNew?: boolean;
  isFeatured?: boolean;
  thumbnailUrl?: string | null;
}

const MIME_IMG = ["image/jpeg", "image/png", "image/webp"];

// Provider logo helpers (served from /public/model-logos/)
const LOGO = {
  fal: "/model-logos/fal.ico",
  google: "/model-logos/google.ico",
  openai: "/model-logos/openai.svg",
  bfl: "/model-logos/bfl.webp",
  bytedance: "/model-logos/bytedance.ico",
  ideogram: "/model-logos/ideogram.webp",
  kling: "/model-logos/kling.webp",
  luma: "/model-logos/luma.webp",
  pika: "/model-logos/pika.webp",
  recraft: "/model-logos/recraft.webp",
  nanoBanana: "/model-logos/nano-banana.webp",
  megsy: "/model-logos/megsy.png",
  minimax: "/model-logos/minimax.webp",
  runway: "/model-logos/runway.webp",
  qwen: "/model-logos/qwen.webp",
  hidream: "/model-logos/hidream.webp",
  stability: "/model-logos/stability.webp",
  playground: "/model-logos/playground.webp",
  lightricks: "/model-logos/lightricks.webp",
} as const;

export const FREE_MODEL_IDS: string[] = [];

export const ALL_MODEL_DETAILS: ModelDetail[] = [
  // ═══════════════════════════════════════════
  // CHAT MODELS — Megsy Tier System
  // ═══════════════════════════════════════════
  {
    id: "megsy-lite",
    name: "Megsy Lite",
    type: "chat",
    credits: 0,
    description: "Fast free chat for everyday tasks.",
    longDescription:
      "Megsy's fast default chat tier for everyday questions, summaries and drafting. Backend routing can change as the live model stack is upgraded.",
    icon: "Zap",
    modes: ["text-to-text", "multimodal"],
    acceptsImages: false,
    requiresImage: false,
    maxImages: 0,
    acceptedMimeTypes: [],
    provider: "Megsy",
    speed: "fast",
    quality: "high",
    isFree: true,
    badges: ["FREE", "FAST"],
  },
  {
    id: "megsy-pro",
    name: "Megsy Pro",
    type: "chat",
    credits: 0,
    description: "Balanced Megsy chat tier for harder work.",
    longDescription:
      "Megsy Pro routes to stronger live chat capacity for longer, more complex prompts. Exact upstream models are managed server-side and can change without UI drift.",
    icon: "Brain",
    modes: ["text-to-text", "multimodal"],
    acceptsImages: false,
    requiresImage: false,
    maxImages: 0,
    acceptedMimeTypes: [],
    provider: "Megsy",
    speed: "fast",
    quality: "ultra",
    badges: ["1T", "BALANCED"],
  },
  {
    id: "megsy-max",
    name: "Megsy Max",
    type: "chat",
    credits: 0,
    description: "Highest Megsy chat tier for deep reasoning.",
    longDescription:
      "Megsy Max prioritizes the strongest live reasoning route available for analysis, coding, math and multi-step problem solving.",
    icon: "Sparkles",
    modes: ["text-to-text", "multimodal"],
    acceptsImages: false,
    requiresImage: false,
    maxImages: 0,
    acceptedMimeTypes: [],
    provider: "Megsy",
    speed: "standard",
    quality: "ultra",
    badges: ["1T", "THINKING"],
  },
  {
    id: "megsy-research",
    name: "Megsy Research",
    type: "chat",
    credits: 0,
    description: "Deep research with source-aware synthesis.",
    longDescription:
      "Megsy Research plans, gathers and synthesizes long-form answers with citations where available. Live backend routing is kept server-side for accuracy.",
    icon: "BookOpen",
    modes: ["text-to-text"],
    acceptsImages: false,
    requiresImage: false,
    maxImages: 0,
    acceptedMimeTypes: [],
    provider: "Megsy",
    speed: "standard",
    quality: "ultra",
    badges: ["RESEARCH", "LONG-OUTPUT"],
  },
  {
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    type: "chat",
    credits: 0,
    description: "Anthropic's flagship Sonnet for nuanced reasoning and coding.",
    longDescription:
      "Claude Sonnet 5 is Anthropic's flagship balanced model — strong at nuanced reasoning, long-context analysis, writing and code.",
    icon: "Sparkles",
    modes: ["text-to-text", "multimodal"],
    acceptsImages: true,
    requiresImage: false,
    maxImages: 4,
    acceptedMimeTypes: MIME_IMG,
    provider: "Anthropic",
    speed: "standard",
    quality: "ultra",
    iconUrl: "/model-logos/anthropic.webp",
    badges: ["NEW", "PRO"],
  },
  {
    id: "kimi-3",
    name: "Kimi 3",
    type: "chat",
    credits: 0,
    description: "Moonshot's long-context Kimi 3 for research and code.",
    longDescription:
      "Kimi 3 from Moonshot AI — massive context window, tuned for research, long documents, and multilingual reasoning.",
    icon: "BookOpen",
    modes: ["text-to-text", "multimodal"],
    acceptsImages: true,
    requiresImage: false,
    maxImages: 4,
    acceptedMimeTypes: MIME_IMG,
    provider: "Moonshot",
    speed: "standard",
    quality: "ultra",
    iconUrl: "/model-logos/moonshot.webp",
    badges: ["NEW", "LONG-CONTEXT"],
  },
  {
    id: "glm-5-3",
    name: "GLM 5.3",
    type: "chat",
    credits: 0,
    description: "Zhipu's GLM 5.3 — fast bilingual reasoning and tools.",
    longDescription:
      "GLM 5.3 from Zhipu AI — fast bilingual (中/英) reasoning with strong tool use and coding performance.",
    icon: "Brain",
    modes: ["text-to-text", "multimodal"],
    acceptsImages: true,
    requiresImage: false,
    maxImages: 4,
    acceptedMimeTypes: MIME_IMG,
    provider: "Zhipu",
    speed: "fast",
    quality: "ultra",
    iconUrl: "/model-logos/zhipu.webp",
    badges: ["NEW"],
  },

  // ═══════════════════════════════════════════
  // IMAGE & VIDEO MODELS — Now fully dynamic from DB
  // (loaded via useDynamicModels from image_models / video_models tables)
  // Only CHAT models are hardcoded above.
  // ═══════════════════════════════════════════
];

// Helper getters
export const getModelDetail = (id: string): ModelDetail | undefined =>
  ALL_MODEL_DETAILS.find((m) => m.id === id);

export const getModelsByType = (type: ModelType): ModelDetail[] =>
  ALL_MODEL_DETAILS.filter((m) => m.type === type);

export const getChatModels = () => getModelsByType("chat");
export const getImageGenerationModels = () => getModelsByType("image");
export const getImageToolModels = () => getModelsByType("image-tool");
export const getVideoGenerationModels = () => getModelsByType("video");
export const getVideoI2VModels = () => getModelsByType("video-i2v");
export const getVideoAvatarModels = () => getModelsByType("video-avatar");

// Legacy dedup list — kept empty after model list was deduped in source.
export const HIDDEN_DUPLICATE_IDS: string[] = [];
