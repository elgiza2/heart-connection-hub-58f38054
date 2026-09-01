import type { ChatMode } from "../chatConstants";

export type ChatSeoMeta = { title: string; description: string; path: string };

/**
 * Per-mode SEO metadata for the Chat page. Each entry maps a ChatMode to a
 * concise, keyword-rich title and description plus the canonical path used
 * by SEOHead. Kept in a data module so the giant ChatPage component does not
 * carry this constant in its render scope.
 */
export const SEO_BY_MODE: Record<ChatMode, ChatSeoMeta> = {
  normal: {
    title: "Megsy AI Chat — GPT-5.5, Claude 4.5, Gemini 3 Pro & 80+ Models",
    description:
      "Free AI chat with GPT-5.5, Claude 4.5, Gemini 3 Pro, Grok 4, Llama and 80+ frontier models in one place. No sign-up required to start chatting.",
    path: "/chat",
  },
  learning: {
    title: "Learning Mode — Personal AI Tutor for Any Subject",
    description:
      "Learn anything step-by-step with an AI tutor. Adaptive explanations, practice questions, study timers and music — completely free.",
    path: "/chat?mode=learning",
  },
  shopping: {
    title: "AI Shopping Assistant — Compare & Find Better Prices",
    description:
      "Ask anything, compare real products across stores, see live prices and find the best deal with AI shopping search.",
    path: "/chat?mode=shopping",
  },
  "deep-research": {
    title: "Deep Research — Multi-Step AI Research with Real Sources",
    description:
      "Run multi-step AI research with cited, real-time sources. Outlines, reads, summarizes and writes a full report you can export.",
    path: "/chat?mode=deep-research",
  },
  slides: {
    title: "AI Slides Generator — Beautiful Presentations from a Prompt",
    description:
      "Generate full presentations from a single prompt. Premium templates, real research-backed content and one-click export.",
    path: "/chat?mode=slides",
  },
  "slides-images": {
    title: "AI Slides with Image Generation — Visual Presentations Built by AI",
    description:
      "Generate slide decks where every slide ships with a custom AI-generated image. Cinematic, on-brand visuals in minutes.",
    path: "/chat?mode=slides-images",
  },
  operator: {
    title: "Megsy Operator — Autonomous Browser Agent",
    description:
      "Delegate real tasks to an AI agent that browses, clicks and fills forms on your behalf — fully supervised.",
    path: "/chat?mode=operator",
  },
  images: {
    title: "AI Image Generation — Scene-by-Scene Visuals from Chat",
    description:
      "Describe an idea, pick a model, and the AI plans a set of cohesive shots before generating each image in chat.",
    path: "/chat?mode=images",
  },
  video: {
    title: "AI Video Generation — Cinematic Shots from a Single Prompt",
    description:
      "Describe a scene, pick a model, and the AI breaks it into shots before generating each video clip sequentially.",
    path: "/chat?mode=video",
  },
  code: {
    title: "Coder Mode — AI Pair Programmer with Live Preview",
    description:
      "Generate React, TypeScript, HTML and Python code with an AI coder. Preview UI snippets instantly inside the chat.",
    path: "/chat?mode=code",
  },
};

export function getSeoMeta(mode: ChatMode): ChatSeoMeta {
  return SEO_BY_MODE[mode] || SEO_BY_MODE.normal;
}
