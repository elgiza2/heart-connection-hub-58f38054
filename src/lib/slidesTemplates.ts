// Templates available in chat-mode slide generation.
// Standard tier = multiple style variants powered by the Plus AI Presentations API
//   (each variant steers Plus AI with a different style prompt; output is .pptx).
// Premium tier = the rich 3D/WebGL React deck templates.

export type SlidesCategory = "premium" | "standard";

export type SlidesVariant =
  | "plus-ai"
  | "editorial-serif"
  | "bold-display"
  | "minimal-mono"
  | "luxury-gold"
  | "kinetic-poster"
  | "prisma-cinematic";

export interface SlidesTemplate {
  id: string;
  name: string;
  description: string;
  colors: [string, string];
  category: SlidesCategory;
  htmlSlug: string;
  variant: SlidesVariant;
  cover: string;
  /** Standard (Plus AI) variants: style direction prepended to the user's prompt. */
  stylePrompt?: string;
}

const digitalOasisCover = new URL("../assets/slide-templates/digital-oasis.webp", import.meta.url).href;
const oceanFlowCover = new URL("../assets/slide-templates/ocean-flow.webp", import.meta.url).href;
const seasonalScrollCover = new URL("../assets/slide-templates/seasonal-scroll.webp", import.meta.url).href;
const vantaAtelierCover = new URL("../assets/slide-templates/vanta-atelier.webp", import.meta.url).href;
const aquaraWaterCover = new URL("../assets/slide-templates/aquara-water.webp", import.meta.url).href;
const landscapeLanguageCover = new URL("../assets/slide-templates/landscape-language.webp", import.meta.url).href;
const valenceBlobsCover = new URL("../assets/slide-templates/valence-blobs.webp", import.meta.url).href;
const synthraBuilderCover = new URL("../assets/slide-templates/synthra-builder.webp", import.meta.url).href;
const kamiNotebookCover = new URL("../assets/slide-templates/kami-notebook.webp", import.meta.url).href;
const spideyWebCover = new URL("../assets/slide-templates/spidey-web.webp", import.meta.url).href;
const yashFolioCover = new URL("../assets/slide-templates/yash-folio.webp", import.meta.url).href;
const stormToCalmCover = new URL("../assets/slide-templates/storm-to-calm.webp", import.meta.url).href;
const folioScatterCover = new URL("../assets/slide-templates/folio-scatter.webp", import.meta.url).href;
const axiomVectorCover = new URL("../assets/slide-templates/axiom-vector.webp", import.meta.url).href;
const prismaStudioCover = new URL("../assets/slide-templates/prisma-studio.webp", import.meta.url).href;

