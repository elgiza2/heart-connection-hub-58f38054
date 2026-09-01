/**
 * Curated media-model policy.
 *
 * Image generation is intentionally limited to a small, well-understood set:
 *  - Paid flagships: Nano Banana 2 (Gemini image) and GPT Image 2
 *  - Free models served through the DeAPI provider
 *
 * Video keeps the full catalogue for now (the curated video list is coming).
 * The filters are non-destructive: if nothing matches the allowlist we fall
 * back to the full list so the picker is never empty.
 */

const IMAGE_ALLOW_PATTERNS: RegExp[] = [
  /nano[-\s_]?banana/i,
  /gemini.*image/i,
  /gpt[-\s_]?image/i,
  /deapi/i,
  /seedream/i,
  /grok/i,
];

const key = (m: any) => `${m?.slug || m?.id || ""} ${m?.name || ""} ${m?.provider || ""}`;

export function isAllowedImageModel(model: any): boolean {
  return IMAGE_ALLOW_PATTERNS.some((re) => re.test(key(model)));
}

/** True when the model is served free of charge (DeAPI catalogue). */
export function isFreeImageModel(model: any): boolean {
  return /deapi/i.test(key(model)) || Number(model?.credits) === 0;
}

export function filterImageModels<T>(models: T[]): T[] {
  const allowed = models.filter((m) => isAllowedImageModel(m));
  return allowed.length > 0 ? allowed : models;
}

export function filterVideoModels<T>(models: T[]): T[] {
  return models;
}
