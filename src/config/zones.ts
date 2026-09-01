/** @doc Zone configuration — Megsy (global), China (soon). */

export type ZoneId = "megsy" | "china";

export interface ZoneConfig {
  id: ZoneId;
  name: string;
  tagline: string;
  /** When true, the zone is not yet available (shown as "Soon"). */
  soon?: boolean;
  /** Sub-domain prefix. Empty = root. */
  subdomain: string;
  /** Default currency code for pricing display. */
  defaultCurrency: string;
  /** Default language code. */
  defaultLanguage: string;
  /** AI dialect hint sent to backend prompts. */
  aiDialect: "standard" | "chinese";
  /** Payment provider for this zone. */
  paymentProvider: "stripe" | "alipay";
  /** Brand color (HSL) for accents. */
  accentHsl: string;
  /** Short note shown under the name in the switcher. */
  description: string;
  /** Optional badge: "new" | "soon" */
  badge?: "new" | "soon";
}

export const ZONES: Record<ZoneId, ZoneConfig> = {
  megsy: {
    id: "megsy",
    name: "Megsy",
    tagline: "The global AI assistant",
    subdomain: "",
    defaultCurrency: "USD",
    defaultLanguage: "en",
    aiDialect: "standard",
    paymentProvider: "stripe",
    accentHsl: "263 70% 60%",
    description: "Global experience with Stripe checkout",
  },
  china: {
    id: "china",
    name: "China Zone",
    tagline: "AI assistant for China — coming soon",
    soon: true,
    subdomain: "china",
    defaultCurrency: "CNY",
    defaultLanguage: "zh",
    aiDialect: "chinese",
    paymentProvider: "alipay",
    accentHsl: "0 72% 51%",
    description: "Mandarin AI with Alipay and WeChat Pay",
    badge: "soon",
  },
};

export const ZONE_LIST: ZoneConfig[] = [ZONES.megsy, ZONES.china];

export function detectZoneFromHostname(hostname: string): ZoneId {
  const lower = hostname.toLowerCase();
  if (lower.startsWith("china.")) return "china";
  return "megsy";
}