// Plus AI standard template covers
const manilaCover = new URL("../assets/slide-templates/plus-ai/manila.jpg", import.meta.url).href;
const mallorcaCover = new URL("../assets/slide-templates/plus-ai/mallorca.jpg", import.meta.url).href;
const potpourriCover = new URL("../assets/slide-templates/plus-ai/potpourri.jpg", import.meta.url).href;
const feemoCover = new URL("../assets/slide-templates/plus-ai/feemo.jpg", import.meta.url).href;
const sketchpadCover = new URL("../assets/slide-templates/plus-ai/sketchpad.jpg", import.meta.url).href;
const corporateBlueCover = new URL("../assets/slide-templates/plus-ai/corporate-blue.jpg", import.meta.url).href;
const modernistSienaCover = new URL("../assets/slide-templates/plus-ai/modernist-siena.jpg", import.meta.url).href;
const indigoCover = new URL("../assets/slide-templates/plus-ai/indigo.jpg", import.meta.url).href;
const herbertCover = new URL("../assets/slide-templates/plus-ai/herbert.jpg", import.meta.url).href;
const brutSeascapeCover = new URL("../assets/slide-templates/plus-ai/brut-seascape.jpg", import.meta.url).href;
const auroraCover = new URL("../assets/slide-templates/plus-ai/aurora.jpg", import.meta.url).href;
const insightCover = new URL("../assets/slide-templates/plus-ai/insight.jpg", import.meta.url).href;
const insightModernCover = new URL("../assets/slide-templates/plus-ai/insight-modern.jpg", import.meta.url).href;
const insightBoldCover = new URL("../assets/slide-templates/plus-ai/insight-bold.jpg", import.meta.url).href;
const simpleNotebookCover = new URL("../assets/slide-templates/plus-ai/simple-notebook.jpg", import.meta.url).href;
const swissLightCover = new URL("../assets/slide-templates/plus-ai/swiss-light.png", import.meta.url).href;
const swissDarkCover = new URL("../assets/slide-templates/plus-ai/swiss-dark.png", import.meta.url).href;
const fredCover = new URL("../assets/slide-templates/plus-ai/fred.jpg", import.meta.url).href;
const editorialCover = new URL("../assets/slide-templates/plus-ai/editorial.png", import.meta.url).href;
const forestFloorCover = new URL("../assets/slide-templates/plus-ai/forest-floor.png", import.meta.url).href;
const kinCover = new URL("../assets/slide-templates/plus-ai/kin.jpg", import.meta.url).href;
const spiralNotebookCover = new URL("../assets/slide-templates/plus-ai/spiral-notebook.jpg", import.meta.url).href;
const compositionBookCover = new URL("../assets/slide-templates/plus-ai/composition-book.png", import.meta.url).href;
const blackboardCover = new URL("../assets/slide-templates/plus-ai/blackboard.png", import.meta.url).href;
const modernistProfessionalCover = new URL("../assets/slide-templates/plus-ai/modernist-professional.png", import.meta.url).href;
const metroCover = new URL("../assets/slide-templates/plus-ai/metro.png", import.meta.url).href;
const brutTigrisCover = new URL("../assets/slide-templates/plus-ai/brut-tigris.png", import.meta.url).href;
const brutBrickCover = new URL("../assets/slide-templates/plus-ai/brut-brick.png", import.meta.url).href;
const minimalistLightCover = new URL("../assets/slide-templates/plus-ai/minimalist-light.png", import.meta.url).href;
const plusDefaultCover = new URL("../assets/slide-templates/plus-ai/plus-default.png", import.meta.url).href;

