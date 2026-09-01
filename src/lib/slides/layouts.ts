// Layout registry — 1000+ styled variants generated from a base set of
// renderable primitives. Each variant carries a `base` field pointing back to
// one of the ~46 base layouts that the renderer knows how to draw. Variants
// only differ in styling tokens (accent, alignment, density, ornament), so the
// renderer stays simple while the deck planner gets enormous visual variety.

export type ContentFit =
  | "title"
  | "section"
  | "text"
  | "text+image"
  | "bullets"
  | "stats"
  | "comparison"
  | "timeline"
  | "process"
  | "quote"
  | "gallery"
  | "definition";

export type LayoutId = string;

export interface LayoutMeta {
  id: LayoutId;
  /** Renderable base primitive (one of BASE_LAYOUTS). */
  base: string;
  fits: ContentFit[];
  hasImage: boolean;
  hasMultiImage: boolean;
  textDensity: "low" | "medium" | "high";
  /** Max bullets that fit cleanly. */
  maxBullets: number;
  /** Max paragraph words that fit cleanly. */
  maxBodyWords: number;
  /** Styling modifiers a renderer/theme can opt into. */
  accent?: string; // color accent slot
  align?: "left" | "center" | "right";
  density?: "airy" | "balanced" | "dense";
  ornament?: string; // visual ornament tag (e.g. "ribbon", "grid", "dots")
}

interface BaseDef {
  id: string;
  fits: ContentFit[];
  hasImage: boolean;
  hasMultiImage: boolean;
  textDensity: "low" | "medium" | "high";
  maxBullets: number;
  maxBodyWords: number;
  /** Renderable parent primitive — undefined means the id itself is renderable. */
  base?: string;
  /** Composition family used for variety enforcement. */
  family?: string;
}

/**
 * Layout primitives.
 *
 * Primitives marked without a `base` field are renderable by the template
 * engines directly. Primitives with a `base` field are composition variants
 * that map to one of the renderable primitives via `resolveBaseLayout`, but
 * give the planner/LLM a richer vocabulary and let the variety enforcer keep
 * decks visually diverse.
 *
 * The `family` tag groups visually similar primitives so the enforcer can
 * avoid stacking two layouts from the same family back-to-back even when
 * their ids differ.
 */
