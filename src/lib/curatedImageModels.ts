/**
 * Curated image models that must always appear in the picker, even when the
 * backend catalogue has not been updated yet. Anything the backend already
 * returns wins — these are only merged in when the slug is missing.
 */
import type { ModelDetail } from "@/lib/modelDetails";

interface Seed {
  slug: string;
  name: string;
  provider: string;
  credits: number;
  description: string;
  badges?: string[];
  free?: boolean;
  multi?: boolean;
}

const SEEDS: Seed[] = [
  {
    slug: "deapi-flux-schnell",
    name: "Megsy Free Image",
    provider: "deapi",
    credits: 0,
    description: "Free image generation — no credits used.",
    badges: ["FREE"],
    free: true,
  },
  {
    slug: "renderful-gpt-image-2",
    name: "GPT Image 2",
    provider: "openai",
    credits: 6,
    description: "OpenAI's flagship image model — best for text inside images.",
    badges: ["PRO"],
    multi: true,
  },
  {
    slug: "renderful-nano-banana-2",
    name: "Nano Banana 2",
    provider: "google",
    credits: 7,
    description: "Gemini image model — fast, sharp, great at editing.",
    badges: ["PRO", "NEW"],
    multi: true,
  },
  {
    slug: "renderful-seedream-4-5",
    name: "Seedream 5 Lite",
    provider: "bytedance",
    credits: 4,
    description: "ByteDance Seedream 5 — photoreal detail at high resolution.",
    badges: ["PRO", "NEW"],
    multi: true,
  },
  {
    slug: "renderful-grok-imagine-image",
    name: "Grok Image",
    provider: "xai",
    credits: 6,
    description: "xAI's image model — bold, illustrative results.",
    badges: ["PRO"],
    multi: true,
  },
];

const toDetail = (s: Seed): ModelDetail =>
  ({
    id: s.slug,
    slug: s.slug,
    name: s.name,
    type: "image",
    credits: s.credits,
    description: s.description,
    longDescription: s.description,
    icon: "Image",
    modes: s.multi ? ["text-to-image", "image-to-image"] : ["text-to-image"],
    acceptsImages: !!s.multi,
    requiresImage: false,
    maxImages: s.multi ? 4 : 0,
    acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    provider: s.provider,
    speed: "standard",
    quality: "high",
    badges: s.badges ?? [],
    supportedAspects: ["1:1", "3:4", "4:3", "9:16", "16:9"],
    supportedResolutions: ["1K", "2K"],
    defaultAspect: "1:1",
    defaultResolution: "1K",
    supportsMultiImage: !!s.multi,
    isPremium: !s.free,
    isNew: (s.badges ?? []).includes("NEW"),
    isFeatured: true,
  }) as unknown as ModelDetail;

export const CURATED_IMAGE_MODELS: ModelDetail[] = SEEDS.map(toDetail);

/** Merge curated entries into a catalogue, keeping backend rows authoritative. */
export function withCuratedImageModels(models: ModelDetail[]): ModelDetail[] {
  const have = new Set(models.map((m) => String(m.slug || m.id).toLowerCase()));
  const missing = CURATED_IMAGE_MODELS.filter((m) => !have.has(m.slug!.toLowerCase()));
  return [...models, ...missing];
}