export const PREMIUM_HTML_TEMPLATES: SlidesTemplate[] = [
  {
    id: "digital-oasis",
    name: "Digital Oasis",
    description:
      "Cinematic 3D scroll experience with a living grass field, editorial serif headlines, and lime-on-black palette.",
    colors: ["#000000", "#e6f578"],
    category: "premium",
    htmlSlug: "remix-3d-website-the-digital-o",
    variant: "editorial-serif",
    cover: digitalOasisCover,
  },
  {
    id: "ocean-flow",
    name: "Into the Deep",
    description:
      "Editorial ocean scroll — bold Anton headlines, indigo-to-cyan palette, deep-sea storytelling sections.",
    colors: ["#1565d8", "#4fc3f7"],
    category: "premium",
    htmlSlug: "remix-ocean-flow-fish",
    variant: "bold-display",
    cover: oceanFlowCover,
  },
  {
    id: "seasonal-scroll",
    name: "Solstice — Seasonal Scroll",
    description:
      "Editorial Playfair scroll across spring/summer/autumn/winter palettes with a living 3D torus and varied layouts.",
    colors: ["#c8dbbe", "#b8c8dc"],
    category: "premium",
    htmlSlug: "remix-seasonal-scroll-experien",
    variant: "editorial-serif",
    cover: seasonalScrollCover,
  },
  {
    id: "vanta-atelier",
    name: "Vanta — Digital Atelier",
    description:
      "Dark luxury editorial deck with golden particle 3D scene, Playfair italics, and refined atelier sections.",
    colors: ["#0e0e0e", "#c4a882"],
    category: "premium",
    htmlSlug: "remix-vanta-digital-atelier",
    variant: "luxury-gold",
    cover: vantaAtelierCover,
  },
  {
    id: "aquara-water",
    name: "Aquara — Interactive Water",
    description:
      "Immersive dark deck with a live WebGL water canvas, Syne display headlines, and editorial blue accents.",
    colors: ["#0a0e17", "#78b4ff"],
    category: "premium",
    htmlSlug: "remix-aquara-water",
    variant: "bold-display",
    cover: aquaraWaterCover,
  },
  {
    id: "landscape-language",
    name: "Landscape as Language",
    description:
      "Cream-paper editorial scroll with hand-drawn ink botanicals in 3D, Playfair italics, and Napa-quiet pacing.",
    colors: ["hsl(var(--brand-parchment))", "#1a1714"],
    category: "premium",
    htmlSlug: "remix-landscape-design",
    variant: "editorial-serif",
    cover: landscapeLanguageCover,
  },
  {
    id: "valence-blobs",
    name: "Valence — Molecular Blobs",
    description:
      "Soft pastel raymarched blob in 3D behind clean editorial sections with bold Inter Black headlines.",
    colors: ["#d4d4d8", "#000000"],
    category: "premium",
    htmlSlug: "remix-valence-blobs",
    variant: "bold-display",
    cover: valenceBlobsCover,
  },
  {
    id: "synthra-builder",
    name: "Synthra — Editorial Cream",
    description:
      "Minimal cream editorial deck with a living silhouette canvas, Space Grotesk headlines, and refined section cards.",
    colors: ["#fafafa", "#111111"],
    category: "premium",
    htmlSlug: "remix-synthra-builder",
    variant: "minimal-mono",
    cover: synthraBuilderCover,
  },
  {
    id: "kami-notebook",
    name: "Kami — Leather Notebook",
    description:
      "Dark leather + parchment editorial split layouts with Cinzel Decorative display, Crimson Pro body, and Space Mono labels.",
    colors: ["#09090b", "#a89070"],
    category: "premium",
    htmlSlug: "remix-kami-notebook",
    variant: "editorial-serif",
    cover: kamiNotebookCover,
  },
  {
    id: "spidey-web",
    name: "Spidey — Web Slinger",
    description:
      "Comic-book brutalist deck with Bebas Neue display, red & blue split palette, animated web pattern, and spider-emblem cards.",
    colors: ["hsl(var(--brand-ink))", "#E23636"],
    category: "premium",
    htmlSlug: "remix-cool-spiderman-website-d",
    variant: "kinetic-poster",
    cover: spideyWebCover,
  },
  {
    id: "yash-folio",
    name: "Yash — Designer Folio",
    description:
      "Dark editorial designer folio with pink/purple/blue gradient orbs, Space Grotesk display + Inter body, and a high-variety combinatorial layout system.",
    colors: ["#0e0e10", "#d94f7a"],
    category: "premium",
    htmlSlug: "remix-yash-designer-folio",
    variant: "editorial-serif",
    cover: yashFolioCover,
  },
  {
    id: "storm-to-calm",
    name: "Storm to Calm — Editorial Scroll",
    description:
      "Cinematic editorial scroll from stormy navy to calm mist — Cormorant Garamond italics, electric-blue accents, atmospheric starfield, and a 46k+ combinatorial layout system.",
    colors: ["#0a0a12", "#8ca0ff"],
    category: "premium",
    htmlSlug: "remix-storm-to-calm-scrolling",
    variant: "editorial-serif",
    cover: stormToCalmCover,
  },
  {
    id: "folio-scatter",
    name: "Folio — Paper Scatter",
    description:
      "Minimal cream editorial portfolio — DM Sans display with Space Mono labels, paper-scatter glyph, hairline grid surfaces, and a 46k+ combinatorial layout system.",
    colors: ["#fafaf8", "#111111"],
    category: "premium",
    htmlSlug: "remix-interactive-3d-portfolio",
    variant: "minimal-mono",
    cover: folioScatterCover,
  },
  {
    id: "axiom-vector",
    name: "Axiom — Vector Network",
    description:
      "Editorial white-paper deck with a live vector-network constellation, massive Syne display + Inter body, violet & electric-blue accents, and a 46k+ combinatorial layout system.",
    colors: ["#ffffff", "#7c3aed"],
    category: "premium",
    htmlSlug: "remix-abstract-vector-network",
    variant: "bold-display",
    cover: axiomVectorCover,
  },
  {
    id: "prisma-creative-studio",
    name: "Prisma — Creative Studio",
    description:
      "Dark cinematic editorial deck with warm cream (#DEDBC8) accents, Almarai display + Instrument Serif italics, subtle film-grain noise overlay, and moody black surfaces.",
    colors: ["#000000", "#DEDBC8"],
    category: "premium",
    htmlSlug: "remix-prisma-creative-studio",
    variant: "prisma-cinematic",
    cover: prismaStudioCover,
  },
];

