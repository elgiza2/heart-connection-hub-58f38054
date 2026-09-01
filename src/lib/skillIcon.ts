/** @doc Resolve a lucide icon for a skill from its stored icon name or its title. */
import {
  Sparkles,
  FileText,
  Mail,
  Code2,
  Rocket,
  PenLine,
  Palette,
  BarChart3,
  Scale,
  Megaphone,
  Video,
  Briefcase,
  Brain,
  GraduationCap,
  Search,
  Layers,
  Coins,
  Users,
  MessageSquare,
  Camera,
  Globe,
  Lightbulb,
  ShoppingCart,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const BY_NAME: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  filetext: FileText,
  mail: Mail,
  code: Code2,
  code2: Code2,
  rocket: Rocket,
  penline: PenLine,
  pen: PenLine,
  palette: Palette,
  barchart3: BarChart3,
  barchart: BarChart3,
  scale: Scale,
  megaphone: Megaphone,
  video: Video,
  briefcase: Briefcase,
  brain: Brain,
  graduationcap: GraduationCap,
  search: Search,
  layers: Layers,
  coins: Coins,
  users: Users,
  messagesquare: MessageSquare,
  camera: Camera,
  globe: Globe,
  lightbulb: Lightbulb,
  shoppingcart: ShoppingCart,
  wrench: Wrench,
};

const BY_KEYWORD: Array<[RegExp, LucideIcon]> = [
  [/engineer|developer|code|program|software|dev\b/i, Code2],
  [/design|ux|ui|brand voice|visual/i, Palette],
  [/brand|position|naming/i, Sparkles],
  [/ceo|founder|startup|vision/i, Rocket],
  [/product|prd|roadmap/i, Layers],
  [/copywrit|writer|writing|content|blog|script/i, PenLine],
  [/market|growth|seo|ads|campaign/i, Megaphone],
  [/sales|closer|pitch|cold email|outreach/i, Mail],
  [/data|analyt|metrics|report/i, BarChart3],
  [/legal|law|contract|policy|compliance/i, Scale],
  [/finance|account|cashflow|budget|pricing|revenue/i, Coins],
  [/tiktok|video|youtube|reels|film/i, Video],
  [/photo|image|camera|thumbnail/i, Camera],
  [/teacher|tutor|coach|learn|study|math/i, GraduationCap],
  [/idea|brainstorm|creative|innovation/i, Lightbulb],
  [/research|search|analyst|insight/i, Search],
  [/hr|people|recruit|team|community/i, Users],
  [/support|customer|chat|reply/i, MessageSquare],
  [/ecommerce|shop|store|product listing/i, ShoppingCart],
  [/ops|operations|process|automation|workflow/i, Wrench],
  [/strategy|consult|business|advisor/i, Briefcase],
  [/translate|language|global|local/i, Globe],
  [/psycholog|think|reason|mind/i, Brain],
  [/doc|document|summary|notes|report/i, FileText],
];

/** Returns a lucide icon component for a skill (never null). */
export function resolveSkillIcon(name?: string | null, icon?: string | null): LucideIcon {
  if (icon) {
    const key = icon.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (BY_NAME[key]) return BY_NAME[key];
  }
  const n = name || "";
  for (const [re, Comp] of BY_KEYWORD) if (re.test(n)) return Comp;
  return Sparkles;
}

/** True when the stored icon is an emoji rather than a lucide name. */
export function skillEmoji(icon?: string | null): string | null {
  if (!icon) return null;
  const trimmed = icon.trim();
  if (!trimmed) return null;
  return /[\p{Extended_Pictographic}]/u.test(trimmed) ? trimmed : null;
}
