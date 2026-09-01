import {
  GraduationCap,
  ShoppingCart,
  Search,
  Presentation,
  PenTool,
  FileSpreadsheet,
  ScrollText,
  ImageIcon,
  Video,
  Mic,
  Music2,
  FileText,
  Sparkles,
  Brain,
  Mail,
  FileStack,
  Bot,
  Code2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";


export interface AgentModel {
  id: string;
  label: string;
  cost: number; // MC per unit
}

export interface AgentDef {
  id: string;
  label: string;
  mention: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  description: string;
  category: "chat" | "files" | "images" | "videos" | "voice" | "code" | "integration";
  models?: AgentModel[];
}

export const AGENTS: AgentDef[] = [
  // Chat modes
  {
    id: "learning",
    label: "Learning",
    mention: "@learning",
    icon: GraduationCap,
    color: "text-emerald-400",
    bg: "bg-emerald-500/15",
    description: "Step-by-step explanations",
    category: "chat",
  },
  {
    id: "shopping",
    label: "Shopping",
    mention: "@shopping",
    icon: ShoppingCart,
    color: "text-amber-400",
    bg: "bg-amber-500/15",
    description: "Product search & compare",
    category: "chat",
  },
  {
    id: "deep-research",
    label: "Deep Research",
    mention: "@research",
    icon: Search,
    color: "text-blue-400",
    bg: "bg-blue-500/15",
    description: "In-depth web research",
    category: "chat",
  },



  {
    id: "computer",
    label: "Computer",
    mention: "@computer",
    icon: Bot,
    color: "text-slate-300",
    bg: "bg-slate-500/15",
    description: "Full computer: browser, terminal, files & real tasks",
    category: "chat",
  },
  {
    id: "dev",
    label: "Dev",
    mention: "@dev",
    icon: Code2,
    color: "text-sky-400",
    bg: "bg-sky-500/15",
    description: "Builds & ships real React apps in a cloud VM",
    category: "code",
  },



  // File agents
  {
    id: "slides",
    label: "Slides",
    mention: "@slides",
    icon: Presentation,
    color: "text-violet-400",
    bg: "bg-violet-500/15",
    description: "Create presentations",
    category: "files",
  },
  {
    id: "resume",
    label: "Resume",
    mention: "@resume",
    icon: PenTool,
    color: "text-cyan-400",
    bg: "bg-cyan-500/15",
    description: "Build professional resumes",
    category: "files",
  },
  {
    id: "spreadsheet",
    label: "Spreadsheet",
    mention: "@spreadsheet",
    icon: FileSpreadsheet,
    color: "text-green-400",
    bg: "bg-green-500/15",
    description: "Generate spreadsheets",
    category: "files",
  },
  {
    id: "document",
    label: "Document",
    mention: "@document",
    icon: ScrollText,
    color: "text-orange-400",
    bg: "bg-orange-500/15",
    description: "Write documents & reports",
    category: "files",
  },
  {
    id: "docs",
    label: "Docs",
    mention: "@docs",
    icon: FileStack,
    color: "text-indigo-400",
    bg: "bg-indigo-500/15",
    description: "Professional templates: Reports, Contracts, research and more",
    category: "files",
  },

  // Cross-workspace tools with models
  // All non-Megsy models are routed through OpenRouter via Apify's or-bridge
  // actor — zero external API keys required.
  {
    id: "images",
    label: "Images",
    mention: "@images",
    icon: ImageIcon,
    color: "text-pink-400",
    bg: "bg-pink-500/15",
    description: "Generate AI images",
    category: "images",
    models: [
      { id: "megsy-image", label: "Megsy Image", cost: 8 },
      { id: "nano-banana-pro", label: "Nano Banana Pro", cost: 4 },
      { id: "nano-banana-2", label: "Nano Banana 2", cost: 3 },
      { id: "nano-banana", label: "Nano Banana", cost: 2 },
      { id: "gemini-3-pro-image", label: "Gemini 3 Pro Image", cost: 10 },
      { id: "gpt-image-2", label: "GPT Image 2", cost: 6 },
      { id: "gpt-5-image", label: "GPT-5 Image", cost: 12 },
      { id: "gpt-5.4-image-2", label: "GPT-5.4 Image 2", cost: 14 },
    ],
  },
  {
    id: "videos",
    label: "Videos",
    mention: "@videos",
    icon: Video,
    color: "text-red-400",
    bg: "bg-red-500/15",
    description: "Create AI videos",
    category: "videos",
    models: [
      { id: "megsy-video", label: "Megsy Video", cost: 40 },
      { id: "seedance-2-0", label: "Seedance 2.0", cost: 35 },
      { id: "seedance-2-0-fast", label: "Seedance 2.0 Fast", cost: 30 },
      { id: "seedance-1-5-pro", label: "Seedance 1.5 Pro", cost: 60 },
      { id: "hailuo-2-3", label: "Hailuo 2.3", cost: 40 },
      { id: "kling-video-o1", label: "Kling Master", cost: 90 },
      { id: "veo-3-1", label: "Veo 3.1", cost: 80 },
      { id: "veo-3-1-lite", label: "Veo 3.1 Lite", cost: 50 },
      { id: "sora-2-pro", label: "Sora 2 Pro", cost: 100 },
    ],
  },

  {
    id: "voice",
    label: "Voice",
    mention: "@voice",
    icon: Mic,
    color: "text-purple-400",
    bg: "bg-purple-500/15",
    description: "Text-to-speech & voice",
    category: "voice",
    models: [
      { id: "tts", label: "Text to Speech", cost: 2 },
      { id: "voice-clone", label: "Voice Clone", cost: 5 },
    ],
  },

  // Integrations
  {
    id: "integrations",
    label: "Integrations",
    mention: "@integrations",
    icon: Mail,
    color: "text-teal-400",
    bg: "bg-teal-500/15",
    description: "Gmail, Outlook, Slack & more",
    category: "integration",
    models: [
      { id: "gmail", label: "Gmail", cost: 0 },
      { id: "outlook", label: "Outlook", cost: 0 },
      { id: "slack", label: "Slack", cost: 0 },
      { id: "discord", label: "Discord", cost: 0 },
      { id: "microsoftteams", label: "Microsoft Teams", cost: 0 },
      { id: "telegram", label: "Telegram", cost: 0 },
      { id: "zoom", label: "Zoom", cost: 0 },
      { id: "notion", label: "Notion", cost: 0 },
      { id: "googlecalendar", label: "Google Calendar", cost: 0 },
      { id: "googledrive", label: "Google Drive", cost: 0 },
      { id: "googlesheets", label: "Google Sheets", cost: 0 },
      { id: "googledocs", label: "Google Docs", cost: 0 },
      { id: "airtable", label: "Airtable", cost: 0 },
      { id: "trello", label: "Trello", cost: 0 },
      { id: "asana", label: "Asana", cost: 0 },
      { id: "clickup", label: "ClickUp", cost: 0 },
      { id: "linear", label: "Linear", cost: 0 },
      { id: "jira", label: "Jira", cost: 0 },
      { id: "github", label: "GitHub", cost: 0 },
      { id: "gitlab", label: "GitLab", cost: 0 },
      { id: "linkedin", label: "LinkedIn", cost: 0 },
      { id: "twitter", label: "X / Twitter", cost: 0 },
      { id: "instagram", label: "Instagram", cost: 0 },
      { id: "facebook", label: "Facebook", cost: 0 },
      { id: "youtube", label: "YouTube", cost: 0 },
      { id: "hubspot", label: "HubSpot", cost: 0 },
      { id: "salesforce", label: "Salesforce", cost: 0 },
      { id: "stripe", label: "Stripe", cost: 0 },
      { id: "shopify", label: "Shopify", cost: 0 },
      { id: "dropbox", label: "Dropbox", cost: 0 },
    ],
  },
];

export const getAgentById = (id: string) => AGENTS.find((a) => a.id === id);
export const getAgentByMention = (mention: string) => AGENTS.find((a) => a.mention === mention);
export const filterAgents = (query: string) => {
  const q = query.toLowerCase();
  return AGENTS.filter(
    (a) => a.label.toLowerCase().includes(q) || a.mention.toLowerCase().includes(q),
  );
};