/**
 * Standard tier — multiple style variants powered by the Plus AI Presentations API.
 * Each variant just steers Plus AI with a different style/tone prompt prefix;
 * the result is always a real .pptx file rendered via StandardSlidesCard.
 */
export const STANDARD_HTML_TEMPLATES: SlidesTemplate[] = [
  {
    id: "standard-manila",
    name: "Manila",
    description: "Versatile, minimalist yellow template. Great for any kind of presentation.",
    colors: ["#fde047", "#0a0a0a"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: manilaCover,
    stylePrompt:
      "Use the Manila template style — bright yellow background, bold black sans-serif headlines, minimalist Swiss layout with small geometric accents.",
  },
  {
    id: "standard-mallorca",
    name: "Mallorca",
    description: "Bright, colorful template for personal and professional presentations.",
    colors: ["#f4a896", "#c9a8d8"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: mallorcaCover,
    stylePrompt:
      "Use the Mallorca template style — warm peach and lavender palette, yellow serif headlines, playful overlapping circle shapes.",
  },
  {
    id: "standard-potpourri",
    name: "Potpourri",
    description: "Creative template with decorative collage elements.",
    colors: ["#f5f0e6", "#ec4899"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: potpourriCover,
    stylePrompt:
      "Use the Potpourri template style — cream background, magazine-collage aesthetic with cut-out shapes, bold serif typography, expressive layout.",
  },
  {
    id: "standard-feemo",
    name: "Feemo",
    description: "Playful template with 3D illustrations for education and informal presentations.",
    colors: ["#7c7df0", "#a5b4fc"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: feemoCover,
    stylePrompt:
      "Use the Feemo template style — soft purple-blue gradient, white sans-serif headlines, friendly 3D clay illustrations, informal educational tone.",
  },
  {
    id: "standard-sketchpad",
    name: "Modern Sketchpad",
    description:
      "Minimalist yet playful template. Great for text-heavy education or academic content.",
    colors: ["#ffffff", "#4ade80"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: sketchpadCover,
    stylePrompt:
      "Use the Modern Sketchpad template style — white notebook background, handwritten-feel headlines with bright mint green highlights, playful doodle accents.",
  },
  {
    id: "standard-corporate-blue",
    name: "Corporate Blue",
    description: "Clean corporate deck with deep navy palette. Executive-ready.",
    colors: ["#0a2540", "#3b82f6"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: corporateBlueCover,
    stylePrompt:
      "Use a Corporate Blue style — deep navy background, crisp white sans-serif headlines, executive tone, concise bullet points.",
  },
  {
    id: "standard-modernist-siena",
    name: "Modernist Siena",
    description: "Warm terracotta editorial template with refined Italian modernist feel.",
    colors: ["#b85042", "#f5f0e6"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: modernistSienaCover,
    stylePrompt:
      "Use the Modernist Siena template style — burnt terracotta background, cream serif headlines, refined editorial Italian modernist layout.",
  },
  {
    id: "standard-indigo",
    name: "Indigo",
    description: "Confident deep indigo template with clean modern typography.",
    colors: ["#3730a3", "#818cf8"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: indigoCover,
    stylePrompt:
      "Use the Indigo template style — deep indigo background, bold white sans-serif headlines, geometric line accents, modern confident tone.",
  },
  {
    id: "standard-herbert",
    name: "Herbert",
    description: "Classic editorial template with crimson sidebar and elegant serif typography.",
    colors: ["#f5f0e6", "#8b1a1a"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: herbertCover,
    stylePrompt:
      "Use the Herbert template style — cream pages with a deep crimson sidebar, elegant serif headlines, classic editorial book layout.",
  },
  {
    id: "standard-brut-seascape",
    name: "Brut Seascape",
    description: "Brutalist template with painterly seascape brushstrokes and raw texture.",
    colors: ["#e7e3dc", "#2d6e7e"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: brutSeascapeCover,
    stylePrompt:
      "Use the Brut Seascape template style — raw concrete background, brutalist brushstrokes in teal and sandy beige, bold uppercase headlines, textured atmospheric feel.",
  },
  {
    id: "standard-aurora",
    name: "Aurora",
    description: "Atmospheric template with dreamy aurora borealis colors on a dark night sky.",
    colors: ["#0a0a18", "#a78bfa"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: auroraCover,
    stylePrompt:
      "Use the Aurora template style — dark night sky background, flowing aurora ribbons of teal, magenta and violet, elegant white serif headlines, dreamy atmospheric mood.",
  },
  {
    id: "standard-insight",
    name: "Insight",
    description: "Clean modern template with calm teal accents on a white canvas.",
    colors: ["#ffffff", "#5eead4"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: insightCover,
    stylePrompt:
      "Use the Insight template style — clean white background, calm teal accent shapes, modern sans-serif headlines, refined data-friendly layout.",
  },
  {
    id: "standard-insight-modern",
    name: "Insight Modern",
    description: "Contemporary deck with deep navy blocks and a bright orange accent.",
    colors: ["#fafafa", "#0a2540"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: insightModernCover,
    stylePrompt:
      "Use the Insight Modern template style — off-white canvas with bold deep navy headline blocks, bright orange accent squares, contemporary editorial business layout.",
  },
  {
    id: "standard-insight-bold",
    name: "Insight Bold",
    description: "High-contrast bold deck with massive type on black and a yellow accent.",
    colors: ["#0a0a0a", "#facc15"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: insightBoldCover,
    stylePrompt:
      "Use the Insight Bold template style — deep black background, massive uppercase white sans-serif headlines, single bright yellow accent stripe, confident high-impact layout.",
  },
  {
    id: "standard-simple-notebook",
    name: "Simple Notebook",
    description: "Lined notebook page aesthetic — friendly, text-heavy, study-ready.",
    colors: ["#fdf6e3", "#dc2626"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: simpleNotebookCover,
    stylePrompt:
      "Use the Simple Notebook template style — cream lined notebook paper background, blue ruling lines, red margin line, handwritten friendly tone, perfect for study or education content.",
  },
  {
    id: "standard-swiss-light",
    name: "Swiss Light",
    description: "Crisp Swiss design — white grid, Helvetica feel, single red accent.",
    colors: ["#ffffff", "#dc2626"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: swissLightCover,
    stylePrompt:
      "Use the Swiss Light template style — pure white background with thin grid, Helvetica-style sans-serif, single red accent rectangle, strict minimalist Swiss typography layout.",
  },
  {
    id: "standard-swiss-dark",
    name: "Swiss Dark",
    description: "Dark Swiss design — charcoal grid, sharp white type, red accent.",
    colors: ["#0f0f10", "#dc2626"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: swissDarkCover,
    stylePrompt:
      "Use the Swiss Dark template style — charcoal background with thin white grid, sharp white Helvetica-style sans-serif, single red accent rectangle, strict minimalist Swiss layout.",
  },
  {
    id: "standard-fred",
    name: "Fred",
    description: "Warm friendly template with cozy beige tones and mustard accents.",
    colors: ["#f5e6c8", "#d97706"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: fredCover,
    stylePrompt:
      "Use the Fred template style — soft beige cream background, rounded mustard yellow shapes, chocolate brown accents, cozy approachable retro tone.",
  },
  {
    id: "standard-editorial",
    name: "Editorial",
    description: "Magazine-style editorial deck with refined serif typography.",
    colors: ["#f8f5ef", "#991b1b"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: editorialCover,
    stylePrompt:
      "Use the Editorial template style — off-white paper background, elegant black serif headlines, deep red accent line, refined magazine editorial layout.",
  },
  {
    id: "standard-forest-floor",
    name: "Forest Floor",
    description: "Organic deck with mossy greens and botanical natural texture.",
    colors: ["#1a3a1f", "#a8c49d"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: forestFloorCover,
    stylePrompt:
      "Use the Forest Floor template style — deep mossy green background, earthy brown and cream natural texture, organic botanical leaf accents, grounded nature-inspired tone.",
  },
  {
    id: "standard-kin",
    name: "Kin",
    description: "Warm minimal template with soft coral and peach tones.",
    colors: ["#fcd5c4", "#c44a3a"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: kinCover,
    stylePrompt:
      "Use the Kin template style — soft pink and peach background, rounded coral organic shapes, warm brown accents, cozy contemporary lifestyle tone.",
  },
  {
    id: "standard-spiral-notebook",
    name: "Spiral Notebook",
    description: "Spiral-bound notebook aesthetic — friendly, study-oriented layout.",
    colors: ["#ffffff", "#94a3b8"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: spiralNotebookCover,
    stylePrompt:
      "Use the Spiral Notebook template style — white paper page with silver metal spiral binding on the left, faint ruled lines, friendly handwritten study aesthetic.",
  },
  {
    id: "standard-composition-book",
    name: "Composition Book",
    description: "Classic black-and-white composition notebook cover aesthetic.",
    colors: ["#0a0a0a", "#f5f5f5"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: compositionBookCover,
    stylePrompt:
      "Use the Composition Book template style — classic black and white marbled notebook cover, centered white label area, school-book serious academic tone.",
  },
  {
    id: "standard-blackboard",
    name: "Blackboard",
    description: "Dark green chalkboard aesthetic — classroom-friendly and clear.",
    colors: ["#1e3a2a", "#f5f5f5"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: blackboardCover,
    stylePrompt:
      "Use the Blackboard template style — dark green chalkboard background with subtle white chalk texture, handwritten chalk-style headlines, classroom education tone.",
  },
  {
    id: "standard-modernist-professional",
    name: "Modernist Professional",
    description: "Refined corporate modernist deck with deep blue blocks and gold accent.",
    colors: ["#ffffff", "#0b2a72"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: modernistProfessionalCover,
    stylePrompt:
      "Use the Modernist Professional template style — clean white background, bold deep blue rectangular blocks, thin gold accent line, refined corporate modernist layout.",
  },
  {
    id: "standard-metro",
    name: "Metro",
    description: "Tile-based deck with bold color blocks — energetic and modular.",
    colors: ["#0f766e", "#ea580c"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: metroCover,
    stylePrompt:
      "Use the Metro template style — grid of flat colored square tiles in teal, orange, charcoal and cream, modern metro tile UI layout, modular structured tone.",
  },
  {
    id: "standard-brut-tigris",
    name: "Brut Tigris",
    description: "Brutalist concrete deck with bold burnt orange brushstrokes.",
    colors: ["#d6d3ce", "#ea580c"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: brutTigrisCover,
    stylePrompt:
      "Use the Brut Tigris template style — raw concrete texture background, bold burnt orange painterly brushstrokes, rough black uppercase headlines, brutalist textured atmosphere.",
  },
  {
    id: "standard-brut-brick",
    name: "Brut Brick",
    description: "Brutalist exposed-brick deck with cream painted blocks.",
    colors: ["#c2532e", "#fdf6e3"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: brutBrickCover,
    stylePrompt:
      "Use the Brut Brick template style — exposed red brick wall background, rough cream painted brushstroke blocks, bold black uppercase headlines, raw industrial tone.",
  },
  {
    id: "standard-minimalist-light",
    name: "Minimalist Light",
    description: "Extreme negative space — pure white with a single thin line.",
    colors: ["#ffffff", "#0a0a0a"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: minimalistLightCover,
    stylePrompt:
      "Use the Minimalist Light template style — pure white background, a single thin black horizontal line and tiny black square accent, extreme negative space minimalism, calm refined tone.",
  },
  {
    id: "standard-plus-default",
    name: "Default",
    description: "A friendly default — warm gradient and approachable layout.",
    colors: ["#fdf6f9", "#c084fc"],
    category: "standard",
    htmlSlug: "",
    variant: "plus-ai",
    cover: plusDefaultCover,
    stylePrompt:
      "Use the Plus Default template style — soft warm off-white background, friendly purple gradient diagonal stripe, small geometric accent dots, approachable balanced default presentation tone.",
  },
];

export const SLIDES_TEMPLATES: SlidesTemplate[] = [...STANDARD_HTML_TEMPLATES];

export const DEFAULT_SLIDES_TEMPLATE = "standard-manila";

export function findSlidesTemplate(id?: string | null): SlidesTemplate {
  const direct = SLIDES_TEMPLATES.find((t) => t.id === id);
  if (direct) return direct;
  // Legacy ids → unified Plus AI default.
  return STANDARD_HTML_TEMPLATES[0]!;
}

export function isPremiumHtml(id?: string | null): boolean {
  const t = findSlidesTemplate(id);
  return t.category === "premium" && !!t.htmlSlug;
}

/** True when the picked template should go through the Plus AI standard pipeline. */
export function isStandardSlides(id?: string | null): boolean {
  return findSlidesTemplate(id).category === "standard";
}