const BASE_LAYOUTS: BaseDef[] = [
  // text+image
  {
    id: "split-right",
    family: "split-image",
    fits: ["text+image", "bullets", "text"],
    hasImage: true,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 5,
    maxBodyWords: 100,
  },
  {
    id: "split-left",
    family: "split-image",
    fits: ["text+image", "bullets", "text"],
    hasImage: true,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 5,
    maxBodyWords: 100,
  },
  {
    id: "image-full",
    family: "image-hero",
    fits: ["text+image", "title"],
    hasImage: true,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 30,
  },
  {
    id: "image-top",
    family: "image-stack",
    fits: ["text+image", "bullets"],
    hasImage: true,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 4,
    maxBodyWords: 80,
  },
  {
    id: "image-bottom",
    family: "image-stack",
    fits: ["text+image", "bullets"],
    hasImage: true,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 4,
    maxBodyWords: 80,
  },
  {
    id: "image-side-card",
    family: "image-card",
    fits: ["text+image"],
    hasImage: true,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 4,
    maxBodyWords: 80,
  },
  {
    id: "focus-image",
    family: "image-hero",
    fits: ["text+image", "title"],
    hasImage: true,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 40,
  },
  {
    id: "magazine-cover",
    family: "editorial",
    fits: ["title", "section"],
    hasImage: true,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 25,
  },
  {
    id: "diagonal-split",
    family: "split-image",
    fits: ["text+image"],
    hasImage: true,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 4,
    maxBodyWords: 70,
  },
  {
    id: "polaroid",
    family: "image-card",
    fits: ["text+image"],
    hasImage: true,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 50,
  },
  // text+image — composition variants
  {
    id: "hero-image-right",
    base: "split-right",
    family: "split-image",
    fits: ["text+image"],
    hasImage: true,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 60,
  },
  {
    id: "hero-image-left",
    base: "split-left",
    family: "split-image",
    fits: ["text+image"],
    hasImage: true,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 60,
  },
  {
    id: "image-card-overlay",
    base: "image-full",
    family: "image-hero",
    fits: ["text+image"],
    hasImage: true,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 50,
  },
  {
    id: "image-quote-overlay",
    base: "image-full",
    family: "image-hero",
    fits: ["text+image", "quote"],
    hasImage: true,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 40,
  },
  {
    id: "split-image-stack",
    base: "split-right",
    family: "split-image",
    fits: ["text+image", "bullets"],
    hasImage: true,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 5,
    maxBodyWords: 90,
  },
  {
    id: "split-image-bleed",
    base: "split-left",
    family: "split-image",
    fits: ["text+image", "bullets"],
    hasImage: true,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 5,
    maxBodyWords: 90,
  },
  {
    id: "image-with-stats",
    base: "image-side-card",
    family: "image-card",
    fits: ["text+image", "stats"],
    hasImage: true,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 0,
    maxBodyWords: 60,
  },
  {
    id: "image-with-caption",
    base: "polaroid",
    family: "image-card",
    fits: ["text+image"],
    hasImage: true,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 50,
  },
  {
    id: "image-strip-top",
    base: "image-top",
    family: "image-stack",
    fits: ["text+image", "bullets"],
    hasImage: true,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 4,
    maxBodyWords: 70,
  },
  {
    id: "image-strip-bottom",
    base: "image-bottom",
    family: "image-stack",
    fits: ["text+image", "bullets"],
    hasImage: true,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 4,
    maxBodyWords: 70,
  },
  // text-only
  {
    id: "centered",
    family: "centered-text",
    fits: ["text", "title"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 4,
    maxBodyWords: 60,
  },
  {
    id: "centered-narrow",
    family: "centered-text",
    fits: ["text", "definition"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 60,
  },
  {
    id: "left-aligned-hero",
    family: "hero-text",
    fits: ["title", "text"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 3,
    maxBodyWords: 50,
  },
  {
    id: "right-aligned-hero",
    family: "hero-text",
    fits: ["title", "text"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 3,
    maxBodyWords: 50,
  },
  {
    id: "definition",
    family: "definition",
    fits: ["definition"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 60,
  },
  {
    id: "manifesto",
    family: "statement",
    fits: ["title", "quote"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 25,
  },
  {
    id: "poster-typo",
    family: "statement",
    fits: ["title", "section"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 12,
  },
  {
    id: "pull-quote",
    family: "quote",
    fits: ["quote"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 40,
  },
  {
    id: "callout",
    family: "statement",
    fits: ["title", "definition"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 25,
  },
  // text-only — composition variants
  {
    id: "oversized-title",
    base: "poster-typo",
    family: "statement",
    fits: ["title"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 8,
  },
  {
    id: "title-with-rule",
    base: "left-aligned-hero",
    family: "hero-text",
    fits: ["title", "text"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 40,
  },
  {
    id: "centered-eyebrow",
    base: "centered",
    family: "centered-text",
    fits: ["title", "text"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 50,
  },
  {
    id: "asymmetric-title",
    base: "right-aligned-hero",
    family: "hero-text",
    fits: ["title", "text"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 40,
  },
  {
    id: "split-title-body",
    base: "left-aligned-hero",
    family: "hero-text",
    fits: ["text", "title"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 0,
    maxBodyWords: 90,
  },
  {
    id: "framed-title",
    base: "callout",
    family: "statement",
    fits: ["title", "definition"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 30,
  },
  {
    id: "stacked-statement",
    base: "manifesto",
    family: "statement",
    fits: ["title", "quote"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 30,
  },
  {
    id: "drop-cap-paragraph",
    base: "centered-narrow",
    family: "centered-text",
    fits: ["text", "definition"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 0,
    maxBodyWords: 110,
  },
  {
    id: "dialogue-block",
    base: "pull-quote",
    family: "quote",
    fits: ["quote"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 50,
  },
  {
    id: "indented-statement",
    base: "left-aligned-hero",
    family: "hero-text",
    fits: ["text", "title"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 50,
  },
  // grid
  {
    id: "two-col",
    family: "columns",
    fits: ["bullets", "comparison"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "high",
    maxBullets: 8,
    maxBodyWords: 0,
  },
  {
    id: "three-col",
    family: "columns",
    fits: ["bullets"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "high",
    maxBullets: 9,
    maxBodyWords: 0,
  },
  {
    id: "four-col",
    family: "columns",
    fits: ["bullets"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "high",
    maxBullets: 8,
    maxBodyWords: 0,
  },
  {
    id: "bento",
    family: "bento",
    fits: ["bullets", "text+image"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "high",
    maxBullets: 6,
    maxBodyWords: 0,
  },
  {
    id: "masonry-cards",
    family: "bento",
    fits: ["bullets", "gallery"],
    hasImage: false,
    hasMultiImage: true,
    textDensity: "medium",
    maxBullets: 6,
    maxBodyWords: 0,
  },
  {
    id: "pillars",
    family: "cards",
    fits: ["bullets"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 4,
    maxBodyWords: 0,
  },
  {
    id: "icon-grid",
    family: "cards",
    fits: ["bullets"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 6,
    maxBodyWords: 0,
  },
  {
    id: "ribbon-cards",
    family: "cards",
    fits: ["bullets"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 4,
    maxBodyWords: 0,
  },
  // grid — composition variants
  {
    id: "asymmetric-bento",
    base: "bento",
    family: "bento",
    fits: ["bullets", "text+image"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "high",
    maxBullets: 5,
    maxBodyWords: 0,
  },
  {
    id: "vertical-cards",
    base: "pillars",
    family: "cards",
    fits: ["bullets"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 4,
    maxBodyWords: 0,
  },
  {
    id: "horizontal-strips",
    base: "ribbon-cards",
    family: "cards",
    fits: ["bullets"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 4,
    maxBodyWords: 0,
  },
  {
    id: "two-col-divided",
    base: "two-col",
    family: "columns",
    fits: ["bullets", "comparison"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "high",
    maxBullets: 8,
    maxBodyWords: 0,
  },
  {
    id: "three-col-numbered",
    base: "three-col",
    family: "columns",
    fits: ["bullets"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "high",
    maxBullets: 9,
    maxBodyWords: 0,
  },
  {
    id: "feature-grid-2x2",
    base: "bento",
    family: "bento",
    fits: ["bullets"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 4,
    maxBodyWords: 0,
  },
  {
    id: "feature-grid-3x2",
    base: "bento",
    family: "bento",
    fits: ["bullets"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "high",
    maxBullets: 6,
    maxBodyWords: 0,
  },
  {
    id: "card-list",
    base: "ribbon-cards",
    family: "cards",
    fits: ["bullets"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 5,
    maxBodyWords: 0,
  },
  {
    id: "kanban-cols",
    base: "three-col",
    family: "columns",
    fits: ["bullets"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "high",
    maxBullets: 9,
    maxBodyWords: 0,
  },
  {
    id: "tiled-grid",
    base: "icon-grid",
    family: "cards",
    fits: ["bullets"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 6,
    maxBodyWords: 0,
  },
  // compare
  {
    id: "comparison",
    family: "compare",
    fits: ["comparison"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "high",
    maxBullets: 5,
    maxBodyWords: 0,
  },
  {
    id: "before-after",
    family: "compare",
    fits: ["comparison"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 4,
    maxBodyWords: 0,
  },
  {
    id: "vs-split",
    family: "compare",
    fits: ["comparison"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 5,
    maxBodyWords: 0,
  },
  {
    id: "table-compare",
    family: "table",
    fits: ["comparison"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "high",
    maxBullets: 6,
    maxBodyWords: 0,
  },
  // compare — composition variants
  {
    id: "pros-cons",
    base: "comparison",
    family: "compare",
    fits: ["comparison"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 5,
    maxBodyWords: 0,
  },
  {
    id: "side-by-side-cards",
    base: "vs-split",
    family: "compare",
    fits: ["comparison"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 5,
    maxBodyWords: 0,
  },
  {
    id: "old-vs-new",
    base: "before-after",
    family: "compare",
    fits: ["comparison"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 4,
    maxBodyWords: 0,
  },
  {
    id: "matrix-2x2",
    base: "table-compare",
    family: "table",
    fits: ["comparison"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "high",
    maxBullets: 4,
    maxBodyWords: 0,
  },
  {
    id: "competitor-table",
    base: "table-compare",
    family: "table",
    fits: ["comparison"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "high",
    maxBullets: 6,
    maxBodyWords: 0,
  },
  // data
  {
    id: "big-number",
    family: "hero-stat",
    fits: ["stats"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 60,
  },
  {
    id: "stat-cluster",
    family: "stat-grid",
    fits: ["stats"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 0,
    maxBodyWords: 30,
  },
  {
    id: "stat-circles",
    family: "stat-grid",
    fits: ["stats"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 0,
  },
  {
    id: "kpi-strip",
    family: "stat-strip",
    fits: ["stats"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 0,
  },
  // data — composition variants
  {
    id: "stat-hero",
    base: "big-number",
    family: "hero-stat",
    fits: ["stats"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 60,
  },
  {
    id: "stat-row",
    base: "kpi-strip",
    family: "stat-strip",
    fits: ["stats"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 0,
  },
  {
    id: "stat-pair",
    base: "stat-cluster",
    family: "stat-grid",
    fits: ["stats"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 30,
  },
  {
    id: "stat-grid-4",
    base: "stat-cluster",
    family: "stat-grid",
    fits: ["stats"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 0,
    maxBodyWords: 0,
  },
  {
    id: "metric-card",
    base: "stat-circles",
    family: "stat-grid",
    fits: ["stats"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 0,
  },
  {
    id: "trend-callout",
    base: "big-number",
    family: "hero-stat",
    fits: ["stats"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 50,
  },
  {
    id: "percentage-bar",
    base: "kpi-strip",
    family: "stat-strip",
    fits: ["stats"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 0,
  },
  {
    id: "ranking-list",
    base: "stat-cluster",
    family: "stat-grid",
    fits: ["stats"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 0,
    maxBodyWords: 0,
  },
  // narrative
  {
    id: "process",
    family: "process",
    fits: ["process"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 0,
    maxBodyWords: 0,
  },
  {
    id: "timeline",
    family: "timeline",
    fits: ["timeline"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 0,
    maxBodyWords: 0,
  },
  {
    id: "timeline-horizontal",
    family: "timeline",
    fits: ["timeline"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 0,
  },
  {
    id: "numbered-list",
    family: "process",
    fits: ["bullets", "process"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 6,
    maxBodyWords: 0,
  },
  {
    id: "step-vertical",
    family: "process",
    fits: ["process"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 0,
    maxBodyWords: 0,
  },
  {
    id: "story-rows",
    family: "timeline",
    fits: ["timeline", "bullets"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "high",
    maxBullets: 0,
    maxBodyWords: 0,
  },
  // narrative — composition variants
  {
    id: "milestone-row",
    base: "timeline-horizontal",
    family: "timeline",
    fits: ["timeline"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 0,
    maxBodyWords: 0,
  },
  {
    id: "roadmap",
    base: "timeline-horizontal",
    family: "timeline",
    fits: ["timeline"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 0,
    maxBodyWords: 0,
  },
  {
    id: "phases",
    base: "process",
    family: "process",
    fits: ["process"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 0,
    maxBodyWords: 0,
  },
  {
    id: "swim-lanes",
    base: "story-rows",
    family: "timeline",
    fits: ["timeline", "bullets"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "high",
    maxBullets: 0,
    maxBodyWords: 0,
  },
  {
    id: "decision-tree",
    base: "process",
    family: "process",
    fits: ["process"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 0,
    maxBodyWords: 0,
  },
  {
    id: "flow-arrows",
    base: "step-vertical",
    family: "process",
    fits: ["process"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "medium",
    maxBullets: 0,
    maxBodyWords: 0,
  },
  {
    id: "story-chapters",
    base: "story-rows",
    family: "timeline",
    fits: ["timeline", "bullets"],
    hasImage: false,
    hasMultiImage: false,
    textDensity: "high",
    maxBullets: 0,
    maxBodyWords: 0,
  },
  // media
  {
    id: "gallery",
    family: "gallery",
    fits: ["gallery"],
    hasImage: false,
    hasMultiImage: true,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 30,
  },
  {
    id: "image-grid-2",
    family: "gallery",
    fits: ["gallery"],
    hasImage: false,
    hasMultiImage: true,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 30,
  },
  {
    id: "image-grid-4",
    family: "gallery",
    fits: ["gallery"],
    hasImage: false,
    hasMultiImage: true,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 20,
  },
  {
    id: "carousel-strip",
    family: "gallery",
    fits: ["gallery"],
    hasImage: false,
    hasMultiImage: true,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 20,
  },
  // media — composition variants
  {
    id: "image-mosaic-3",
    base: "image-grid-2",
    family: "gallery",
    fits: ["gallery"],
    hasImage: false,
    hasMultiImage: true,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 25,
  },
  {
    id: "image-mosaic-5",
    base: "image-grid-4",
    family: "gallery",
    fits: ["gallery"],
    hasImage: false,
    hasMultiImage: true,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 20,
  },
  {
    id: "image-quote-pair",
    base: "image-grid-2",
    family: "gallery",
    fits: ["gallery", "quote"],
    hasImage: false,
    hasMultiImage: true,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 40,
  },
  {
    id: "image-stats-pair",
    base: "image-grid-2",
    family: "gallery",
    fits: ["gallery", "stats"],
    hasImage: false,
    hasMultiImage: true,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 30,
  },
  {
    id: "image-grid-6",
    base: "image-grid-4",
    family: "gallery",
    fits: ["gallery"],
    hasImage: false,
    hasMultiImage: true,
    textDensity: "low",
    maxBullets: 0,
    maxBodyWords: 20,
  },
];

// Style-modifier vocabularies. Each combination produces a unique variant id.
const ACCENTS = [
  "indigo",
  "violet",
  "rose",
  "amber",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "fuchsia",
  "lime",
  "orange",
  "slate",
  "stone",
  "gold",
  "ruby",
  "mint",
] as const;
const ALIGNS: Array<NonNullable<LayoutMeta["align"]>> = ["left", "center", "right"];
const DENSITIES: Array<NonNullable<LayoutMeta["density"]>> = ["airy", "balanced", "dense"];
const ORNAMENTS = [
  "plain",
  "ribbon",
  "grid",
  "dots",
  "noise",
  "gradient",
  "frame",
  "underline",
  "corner-mark",
  "rule",
] as const;

/** Deterministically generate ~3000 variants. Order: base × accent × align ×
 *  density × ornament — sorted so the registry is stable across runs. */
function generateLayouts(): LayoutMeta[] {
  const out: LayoutMeta[] = [];
  // First: every base layout is itself a valid id (back-compat with existing
  // pickers and any LLM that emits a base name directly).
  for (const b of BASE_LAYOUTS) {
    out.push({ ...b, base: b.base ?? b.id });
  }
  // Then: styled variants. Use interleaved (round-robin) sampling so every
  // dimension is represented even when we cap the registry size — earlier
  // nested loops biased the output to a single density/ornament.
  const TARGET = 3000;
  const dims = {
    base: BASE_LAYOUTS,
    accent: ACCENTS,
    align: ALIGNS,
    density: DENSITIES,
    ornament: ORNAMENTS,
  };
  const total =
    dims.base.length *
    dims.accent.length *
    dims.align.length *
    dims.density.length *
    dims.ornament.length;
  const stride = Math.max(1, Math.floor(total / TARGET));
  let count = out.length;
  for (let i = 0; i < total && count < TARGET; i += stride) {
    let n = i;
    const b = dims.base[n % dims.base.length];
    n = Math.floor(n / dims.base.length);
    const accent = dims.accent[n % dims.accent.length];
    n = Math.floor(n / dims.accent.length);
    const align = dims.align[n % dims.align.length];
    n = Math.floor(n / dims.align.length);
    const density = dims.density[n % dims.density.length];
    n = Math.floor(n / dims.density.length);
    const ornament = dims.ornament[n % dims.ornament.length];
    const id = `${b.id}--${accent}-${align}-${density}-${ornament}`;
    out.push({ ...b, id, base: b.base ?? b.id, accent, align, density, ornament });
    count++;
  }
  return out;
}

export const LAYOUTS: LayoutMeta[] = generateLayouts();
export const LAYOUT_IDS = LAYOUTS.map((l) => l.id);
export const BASE_LAYOUT_IDS = BASE_LAYOUTS.map((b) => b.id);
/** Layouts that templates' renderers can draw directly. */
export const RENDERABLE_LAYOUT_IDS = BASE_LAYOUTS.filter((b) => !b.base).map((b) => b.id);

const LAYOUT_INDEX = new Map(LAYOUTS.map((l) => [l.id, l]));
const BASE_BY_ID = new Map(BASE_LAYOUTS.map((b) => [b.id, b]));

export function getLayoutMeta(id: string | undefined | null): LayoutMeta | undefined {
  if (!id) return undefined;
  const direct = LAYOUT_INDEX.get(id);
  if (direct) return direct;
  // Tolerate variants the renderer hasn't seen by stripping the suffix.
  const base = id.split("--")[0];
  return LAYOUT_INDEX.get(base);
}

/** Resolve any layout id (variant or base) to a renderable base id. */
export function resolveBaseLayout(id: string | undefined | null): string {
  const meta = getLayoutMeta(id);
  return meta?.base ?? "centered";
}

/** Composition family for variety enforcement; falls back to the base id. */
export function getLayoutFamily(id: string | undefined | null): string {
  const raw = String(id || "").split("--")[0];
  const def = BASE_BY_ID.get(raw);
  if (def?.family) return def.family;
  const base = def?.base ?? raw;
  return BASE_BY_ID.get(base)?.family ?? base ?? "unknown";
}

/** Pick a layout for a given content shape (rule-based, no LLM). */
export function suggestLayout(
  shape: {
    contentType: ContentFit;
    bulletsCount?: number;
    bodyWords?: number;
    hasImage?: boolean;
    statsCount?: number;
  },
  forbid: Set<string> = new Set(),
): string {
  // Score only against renderable base layouts to keep the renderer honest.
  const candidates = BASE_LAYOUTS.filter(
    (l) => !l.base && l.fits.includes(shape.contentType) && !forbid.has(l.id),
  );
  if (candidates.length === 0) return "centered";
  const scored = candidates.map((l) => {
    let score = 100;
    if (shape.hasImage && !l.hasImage && !l.hasMultiImage) score -= 30;
    if (!shape.hasImage && l.hasImage) score -= 15;
    if (shape.bulletsCount && shape.bulletsCount > l.maxBullets && l.maxBullets > 0) score -= 40;
    if (shape.bodyWords && l.maxBodyWords > 0 && shape.bodyWords > l.maxBodyWords) score -= 35;
    return { id: l.id, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].id;
}
