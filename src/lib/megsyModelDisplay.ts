export const MEGSY_CHAT_MODEL_LABEL = "Megsy";

export const LEGACY_MEGSY_CHAT_MODEL_IDS = new Set([
  "megsy-3.9",
  "qwen-max",
  "qwen-plus",
  "qwen-turbo",
  "google/gemini-2.5-flash",
]);

export const normalizeMegsyModelLabel = (label: string | null | undefined) => {
  const clean = (label || MEGSY_CHAT_MODEL_LABEL)
    .replace(/Megsy\s*3\.9/gi, MEGSY_CHAT_MODEL_LABEL)
    .replace(/ميغسي\s*3\.9/g, MEGSY_CHAT_MODEL_LABEL)
    .replace(/\s+/g, " ")
    .trim();

  return clean || MEGSY_CHAT_MODEL_LABEL;
};

export const isLegacyMegsyChatSelection = (
  model: { id?: string | null; label?: string | null; name?: string | null } | null | undefined,
) => {
  if (!model) return false;
  const id = model.id || "";
  const label = model.label || model.name || "";
  return LEGACY_MEGSY_CHAT_MODEL_IDS.has(id) || /(?:Megsy|ميغسي)\s*3\.9/i.test(label);
};
