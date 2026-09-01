/**
 * Presentation layer for in-chat tool calls.
 *
 * Turns a raw tool name + payload into something a human can read:
 * a domain icon, a bilingual label, a one-line summary of what happened,
 * and (when possible) a rich preview instead of a JSON dump.
 */
import type { LucideIcon } from "lucide-react";
import {
  Brain,
  Calendar,
  Code2,
  Database,
  Github,
  FileText,
  Globe,
  Image as ImageIcon,
  Mail,
  MapPin,
  MonitorPlay,
  Music,
  Search,
  Sparkle,
  Table,
  Terminal,
  Video,
  Wrench,
  Rocket,
} from "lucide-react";

export interface ToolMeta {
  icon: LucideIcon;
  label: string;
  /** Tailwind text colour for the icon. */
  tint: string;
}

interface Rule {
  test: RegExp;
  icon: LucideIcon;
  ar: string;
  en: string;
  tint: string;
}

const RULES: Rule[] = [
  { test: /(web_?search|serp|google|bing|search)/i, icon: Search, ar: "بحث في الويب", en: "Web search", tint: "text-sky-400" },
  { test: /(browse|fetch_url|open_url|scrape|crawl|visit)/i, icon: Globe, ar: "تصفّح صفحة", en: "Browse page", tint: "text-sky-400" },
  { test: /(browser|screenshot|chrome|playwright)/i, icon: MonitorPlay, ar: "متصفح", en: "Browser", tint: "text-indigo-400" },
  { test: /(computer|operator|manus|desktop)/i, icon: MonitorPlay, ar: "كمبيوتر Megsy", en: "Megsy Computer", tint: "text-blue-400" },
  { test: /(github|git_|repository|pull_request)/i, icon: Github, ar: "GitHub", en: "GitHub", tint: "text-foreground" },
  { test: /(deploy|publish|vercel|hosting|site_build)/i, icon: Rocket, ar: "النشر", en: "Deploy", tint: "text-blue-400" },
  { test: /(terminal|shell|bash|exec|command)/i, icon: Terminal, ar: "تيرمنال", en: "Terminal", tint: "text-emerald-400" },
  { test: /(code|python|node|run_script|interpreter)/i, icon: Code2, ar: "تشغيل كود", en: "Run code", tint: "text-emerald-400" },
  { test: /(file|upload|download|read_file|write_file|document|pdf|docx)/i, icon: FileText, ar: "ملفات", en: "Files", tint: "text-amber-400" },
  { test: /(image|photo|draw|nano_?banana|dalle|gpt_?image)/i, icon: ImageIcon, ar: "توليد صورة", en: "Image", tint: "text-fuchsia-400" },
  { test: /(video|veo|kling|runway)/i, icon: Video, ar: "توليد فيديو", en: "Video", tint: "text-rose-400" },
  { test: /(audio|voice|tts|speech|music)/i, icon: Music, ar: "صوت", en: "Audio", tint: "text-violet-400" },
  { test: /(memory|remember|recall)/i, icon: Brain, ar: "الذاكرة", en: "Memory", tint: "text-teal-400" },
  { test: /(calendar|event|schedule|meeting)/i, icon: Calendar, ar: "التقويم", en: "Calendar", tint: "text-orange-400" },
  { test: /(mail|gmail|email|smtp)/i, icon: Mail, ar: "البريد", en: "Email", tint: "text-orange-400" },
  { test: /(map|location|geo|places)/i, icon: MapPin, ar: "الخرائط", en: "Maps", tint: "text-lime-400" },
  { test: /(sql|database|supabase|query|table)/i, icon: Database, ar: "قاعدة البيانات", en: "Database", tint: "text-cyan-400" },
  { test: /(sheet|csv|excel|spreadsheet)/i, icon: Table, ar: "جداول", en: "Spreadsheet", tint: "text-green-400" },
  { test: /(slide|deck|presentation)/i, icon: Sparkle, ar: "شرائح", en: "Slides", tint: "text-yellow-400" },
];

export function isArabicUI(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dir === "rtl" ||
    (document.documentElement.lang || "").toLowerCase().startsWith("ar");
}

export function getToolMeta(name: string, appSlug?: string): ToolMeta {
  const ar = isArabicUI();
  const identity = `${appSlug || ""} ${name}`.trim();
  for (const r of RULES) {
    if (r.test.test(identity)) return { icon: r.icon, label: ar ? r.ar : r.en, tint: r.tint };
  }
  return { icon: Wrench, label: prettifyToolName(name), tint: "text-muted-foreground" };
}

export function prettifyToolName(name: string): string {
  if (!name) return isArabicUI() ? "أداة" : "Tool";
  return name.replace(/[_.]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Short human sentence describing the tool's input, shown next to the label. */
export function describeArgs(args: unknown): string {
  if (!args || typeof args !== "object") return typeof args === "string" ? args.slice(0, 60) : "";
  const o = args as Record<string, unknown>;
  const key = ["query", "q", "search", "url", "path", "file", "prompt", "command", "code", "text", "name"].find(
    (k) => typeof o[k] === "string" && (o[k] as string).trim(),
  );
  return key ? String(o[key]).slice(0, 80) : "";
}

/** Short human sentence describing the result, shown when the card is collapsed. */
export function describeResult(result: unknown): string {
  const ar = isArabicUI();
  if (result === undefined || result === null) return "";
  if (typeof result === "string") {
    const t = result.trim();
    return t.length > 90 ? `${t.slice(0, 90)}…` : t;
  }
  if (Array.isArray(result)) return ar ? `${result.length} عنصر` : `${result.length} items`;
  const o = result as Record<string, unknown>;
  for (const k of ["results", "sources", "organic", "items", "files", "images"]) {
    if (Array.isArray(o[k])) {
      const n = (o[k] as unknown[]).length;
      return ar ? `${n} نتيجة` : `${n} results`;
    }
  }
  for (const k of ["summary", "text", "content", "message", "output"]) {
    if (typeof o[k] === "string" && (o[k] as string).trim()) {
      const t = (o[k] as string).trim();
      return t.length > 90 ? `${t.slice(0, 90)}…` : t;
    }
  }
  return ar ? "تم" : "Done";
}

const IMAGE_RE = /https?:\/\/[^\s"')]+\.(png|jpe?g|webp|gif|avif)(\?[^\s"')]*)?/gi;
const FILE_RE = /https?:\/\/[^\s"')]+\.(pdf|docx?|xlsx?|pptx?|csv|zip|txt|md|mp4|mp3|wav)(\?[^\s"')]*)?/gi;

function collect(value: unknown, re: RegExp): string[] {
  // safeStringifyTool returns undefined for empty/unserialisable results — a
  // running tool has no result yet, so guard before scanning.
  const text = typeof value === "string" ? value : safeStringifyTool(value);
  if (typeof text !== "string" || !text) return [];
  const out = new Set<string>();
  for (const m of text.matchAll(re)) out.add(m[0]);
  return [...out].slice(0, 8);
}

export function extractImages(result: unknown): string[] {
  return collect(result, IMAGE_RE);
}

export function extractFiles(result: unknown): string[] {
  return collect(result, FILE_RE);
}

/** Best-effort readable body: prefer plain text fields over raw JSON. */
export function readableBody(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    for (const k of ["summary", "text", "content", "markdown", "message", "output", "stdout"]) {
      if (typeof o[k] === "string" && (o[k] as string).trim()) return o[k] as string;
    }
  }
  return safeStringifyTool(value);
}

export function safeStringifyTool(value: unknown): string {
  try {
    if (typeof value === "string") return value;
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
