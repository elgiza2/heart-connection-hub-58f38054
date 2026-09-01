// Brand icons from @lobehub/icons. Loaded lazily per-brand so we don't ship
// the entire icon set (~770KB) in the initial chat bundle. Each icon is a
// dynamic import; only the icons actually rendered in the current session
// arrive over the network.
import { lazy, Suspense, useMemo, type ComponentType } from "react";

type IconModule = { default: ComponentType<any> & { Color?: ComponentType<any> } };

// Registry maps a slug → dynamic import factory. Vite creates a tiny chunk
// per icon so a chat that only shows OpenAI + Gemini pays for those two.
const REGISTRY: Record<string, () => Promise<IconModule>> = {
  flux: () => import("@lobehub/icons/es/Flux"),
  bfl: () => import("@lobehub/icons/es/Bfl"),
  openai: () => import("@lobehub/icons/es/OpenAI"),
  gemini: () => import("@lobehub/icons/es/Gemini"),
  nanobanana: () => import("@lobehub/icons/es/NanoBanana"),
  ideogram: () => import("@lobehub/icons/es/Ideogram"),
  recraft: () => import("@lobehub/icons/es/Recraft"),
  bytedance: () => import("@lobehub/icons/es/ByteDance"),
  doubao: () => import("@lobehub/icons/es/Doubao"),
  alibaba: () => import("@lobehub/icons/es/Alibaba"),
  kling: () => import("@lobehub/icons/es/Kling"),
  minimax: () => import("@lobehub/icons/es/Minimax"),
  runway: () => import("@lobehub/icons/es/Runway"),
  stability: () => import("@lobehub/icons/es/Stability"),
  grok: () => import("@lobehub/icons/es/Grok"),
  xai: () => import("@lobehub/icons/es/XAI"),
  fal: () => import("@lobehub/icons/es/Fal"),
  sora: () => import("@lobehub/icons/es/Sora"),
  luma: () => import("@lobehub/icons/es/Luma"),
  pika: () => import("@lobehub/icons/es/Pika"),
  pixverse: () => import("@lobehub/icons/es/PixVerse"),
  hailuo: () => import("@lobehub/icons/es/Hailuo"),
  hedra: () => import("@lobehub/icons/es/Hedra"),
  hunyuan: () => import("@lobehub/icons/es/Hunyuan"),
  cogvideo: () => import("@lobehub/icons/es/CogVideo"),
  kolors: () => import("@lobehub/icons/es/Kolors"),
  krea: () => import("@lobehub/icons/es/Krea"),
  midjourney: () => import("@lobehub/icons/es/Midjourney"),
  dalle: () => import("@lobehub/icons/es/Dalle"),
  topaz: () => import("@lobehub/icons/es/TopazLabs"),
  claude: () => import("@lobehub/icons/es/Claude"),
  anthropic: () => import("@lobehub/icons/es/Anthropic"),
  perplexity: () => import("@lobehub/icons/es/Perplexity"),
};

function pickBrandKey(name = "", provider = ""): keyof typeof REGISTRY | null {
  const n = `${name} ${provider}`.toLowerCase();
  if (n.includes("claude") || n.includes("anthropic")) return "anthropic";
  if (n.includes("sonar") || n.includes("perplex")) return "perplexity";
  if (n.includes("nano banana") || n.includes("nano-banana") || n.includes("nanobanana")) return "nanobanana";
  if (n.includes("kontext") || n.includes("flux")) return "flux";
  if (n.includes("bfl") || n.includes("black forest")) return "bfl";
  if (n.includes("sora")) return "sora";
  if (n.includes("dall")) return "dalle";
  if (n.includes("midjourney") || /\bmj\b/.test(n)) return "midjourney";
  if (n.includes("imagen") || n.includes("veo") || n.includes("gemini")) return "gemini";
  if (n.includes("gpt") || n.includes("openai")) return "openai";
  if (n.includes("seedream") || n.includes("seedance") || n.includes("doubao")) return "doubao";
  if (n.includes("hunyuan")) return "hunyuan";
  if (n.includes("cogvideo") || n.includes("cogview")) return "cogvideo";
  if (n.includes("kolors")) return "kolors";
  if (n.includes("krea")) return "krea";
  if (
    n.includes("wanx") ||
    n.includes("wan ") ||
    n.includes("wan2") ||
    n.includes("qwen") ||
    n.includes("tongyi") ||
    n.includes("alibaba")
  )
    return "alibaba";
  if (n.includes("ideogram")) return "ideogram";
  if (n.includes("recraft")) return "recraft";
  if (n.includes("kling")) return "kling";
  if (n.includes("hailuo")) return "hailuo";
  if (n.includes("minimax")) return "minimax";
  if (n.includes("runway") || n.includes("gen-3") || n.includes("gen3") || n.includes("gen-4")) return "runway";
  if (n.includes("luma") || n.includes("dream machine")) return "luma";
  if (n.includes("pika")) return "pika";
  if (n.includes("pixverse")) return "pixverse";
  if (n.includes("hedra")) return "hedra";
  if (n.includes("topaz")) return "topaz";
  if (n.includes("stab")) return "stability";
  if (n.includes("grok")) return "grok";
  if (n.includes("xai")) return "xai";
  if (n.includes("bytedance")) return "bytedance";
  if (n.includes("fal")) return "fal";
  return null;
}

// Cache each lazy component so switching between messages that show the same
// brand doesn't re-mount / re-fetch the chunk.
const lazyCache = new Map<string, ReturnType<typeof lazy>>();

const EmptyIcon: ComponentType<any> = () => null;

function getLazyBrand(key: keyof typeof REGISTRY, mono: boolean) {
  const cacheKey = `${key}:${mono ? "m" : "c"}`;
  const cached = lazyCache.get(cacheKey);
  if (cached) return cached;
  const Comp = lazy(async () => {
    // Icon chunks are cosmetic: a failed fetch (stale dev chunk, offline,
    // CDN hiccup) must NEVER bubble to the route error boundary and blank the
    // page. Retry once, then fall back to rendering nothing.
    try {
      const mod = await REGISTRY[key]();
      const Root = mod.default;
      const Chosen = !mono && Root?.Color ? Root.Color : Root;
      return { default: Chosen as ComponentType<any> };
    } catch {
      try {
        const mod = await REGISTRY[key]();
        const Root = mod.default;
        const Chosen = !mono && Root?.Color ? Root.Color : Root;
        return { default: Chosen as ComponentType<any> };
      } catch {
        lazyCache.delete(cacheKey);
        return { default: EmptyIcon };
      }
    }
  });
  lazyCache.set(cacheKey, Comp);
  return Comp;
}


interface Props {
  name?: string;
  provider?: string;
  size?: number;
  /** Kept for API compatibility. Backgrounds are never rendered. */
  variant?: "avatar" | "mono" | "color";
  className?: string;
}

export function BrandIcon({ name, provider, size = 28, variant = "color", className }: Props) {
  const key = useMemo(() => pickBrandKey(name, provider), [name, provider]);
  if (!key) return null;
  const mono = variant === "mono";
  const LazyBrand = getLazyBrand(key, mono);
  return (
    <Suspense fallback={<span style={{ display: "inline-block", width: size, height: size }} />}>
      {mono ? (
        <LazyBrand size={size} className={className} />
      ) : (
        <LazyBrand size={size} className={className} color="currentColor" />
      )}
    </Suspense>
  );
}

export function hasBrandIcon(name = "", provider = "") {
  return !!pickBrandKey(name, provider);
}
