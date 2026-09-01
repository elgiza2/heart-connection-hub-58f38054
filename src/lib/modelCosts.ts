/**
 * Rough per-1K-token USD costs for known models. Used for cost badges only —
 * not for billing. Kept intentionally small; unknown models return null.
 */
export interface CostRate { in: number; out: number }

const RATES: Record<string, CostRate> = {
  "qwen-max": { in: 0.0016, out: 0.0064 },
  "qwen-plus": { in: 0.0004, out: 0.0012 },
  "qwen-turbo": { in: 0.0002, out: 0.0006 },
  "qwen-vl-max": { in: 0.002, out: 0.008 },
  "qwen-vl-plus": { in: 0.0008, out: 0.0016 },
  "qwen3-coder": { in: 0.0008, out: 0.0024 },
  "kimi-k2": { in: 0.0006, out: 0.0025 },
  "glm-4.6": { in: 0.0005, out: 0.002 },
  "gpt-5": { in: 0.0025, out: 0.01 },
  "claude-4": { in: 0.003, out: 0.015 },
};

export function estimateCostUsd(model: string | undefined, usage?: { prompt_tokens?: number; completion_tokens?: number } | null): number | null {
  if (!model || !usage) return null;
  const key = Object.keys(RATES).find((k) => model.toLowerCase().includes(k));
  if (!key) return null;
  const r = RATES[key];
  const pin = Number(usage.prompt_tokens || 0);
  const pout = Number(usage.completion_tokens || 0);
  const cost = (pin / 1000) * r.in + (pout / 1000) * r.out;
  return cost;
}

export function formatCostUsd(cost: number | null): string {
  if (cost === null || !isFinite(cost)) return "";
  if (cost < 0.0001) return "<$0.0001";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(3)}`;
}
