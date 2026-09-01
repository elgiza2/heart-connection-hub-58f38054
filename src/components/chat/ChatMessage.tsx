import { useState, useCallback, useMemo, useRef, useEffect, useDeferredValue, memo, lazy, Suspense, Component as ReactComponent } from "react";
import { createPortal } from "react-dom";
import { PrefetchLink as Link } from "@/components/common/PrefetchLink";

import { GlassSheet, GlassSheetContent } from "@/components/ui/glass-sheet";
import {
  Copy,
  ThumbsUp,
  ThumbsDown,
  Check,
  Play,
  FileUp,
  Link2,
  Pencil,
  Ellipsis,
  ChevronDown,
  Terminal as TerminalIcon,
  FolderTree,
  Brain,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { m as motion, AnimatePresence } from "framer-motion";
import MegsyStarBrand from "@/components/branding/MegsyStar";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { useKatexPlugin, hasMath } from "@/lib/lazyKatex";
import { chatMarkdownSchema } from "@/lib/security/markdownSanitize";
import { visit, SKIP } from "unist-util-visit";
import { toString } from "mdast-util-to-string";
import { toast } from "sonner";
import ThinkingLoader from "./ThinkingLoader";
import ParallelAgentsPanel, { type ParallelAgentTask } from "./ParallelAgentsPanel";
import { detectLang, langDir } from "@/lib/detectLang";
import { parseLearnSegments, hasLearnCards } from "@/lib/learnCardParser";
import { parseConnectSegments, hasConnectCards } from "@/lib/chat/connectCardParser";
import { useSmoothText } from "@/hooks/useSmoothText";

// Heavy / conditionally-rendered components — lazy load
const FlowCard = lazy(() => import("@/components/showcase/FlowCard"));
const InfoCards = lazy(() => import("@/components/showcase/InfoCards"));
const CodePreviewModal = lazy(() => import("@/components/modals/CodePreviewModal"));
const ImagePreviewModal = lazy(() => import("@/components/modals/ImagePreviewModal"));
const CoderStudioModal = lazy(() => import("@/components/coder/CoderStudioModal"));
const CoderProjectCard = lazy(() => import("@/components/coder/CoderProjectCard"));
const DeepResearchCard = lazy(() => import("@/components/chat/DeepResearchCard"));
const LearnCard = lazy(() => import("@/components/learn/LearnCard"));
const ConnectCard = lazy(() => import("@/components/chat/ConnectCard"));

// Per-card error boundary so a single malformed/edge-case card never
// takes down the entire learn message. Silent by design — a broken card
// is dropped and the rest of the reply keeps rendering.
class SafeLearnCardBoundary extends ReactComponent<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    /* swallow */
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}
const StepFlowCards = lazy(() => import("@/components/chat/StepFlowCards"));
import { parseSteps } from "@/components/chat/StepFlowCards";
// CodeBlock pulls in react-syntax-highlighter + Prism (~500 KB). Load it
// lazily so text-only messages never pay for the syntax highlighter — the
// component is only mounted the first time we render a fenced code block.
const CodeBlock = lazy(() => import("@/components/chat/CodeBlock"));
const MermaidBlock = lazy(() => import("@/components/chat/MermaidBlock"));
const ArtifactCanvas = lazy(() => import("@/components/chat/ArtifactCanvas"));
import { extractProjectFiles } from "@/lib/extractProjectFiles";
import { parseSlidesOutline } from "@/lib/slidesOutlineParser";
import {
  ChainOfThought,
  ChainOfThoughtStep,
  ChainOfThoughtTrigger,
  ChainOfThoughtContent,
  ChainOfThoughtItem,
} from "@/components/prompt-kit/chain-of-thought";
import { Message, MessageContent } from "@/components/prompt-kit/message";
import ThinkingTrace from "./ThinkingTrace";
import { estimateTokens, formatTokens } from "@/pages/chat/utils/estimateTokens";
import { SecureVideo } from "@/components/chat/media/SecureVideo";
import { stripPlanClaims } from "@/pages/chat/chatUtils";


interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  messageIndex?: number;
  isStreaming?: boolean;
  isThinking?: boolean;
  images?: string[];
  videos?: string[];
  audios?: string[];
  products?: {
    title: string;
    price: string;
    image?: string;
    link?: string;
    seller?: string;
    rating?: string | null;
    delivery?: string | null;
  }[];
  attachedImages?: string[];
  attachedFiles?: { name: string; type: string; data?: string }[];
  onLike?: (liked: boolean | null) => void;
  onLikeMessage?: (index: number, liked: boolean | null) => void;
  liked?: boolean | null;
  onShare?: () => void;
  onStructuredAction?: (text: string) => void;
  searchStatus?: string;
  toolActivity?: {
    name: string;
    appSlug?: string;
    target?: string;
    status: "running" | "done" | "error";
  } | null;
  parallelTasks?: ParallelAgentTask[];
  onEditUserMessage?: (text: string) => void;
  onEditUserMessageAt?: (index: number, text: string) => void;
  isDeepResearch?: boolean;
  isSlidesMode?: boolean;
  isLearningMode?: boolean;
  researchQuery?: string;
  researchSessionKey?: string;
  narrations?: string[];
  senderName?: string | null;
  senderAvatar?: string | null;
  isOtherMember?: boolean;
  bubbleColor?: { bg: string; text: string } | null;
  messageId?: string;
  reactions?: { id: string; emoji: string; user_id: string }[];
  onToggleReaction?: (messageId: string, emoji: string) => void;
  currentUserId?: string;
  usersById?: Record<string, { name?: string; avatar?: string }>;
  readers?: { user_id: string; name?: string; avatar?: string }[];
  showReaders?: boolean;
  /** Optional slot rendered between message body and the action buttons. Used for artifact cards (docs/slides) so actions appear below the artifact. */
  bottomSlot?: React.ReactNode;
  /** Hide action buttons (copy/like/dislike) — used when an interactive clarify card is shown below. */
  hideActions?: boolean;
  /** When set, shows a "Regenerate" button on assistant messages. */
  onRegenerate?: () => void;
  /** When set (and message is interrupted), the Resume button calls this instead of onRegenerate — it should continue rather than restart. */
  onResume?: () => void;
  /** When set, shows a "Branch" (fork) button on assistant messages. */
  onBranch?: () => void;
  /** Per-message tool activity captured from SSE — rendered as compact cards. */
  toolParts?: import("@/pages/chat/chatConstants").ToolPart[];
  /** Streaming reasoning / thinking tokens from the model. */
  reasoning?: string;
  /** True if this assistant message was interrupted mid-stream (reload / connection loss). */
  interrupted?: boolean;
  /** Optional per-response timing metrics (duration / ttft). */
  timing?: import("@/pages/chat/chatConstants").Message["timing"];
  /** Human-friendly model label for the assistant response. */
  modelLabel?: string | null;
  /** Full metadata blob (used for trust/transparency insights). */
  metadata?: Record<string, any> | null;

  /** Regenerate-branch navigation for assistant messages (prev/next versions). */
  branchInfo?: import("@/pages/chat/branching/branchHistory").BranchInfo | null;
}

const getDomain = (url: string) => {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
};

const getFavicon = (url: string) => {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`;
  } catch {
    return null;
  }
};

function parseStructuredBlocks(
  content: string,
): { type: "text" | "questions" | "flow" | "cards"; data: any; raw: string }[] {
  const blocks: { type: "text" | "questions" | "flow" | "cards"; data: any; raw: string }[] = [];
  const jsonBlockRegex = /```json\s*\n?([\s\S]*?)\n?```/g;
  let lastIndex = 0;
  let match;

  while ((match = jsonBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index).trim();
      if (textBefore) blocks.push({ type: "text", data: textBefore, raw: textBefore });
    }
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.type === "questions" && parsed.questions) {
        blocks.push({ type: "questions", data: parsed, raw: match[0] });
      } else if (parsed.type === "flow" && parsed.steps) {
        blocks.push({ type: "flow", data: parsed, raw: match[0] });
      } else if (parsed.type === "cards" && parsed.items) {
        blocks.push({ type: "cards", data: parsed, raw: match[0] });
      } else {
        blocks.push({ type: "text", data: match[0], raw: match[0] });
      }
    } catch {
      blocks.push({ type: "text", data: match[0], raw: match[0] });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex).trim();
    if (remaining) blocks.push({ type: "text", data: remaining, raw: remaining });
  }
  if (blocks.length === 0 && content.trim()) {
    blocks.push({ type: "text", data: content, raw: content });
  }
  return blocks;
}

const isPreviewableCode = (lang: string | undefined, code: string): boolean => {
  if (!lang) return false;
  const previewableLangs = ["html", "htm", "jsx", "tsx", "javascript", "js", "react", "python", "py"];
  return previewableLangs.includes(lang.toLowerCase());
};

const wrapCodeForPreview = (lang: string, code: string): string => {
  if (["html", "htm"].includes(lang.toLowerCase())) {
    return code;
  }
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#111}</style>
</head><body>
<div id="root"></div>
<script>${code}</script>
</body></html>`;
};

const wrapEnglishInBdi = (text: string): (string | React.ReactElement)[] => {
  const parts: (string | React.ReactElement)[] = [];
  const regex = /[A-Za-z0-9_./:\-]+/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<bdi key={match.index}>{match[0]}</bdi>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : [text];
};

const BidiText = ({ children }: { children: React.ReactNode }) => {
  if (typeof children === "string") {
    return <>{wrapEnglishInBdi(children)}</>;
  }
  if (Array.isArray(children)) {
    return (
      <>
        {children.map((child, i) =>
          typeof child === "string" ? <span key={i}>{wrapEnglishInBdi(child)}</span> : child,
        )}
      </>
    );
  }
  return <>{children}</>;
};

const formatRawUrls = (text: string): string => {
  const parts = text.split(/(<[^>]+>|!?\[[^\]]*\]\([^)]+\))/g);
  return parts
    .map((part) => {
      if (/^<[^>]+>$/.test(part) || /^!?\[[^\]]*\]\([^)]+\)$/.test(part)) return part;
      return part.replace(/(?<!\]\()https?:\/\/[^\s<>")\]]+/g, (url) => {
        const cleanUrl = url.replace(/[.,;:!?]+$/, "");
        try {
          const domain = new URL(cleanUrl).hostname.replace("www.", "");
          return `[${domain}](${cleanUrl})`;
        } catch {
          return cleanUrl;
        }
      });
    })
    .join("");
};

const researchHeadingLabels = new Set([
  "Search the web",
  "Overview",
  "Key Findings",
  "Image Gallery",
  "Sources",
  "References",
  "overview",
  "key findings",
  "image gallery",
  "sources",
  "references",
]);

const normalizeResearchMarkdown = (content: string) => {
  if (!content.trim()) return { cleaned: content, extractedImages: [] as string[] };

  const extractedImages: string[] = [];
  const cleaned = content
    .replace(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g, (_m, url) => {
      extractedImages.push(url);
      return "";
    })
    .replace(/^\s*##\s*Search the web\s*$/gim, "")
    .replace(/^\s*##\s*(?:Overview|Overview)\s*$/gim, "")
    .replace(/^\s*##\s*(?:Highlights|Key Findings)\s*$/gim, "")
    .replace(/^\s*##\s*(?:Gallery Images|Image Gallery)\s*$/gim, "")
    .replace(
      /\n+\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(?:Sources|Sources|References|References|المصادر|المراجع|مصادر|مراجع)\s*(?:\/\s*(?:Sources|Sources|References|References|المصادر|المراجع|مصادر|مراجع))?\s*[:：]?\s*(?:\*\*)?\s*\n[\s\S]*$/i,
      "",
    )
    .replace(/^\s*\*\*(\d+)\.\s*\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\*\*\s*$/gm, "### [$2]($3)")
    .replace(/^\s*Here is a summary[^\n]*$\n?/gim, "")
    .replace(/^\s*Here is a summary[^\n]*$\n?/gim, "")
    .replace(/^\s*Below is a summary[^\n]*$\n?/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    cleaned,
    extractedImages: extractedImages.filter((url, index, arr) => arr.indexOf(url) === index),
  };
};

const remarkCleanResearchLayout = () => {
  return (tree: any) => {
    const removeIndexes = new Set<number>();
    const children = Array.isArray(tree?.children) ? tree.children : [];

    children.forEach((node: any, index: number) => {
      if (node?.type === "heading") {
        const label = toString(node).trim().toLowerCase();
        if (researchHeadingLabels.has(label)) {
          removeIndexes.add(index);
        }
      }
    });

    visit(tree, "paragraph", (node: any, index: number | undefined, parent: any) => {
      if (typeof index !== "number" || !parent?.children) return;
      const text = toString(node).trim();
      if (
        /^Here is a summary/i.test(text) ||
        /^here('?s| is) what i found/i.test(text) ||
        /^below is a summary/i.test(text)
      ) {
        parent.children.splice(index, 1);
        return [SKIP, index];
      }
    });

    if (removeIndexes.size > 0) {
      tree.children = children.filter((_: any, index: number) => !removeIndexes.has(index));
    }
  };
};

const looksLikeSlidesInfo = (text: string) => {
  const slideLabels = text.match(/(?:Title|Image|Text|Slide|Slide|Title|Image|Text)\s*:/gi) || [];
  const slideMarkers = text.match(/(?:^|\n)\s*(?:#{1,4}\s*)?(?:Slide|Slide)\s*\d+/gi) || [];
  return slideLabels.length >= 3 || slideMarkers.length >= 2;
};

const cleanLearnSegmentText = (text: string) =>
  text
    .replace(/```\s*(?:learn|learn_card|json)?\s*[\s\S]*?```/gi, "")
    .replace(/```\s*(?:learn|learn_card|json)?\s*/gi, "")
    .replace(/`{2,}\s*\\?\s*/g, "")
    .trim();

const stripLearnBlocks = (text: string) =>
  text.replace(/```\s*(?:learn|learn_card|json)?\s*[\s\S]*?(?:```|$)/gi, "").trim();

const MarkdownRenderer = ({
  content,
  onLinkClick,
  onPreviewCode,
}: {
  content: string;
  onLinkClick: (e: React.MouseEvent<HTMLAnchorElement>, href: string) => void;
  onPreviewCode?: (code: string, lang: string) => void;
}) => {
  // Defer markdown re-parses while tokens stream in. Keeps input & scroll
  // responsive at 60fps even on very long messages.
  const deferredContent = useDeferredValue(content);
  const katexPlugin = useKatexPlugin(hasMath(deferredContent));
  return (
  <ReactMarkdown
    remarkPlugins={[remarkGfm, remarkBreaks, remarkMath, remarkCleanResearchLayout]}
    // SECURITY: rehypeRaw parses raw HTML from markdown; without a sanitizer
    // any AI/user/shared-conversation content could inject <script>, event
    // handlers, or javascript: URIs. rehypeSanitize with our KaTeX-aware
    // schema runs immediately after and strips them while preserving math and
    // BiDi attributes.
    rehypePlugins={
      katexPlugin
        ? [rehypeRaw, [rehypeSanitize, chatMarkdownSchema], katexPlugin]
        : [rehypeRaw, [rehypeSanitize, chatMarkdownSchema]]
    }
    components={{
      p: ({ children }) => (
        <p dir="auto">
          <BidiText>{children}</BidiText>
        </p>
      ),
      li: ({ children }) => (
        <li dir="auto">
          <BidiText>{children}</BidiText>
        </li>
      ),
      strong: ({ children }) => (
        <strong>
          <BidiText>{children}</BidiText>
        </strong>
      ),
      em: ({ children }) => (
        <em>
          <BidiText>{children}</BidiText>
        </em>
      ),
      a: ({ href, children }) =>
        href === "/billing" || href === "/settings/billing" ? (
          <Link
            to="/settings/billing"
            className="my-2 inline-flex items-center justify-center rounded-full bg-primary/90 text-primary-foreground px-4 py-2 text-sm font-semibold no-underline border border-primary/60 shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.6)] hover:bg-primary transition-colors"
          >
            {children}
          </Link>
        ) : (
          <a
            href={href}
            onClick={(e) => href && onLinkClick(e, href)}
            className="text-indigo-400 underline decoration-indigo-400/30 underline-offset-4 hover:decoration-indigo-400 transition-all cursor-pointer"
          >
            {children}
          </a>
        ),
      code: ({ className, children, ...props }) => {
        const match = /language-(\w+)/.exec(className || "");
        const lang = match ? match[1] : undefined;
        const codeStr = String(children).replace(/\n$/, "");
        const isBlock = className?.startsWith("language-");

        if (isBlock && lang && ["learn", "learn_card", "cards", "json"].includes(lang)) {
          return null;
        }

        if (isBlock && lang === "mermaid") {
          return (
            <Suspense fallback={<div className="my-4 h-24 rounded-2xl bg-foreground/[0.04] animate-pulse" />}>
              <MermaidBlock code={codeStr} />
            </Suspense>
          );
        }

        if (isBlock && lang) {
          const canPreview = isPreviewableCode(lang, codeStr);
          return (
            <Suspense
              fallback={
                <pre className="my-3 overflow-x-auto rounded-lg bg-foreground/[0.06] p-4 text-[13px] leading-6 text-foreground/80 font-mono">
                  <code>{codeStr}</code>
                </pre>
              }
            >
              <CodeBlock
                code={codeStr}
                lang={lang}
                className={className}
                onPreview={canPreview && onPreviewCode ? onPreviewCode : undefined}
              />
            </Suspense>
          );
        }

        return (
          <code
            className="px-1.5 py-0.5 rounded bg-foreground/[0.08] text-indigo-300 text-[0.85em] font-mono"
            {...props}
          >
            {children}
          </code>
        );
      },
      pre: ({ children }) => <>{children}</>,
      blockquote: ({ children }) => (
        <blockquote className="my-4 py-1 ps-4 border-s-2 border-indigo-500/50 italic text-foreground/70">
          {children}
        </blockquote>
      ),
      hr: () => <hr className="my-6 border-0 border-t border-border/60" />,
      ul: ({ children }) => <ul>{children}</ul>,
      ol: ({ children }) => <ol>{children}</ol>,
      table: ({ children }) => {
        // Extract header labels for mobile stacked view (data-label on td::before)
        const headers: string[] = [];
        try {
          const arr = Array.isArray(children) ? children : [children];
          for (const node of arr as any[]) {
            if (node?.type === "thead" || node?.props?.node?.tagName === "thead") {
              const rows = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children];
              const firstRow = rows.find((r: any) => r?.type === "tr" || r?.props?.node?.tagName === "tr");
              const cells = firstRow?.props?.children;
              const cellArr = Array.isArray(cells) ? cells : [cells];
              for (const c of cellArr) {
                if (!c) continue;
                const label = typeof c === "string"
                  ? c
                  : (typeof c?.props?.children === "string"
                      ? c.props.children
                      : Array.isArray(c?.props?.children)
                        ? c.props.children.filter((x: any) => typeof x === "string").join(" ")
                        : "");
                headers.push(String(label || "").trim());
              }
            }
          }
        } catch {}
        const headersJson = JSON.stringify(headers);
        return (
          <div className="chat-md-table-wrap my-5" data-headers={headersJson}>
            <div className="chat-md-table-scroll">
              <table className="chat-md-table">{children}</table>
            </div>
          </div>
        );
      },
      thead: ({ children }) => <thead>{children}</thead>,
      tbody: ({ children }) => <tbody>{children}</tbody>,
      tr: ({ children }) => <tr>{children}</tr>,
      th: ({ children }) => <th>{children}</th>,
      td: ({ children, ...rest }: any) => {
        // Read column index from the DOM parent-set data attributes (fallback) —
        // otherwise data-label is populated at runtime via CSS + a small helper below.
        return <td {...rest}>{children}</td>;
      },
      br: () => <br />,
      img: ({ src, alt }) =>
        src ? (
          <img decoding="async"
            src={src}
            alt={alt || ""}
            loading="lazy"
            className="my-3 max-w-full h-auto rounded-xl border border-foreground/10 shadow-lg"
          />
        ) : null,
      video: ({ src, ...props }: any) => (
        <SecureVideo
          src={src}
          controls
          playsInline
          className="my-3 w-full max-w-full rounded-xl border border-foreground/10 shadow-lg bg-background"
          {...props}
        />
      ),
      iframe: ({ src, title, ...props }: any) => (
        <div className="my-3 relative w-full aspect-video overflow-hidden rounded-xl border border-foreground/10 shadow-lg bg-background">
          <iframe
            src={src}
            title={title || "embedded content"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute inset-0 w-full h-full border-0"
            {...props}
          />
        </div>
      ),
    }}
  >
    {formatRawUrls(deferredContent)}
  </ReactMarkdown>
  );
};

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🎉"];

const ReactionsRow = ({
  reactions,
  currentUserId,
  onToggle,
  messageId,
  align,
}: {
  reactions: { id: string; emoji: string; user_id: string }[];
  currentUserId?: string;
  onToggle?: (id: string, emoji: string) => void;
  messageId?: string;
  align: "left" | "right";
}) => {
  
  const grouped = useMemo(() => {
    const map: Record<string, { count: number; mine: boolean }> = {};
    for (const r of reactions) {
      if (!map[r.emoji]) map[r.emoji] = { count: 0, mine: false };
      map[r.emoji].count++;
      if (r.user_id === currentUserId) map[r.emoji].mine = true;
    }
    return Object.entries(map);
  }, [reactions, currentUserId]);
  if (!messageId || !onToggle) return null;
  if (grouped.length === 0) return null;
  return (
    <div
      className={`flex items-center gap-1 mt-1 flex-wrap ${align === "right" ? "justify-end" : "justify-start"}`}
    >
      {grouped.map(([emoji, { count, mine }]) => (
        <button
          key={emoji}
          onClick={() => onToggle(messageId, emoji)}
          className={`px-2 py-0.5 rounded-full text-[12px] flex items-center gap-1 border transition-colors ${mine ? "bg-primary/15 border-primary/40 text-foreground" : "bg-accent/30 border-border/30 text-foreground/80 hover:bg-accent/50"}`}
        >
          <span>{emoji}</span>
          <span className="text-[11px] font-medium">{count}</span>
        </button>
      ))}
    </div>
  );
};

const ReadersRow = ({
  readers,
  align,
}: {
  readers: { user_id: string; name?: string; avatar?: string }[];
  align: "left" | "right";
}) => {
  if (!readers.length) return null;
  return (
    <div
      className={`flex items-center gap-1 mt-1 ${align === "right" ? "justify-end" : "justify-start"}`}
    >
      <span className="text-[10px] text-muted-foreground mr-1">Seen by</span>
      <div className="flex -space-x-1.5">
        {readers.slice(0, 4).map((r) =>
          r.avatar ? (
            <img loading="lazy" decoding="async"
              key={r.user_id}
              src={r.avatar}
              alt={r.name || ""}
              title={r.name || ""}
              className="w-4 h-4 rounded-full border border-background object-cover"
            />
          ) : (
            <div
              key={r.user_id}
              title={r.name || ""}
              className="w-4 h-4 rounded-full border border-background bg-accent flex items-center justify-center text-[8px] font-bold text-foreground/70"
            >
              {(r.name || "?")[0]?.toUpperCase()}
            </div>
          ),
        )}
        {readers.length > 4 && (
          <span className="text-[10px] text-muted-foreground ml-1">+{readers.length - 4}</span>
        )}
      </div>
    </div>
  );
};

const renderTextWithMentions = (text: string) => {
  const parts = text.split(/(@[A-Za-z0-9_]+)/g);
  return parts.map((p, i) =>
    p.startsWith("@") ? (
      <span key={i} className="px-1 rounded bg-foreground/25 font-semibold">
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
};

const renderChildrenWithMentions = (children: React.ReactNode): React.ReactNode => {
  if (typeof children === "string") return renderTextWithMentions(children);
  if (Array.isArray(children)) {
    return children.map((c, i) =>
      typeof c === "string" ? <span key={i}>{renderTextWithMentions(c)}</span> : c,
    );
  }
  return children;
};

const UserMarkdown = ({
  content,
  onLinkClick,
}: {
  content: string;
  onLinkClick: (e: React.MouseEvent<HTMLAnchorElement>, href: string) => void;
}) => {
  const katexPlugin = useKatexPlugin(hasMath(content));
  return (
  <ReactMarkdown
    remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
    rehypePlugins={katexPlugin ? [katexPlugin] : []}
    components={{
      p: ({ children }) => (
        <p className="m-0 [&:not(:first-child)]:mt-2">{renderChildrenWithMentions(children)}</p>
      ),
      li: ({ children }) => <li>{renderChildrenWithMentions(children)}</li>,
      strong: ({ children }) => (
        <strong className="font-bold">{renderChildrenWithMentions(children)}</strong>
      ),
      em: ({ children }) => <em>{renderChildrenWithMentions(children)}</em>,
      del: ({ children }) => <del>{renderChildrenWithMentions(children)}</del>,
      a: ({ href, children }) => (
        <a
          href={href}
          onClick={(e) => href && onLinkClick(e, href)}
          className="underline underline-offset-2 cursor-pointer hover:opacity-80"
        >
          {children}
        </a>
      ),
      code: ({ className, children, ...props }) => {
        const isBlock = className?.startsWith("language-");
        if (isBlock) {
          return (
            <pre className="my-2 p-2 rounded-lg bg-background/25 overflow-x-auto text-[12px] leading-relaxed">
              <code {...props}>{children}</code>
            </pre>
          );
        }
        return (
          <code className="px-1 py-0.5 rounded bg-background/20 text-[12px] font-mono" {...props}>
            {children}
          </code>
        );
      },
      pre: ({ children }) => <>{children}</>,
      ul: ({ children }) => <ul className="list-disc ps-5 my-1 space-y-0.5">{children}</ul>,
      ol: ({ children }) => <ol className="list-decimal ps-5 my-1 space-y-0.5">{children}</ol>,
      blockquote: ({ children }) => (
        <blockquote className="border-s-2 border-foreground/40 ps-2 my-1 opacity-90">
          {children}
        </blockquote>
      ),
      h1: ({ children }) => (
        <h1 dir="auto" className="text-base font-bold mt-1 mb-1">{renderChildrenWithMentions(children)}</h1>
      ),
      h2: ({ children }) => (
        <h2 dir="auto" className="text-base font-bold mt-1 mb-1">{renderChildrenWithMentions(children)}</h2>
      ),
      h3: ({ children }) => (
        <h3 dir="auto" className="text-sm font-bold mt-1 mb-1">{renderChildrenWithMentions(children)}</h3>
      ),
    }}
  >
    {content}
  </ReactMarkdown>
  );
};

const ChatMessage = ({
  role,
  content,
  messageIndex,
  isStreaming,
  isThinking,
  images,
  videos,
  audios,
  products,
  attachedImages,
  attachedFiles,
  onLike,
  onLikeMessage,
  liked,
  onShare,
  onStructuredAction,
  searchStatus,
  toolActivity,
  parallelTasks,
  onEditUserMessage,
  onEditUserMessageAt,
  isDeepResearch,
  isSlidesMode,
  isLearningMode,
  researchQuery,
  researchSessionKey,
  narrations,
  senderName,
  senderAvatar,
  isOtherMember,
  bubbleColor,
  messageId,
  reactions,
  onToggleReaction,
  currentUserId,
  readers,
  showReaders,
  bottomSlot,
  hideActions,
  onRegenerate,
  onResume,
  onBranch,
  toolParts,
  reasoning,
  interrupted,
  metadata,
  branchInfo,

}: ChatMessageProps) => {
  const [copied, setCopied] = useState(false);
  const [slidesInfoOpen, setSlidesInfoOpen] = useState(true);
  const [researchDraftOpen, setResearchDraftOpen] = useState(true);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [previewCode, setPreviewCode] = useState<{ code: string; lang: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Viewport-anchored position for the mobile Copy/Edit card. Rendered in a
  // portal so no ancestor (transform / overflow / RTL flip) can clip or
  // mis-place it.
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userBubbleRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const swipeStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const [swipeHint, setSwipeHint] = useState<"regen" | "branch" | null>(null);

  // Swipe gestures on the assistant bubble are DISABLED on purpose: a stray
  // horizontal drag (e.g. trying to open the sidebar) used to fire Regenerate
  // or Branch, which truncated the conversation and looked like content loss.
  const swipeEnabled = false as boolean;
  const handleTouchStart = swipeEnabled
    ? (e: React.TouchEvent) => {
        const t = e.touches[0];
        swipeStartRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
      }
    : undefined;
  const handleTouchEnd = swipeEnabled
    ? (e: React.TouchEvent) => {
        const start = swipeStartRef.current;
        swipeStartRef.current = null;
        setSwipeHint(null);
        if (!start) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        const dt = Date.now() - start.t;
        if (dt > 600) return;
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return;
        if (dx < 0 && onRegenerate) onRegenerate();
        else if (dx > 0 && onBranch) onBranch();
      }
    : undefined;
  const handleTouchMove = swipeEnabled
    ? (e: React.TouchEvent) => {
        const start = swipeStartRef.current;
        if (!start) return;
        const t = e.touches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy) * 2) {
          setSwipeHint(dx < 0 ? "regen" : "branch");
        } else {
          setSwipeHint(null);
        }
      }
    : undefined;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied");
  };

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // Measure the bubble and clamp the card inside the viewport.
  useEffect(() => {
    if (!menuOpen || role !== "user") {
      setMenuPos(null);
      return;
    }
    const place = () => {
      const el = userBubbleRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const W = 200;
      const H = 108;
      const pad = 10;
      let left = r.right - W;
      left = Math.min(Math.max(pad, left), window.innerWidth - W - pad);
      let top = r.top - H - 8;
      if (top < pad) top = Math.min(r.bottom + 8, window.innerHeight - H - pad);
      setMenuPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [menuOpen, role]);



  useEffect(() => {
    if (!menuOpen || role !== "user") return;

    const closeWhenOutsideMenu = (event: PointerEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (target && mobileMenuRef.current?.contains(target)) return;
      // Taps on the bubble itself are handled by its own toggle.
      if (target && userBubbleRef.current?.contains(target)) return;
      setMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeWhenOutsideMenu, true);
    document.addEventListener("touchstart", closeWhenOutsideMenu, true);

    return () => {
      document.removeEventListener("pointerdown", closeWhenOutsideMenu, true);
      document.removeEventListener("touchstart", closeWhenOutsideMenu, true);
    };
  }, [menuOpen, role]);

  const clearLongPress = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  const longPressFiredRef = useRef(false);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const handleLongPressStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (role !== "user") return;
      const touch = e.touches[0];
      longPressOriginRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
      longPressFiredRef.current = false;
      longPressRef.current = setTimeout(() => {
        longPressFiredRef.current = true;
        // Haptic-ish: brief vibrate if supported
        try {
          (navigator as any).vibrate?.(8);
        } catch {}
        setMenuOpen(true);
      }, 350);
    },
    [role],
  );

  // Only cancel the long press when the finger actually MOVES. Cancelling on
  // every touchmove (browsers emit them even for a still finger) is why the
  // Copy/Edit sheet never appeared on mobile.
  const handleLongPressMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const origin = longPressOriginRef.current;
      const touch = e.touches[0];
      if (!origin || !touch) return;
      if (Math.abs(touch.clientX - origin.x) > 12 || Math.abs(touch.clientY - origin.y) > 12) {
        clearLongPress();
        longPressOriginRef.current = null;
      }
    },
    [clearLongPress],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (role !== "user") return;
      e.preventDefault();
      // On desktop, open the inline Copy/Edit popover (NOT the mobile bottom
      // sheet — its overlay would cover the popover and make it look like
      // the menu vanished). On touch devices use the long-press sheet.
      const isDesktop =
        typeof window !== "undefined" &&
        window.matchMedia?.("(min-width: 768px) and (hover: hover)").matches;
      if (isDesktop) {
        setDesktopMenuOpen(true);
      } else {
        setMenuOpen(true);
      }
    },
    [role],
  );

  // Block the synthetic click that fires right after a long-press
  const handleBubbleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (longPressFiredRef.current) {
      e.preventDefault();
      e.stopPropagation();
      longPressFiredRef.current = false;
    }
  }, []);

  const handleLinkClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    window.open(href, "_blank", "width=800,height=600,scrollbars=yes,resizable=yes");
  }, []);

  const handlePreviewCode = useCallback((code: string, lang: string) => {
    setPreviewCode({ code, lang });
  }, []);

  const handleLikeAction = useCallback(
    (nextLiked: boolean | null) => {
      if (typeof messageIndex === "number" && onLikeMessage) {
        onLikeMessage(messageIndex, nextLiked);
        return;
      }
      onLike?.(nextLiked);
    },
    [messageIndex, onLike, onLikeMessage],
  );

  const handleEditAction = useCallback(() => {
    if (typeof messageIndex === "number" && onEditUserMessageAt) {
      onEditUserMessageAt(messageIndex, content);
      return;
    }
    onEditUserMessage?.(content);
  }, [content, messageIndex, onEditUserMessage, onEditUserMessageAt]);

  // Normalize legacy web-search markdown into a clean assistant-style message.
  const { displayContent: rawDisplayContent, inlineImages } = useMemo(() => {
    if (role === "user") return { displayContent: content, inlineImages: [] as string[] };
    const normalized = normalizeResearchMarkdown(content);
    // Final render-time guard: no assistant text may claim a plan / paid status,
    // regardless of which pipeline (chat, long-run, replay) produced it.
    return {
      displayContent: stripPlanClaims(normalized.cleaned),
      inlineImages: normalized.extractedImages,
    };
  }, [content, role]);

  // Smooth streaming: reveal assistant text character-by-character (~60fps)
  // so streamed tokens feel like ChatGPT/Claude instead of arriving in chunks.
  const displayContent = useSmoothText(rawDisplayContent, role === "assistant" && !!isStreaming);
  const learnRenderContent = role === "assistant" ? rawDisplayContent : displayContent;
  const hasLearnCardContent = role === "assistant" && hasLearnCards(learnRenderContent);
  const hasConnectCardContent = role === "assistant" && hasConnectCards(learnRenderContent);

  const structuredBlocks = useMemo(() => {
    if (role === "user" || isStreaming) return null;
    return parseStructuredBlocks(displayContent);
  }, [displayContent, role, isStreaming]);

  const urlRegex = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
  const links: { text: string; url: string }[] = [];
  let urlMatch;
  while ((urlMatch = urlRegex.exec(content)) !== null) {
    links.push({ text: urlMatch[1], url: urlMatch[2] });
  }
  const MEDIA_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|heic|mp4|webm|mov|m4v|mkv|ogg|mp3|wav)(\?|#|$)/i;
  const isMediaUrl = (url: string) => {
    try {
      const u = new URL(url);
      if (MEDIA_EXT_RE.test(u.pathname)) return true;
      const host = u.hostname.toLowerCase();
      if (/(^|\.)deapi\.ai$|(^|\.)wavespeed\.|(^|\.)runbase\.|(^|\.)alibaba-cdn\.|(^|\.)aliyuncs\.com$|(^|\.)oss-/.test(host)) return true;
      return false;
    } catch {
      return false;
    }
  };
  const uniqueLinks = links.filter(
    (link, i, arr) =>
      arr.findIndex((l) => l.url === link.url) === i && !isMediaUrl(link.url),
  );
  const metadataSources = useMemo(() => {
    const raw = Array.isArray(metadata?.researchSources) ? metadata.researchSources : [];
    const seen = new Set<string>();
    return raw
      .map((source: any) => ({
        text: String(source?.title || source?.url || "Source"),
        url: String(source?.url || ""),
      }))
      .filter((source) => {
        if (!source.url || seen.has(source.url) || isMediaUrl(source.url)) return false;
        seen.add(source.url);
        return true;
      });
  }, [metadata]);
  const sourceLinks = isDeepResearch ? metadataSources : uniqueLinks;
  const researchTraceText = Array.isArray(metadata?.researchTrace)
    ? metadata.researchTrace.map((item: unknown) => String(item)).filter(Boolean).join("\n")
    : "";
  // Show the "Thinking" disclosure on EVERY assistant reply that carries any
  // reasoning trace — even short ones (the model always thinks, even for
  // "هلا"). Only hide it when it is an exact echo of the final answer.
  const rawThoughts = (reasoning || researchTraceText || "").trim();
  const thoughtsText = (() => {
    if (!rawThoughts) return "";
    if (researchTraceText && !reasoning) return rawThoughts;
    const answer = (content || "").trim();
    if (answer && rawThoughts === answer) return "";
    return rawThoughts;
  })();
  // Thinking steps recorded on the saved message, so reopening a conversation
  // restores the same trace the user saw live instead of an empty panel.
  const persistedThinkingSteps = useMemo<string[]>(() => {
    const raw = (metadata as any)?.narrations;
    if (!Array.isArray(raw)) return [];
    return raw.map((item: unknown) => String(item || "").trim()).filter(Boolean);
  }, [metadata]);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [canvasOpen, setCanvasOpen] = useState(false);

  // Project-level preview button for Coder replies (multi-file outputs).
  const projectFiles = useMemo(
    () => (role === "assistant" && !isStreaming ? extractProjectFiles(content) : []),
    [role, isStreaming, content],
  );
  const canvasImages = useMemo(
    () => [...(images || []), ...inlineImages].filter((url, idx, arr) => arr.indexOf(url) === idx),
    [images, inlineImages],
  );
  const hasCanvasArtifact =
    role === "assistant" &&
    !isStreaming &&
    (projectFiles.length > 0 || canvasImages.length > 0 || uniqueLinks.length > 0 || content.length > 1200);
  const hasProjectPreview = projectFiles.length >= 2;
  const openProjectPreview = useCallback(() => {
    if (!projectFiles.length) return;
    const entry =
      projectFiles.find((f) => /\.(html?|tsx|jsx)$/i.test(f.path)) || projectFiles[0];
    setPreviewCode({ code: entry.content, lang: entry.lang });
  }, [projectFiles]);

  const [publishState, setPublishState] = useState<
    { status: "idle" } | { status: "loading" } | { status: "done"; url: string } | { status: "error"; message: string }
  >({ status: "idle" });
  const publishProjectNow = useCallback(async () => {
    if (!projectFiles.length) return;
    setPublishState({ status: "loading" });
    try {
      const { publishProject } = await import("@/lib/publishProject");
      const firstLine = (content || "").split("\n").find((l) => l.trim())?.slice(0, 80);
      const res = await publishProject(projectFiles, {
        title: firstLine || "Megsy Project",
      });
      setPublishState({ status: "done", url: res.url });
      try {
        await navigator.clipboard.writeText(res.url);
      } catch {}
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Publish failed";
      setPublishState({ status: "error", message });
    }
  }, [projectFiles, content]);

  const [studioOpen, setStudioOpen] = useState(false);

  // Detect a saved Megsy Coder project so old conversations render the compact
  // card instead of dumping raw fenced code blocks into the transcript.
  const isSavedCoderProject =
    role === "assistant" &&
    !isStreaming &&
    typeof content === "string" &&
    content.startsWith("Megsy Coder finished the build.") &&
    projectFiles.length > 0;
  const coderSummary = isSavedCoderProject
    ? content.replace(/^Megsy Coder finished the build\.\s*/, "").split("```")[0].trim()
    : "";



  // Other member's message → render on LEFT (assistant side) with avatar + name
  if (role === "user" && isOtherMember) {
    const initial = (senderName || "?")[0]?.toUpperCase();
    return (
      <div className="flex justify-start mb-6 gap-2.5 animate-message-rise">
        <div className="flex-shrink-0 mt-0.5">
          {senderAvatar ? (
            <img loading="lazy" decoding="async"
              src={senderAvatar}
              alt={senderName || ""}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-semibold text-foreground/70">
              {initial}
            </div>
          )}
        </div>
        <div className="max-w-[82%] min-w-0">
          {senderName && (
            <div
              className="text-[11px] font-semibold mb-1 px-1"
              style={{ color: bubbleColor?.bg || undefined }}
            >
              {senderName}
            </div>
          )}
          {attachedImages && attachedImages.length > 0 && (
            <div className="flex gap-2 mb-2 flex-wrap">
              {attachedImages.map((img, i) => (
                <img loading="lazy" decoding="async"
                  key={i}
                  src={img}
                  alt=""
                  className="rounded-xl max-h-32 max-w-[120px] object-cover"
                />
              ))}
            </div>
          )}
          {(() => {
            const l = detectLang(content);
            return (
              <div
                dir={langDir(l)}
                lang={l === "ar" ? "ar" : l === "en" ? "en" : undefined}
                className={`px-4 py-2.5 rounded-3xl rounded-bl-lg text-[0.9375rem] leading-relaxed select-text break-words user-bubble lang-${l}`}
                style={
                  bubbleColor
                    ? { background: bubbleColor.bg, color: bubbleColor.text }
                    : { background: "hsl(var(--muted))", color: "hsl(var(--foreground))" }
                }
              >
                <UserMarkdown content={content} onLinkClick={handleLinkClick} />
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  if (role === "user") {
    return (
      <div className="flex justify-end mb-6 relative animate-message-rise">
        <div className="max-w-[82%]">
          {senderName && (
            <div className="flex items-center gap-1.5 mb-1 justify-end pr-1">
              <span className="text-[11px] font-medium text-muted-foreground">{senderName}</span>
              {senderAvatar ? (
                <img loading="lazy" decoding="async" src={senderAvatar} alt="" className="w-4 h-4 rounded-full object-cover" />
              ) : (
                <div className="w-4 h-4 rounded-full bg-foreground/10 flex items-center justify-center text-[8px] font-semibold text-foreground/70">
                  {senderName[0]?.toUpperCase()}
                </div>
              )}
            </div>
          )}
          {attachedImages && attachedImages.length > 0 && (
            <div className="flex gap-2 mb-2 justify-end flex-wrap">
              {attachedImages.map((img, i) => (
                <img loading="lazy" decoding="async"
                  key={i}
                  src={img}
                  alt=""
                  className="rounded-xl max-h-32 max-w-[120px] object-cover"
                />
              ))}
            </div>
          )}
          {attachedFiles && attachedFiles.length > 0 && (
            <div className="flex gap-2 mb-2 justify-end flex-wrap">
              {attachedFiles.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted text-xs text-foreground border border-border"
                >
                  {f.type === "link" ? (
                    <Link2 className="w-3 h-3 text-muted-foreground" />
                  ) : (
                    <FileUp className="w-3 h-3 text-muted-foreground" />
                  )}
                  <span className="truncate max-w-[100px]">{f.name}</span>
                </div>
              ))}
            </div>
          )}
          {(() => {
            const l = detectLang(content);
            return (
              <div className="relative inline-block self-end group">
                <div
                  ref={userBubbleRef}
                  dir={langDir(l)}
                  lang={l === "ar" ? "ar" : l === "en" ? "en" : undefined}
                  onContextMenu={handleContextMenu}
                  onTouchStart={handleLongPressStart}
                  onTouchEnd={clearLongPress}
                  onTouchMove={handleLongPressMove}
                  onTouchCancel={clearLongPress}
                  onClick={handleBubbleClick}
                  style={{
                    background: "var(--user-bubble, #2563eb)",
                    color: "var(--user-bubble-text, #ffffff)",
                    WebkitTouchCallout: "none",
                    WebkitUserSelect: "none",
                    userSelect: "none",
                  }}
                  className={`px-4 py-2.5 rounded-3xl rounded-br-lg text-[0.9375rem] leading-relaxed break-words user-bubble lang-${l} transition-transform ${menuOpen ? "scale-[0.985]" : ""}`}
                >
                  <UserMarkdown content={content} onLinkClick={handleLinkClick} />
                </div>
                {/* Desktop hover actions: ellipsis menu button */}
                <div
                  className={`hidden md:flex absolute right-0 top-full mt-1.5 z-30 items-center gap-1 transition-opacity duration-150 ${desktopMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"}`}
                >
                  <Popover open={desktopMenuOpen} onOpenChange={setDesktopMenuOpen}>
                    <PopoverTrigger asChild>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDesktopMenuOpen((v) => !v);
                        }}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-foreground/[0.08] text-foreground border border-foreground/15 hover:bg-foreground/[0.14] transition-colors"
                        title="More"
                        aria-label="More"
                      >
                        <Ellipsis className="w-3.5 h-3.5" strokeWidth={1.8} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      side="bottom"
                      sideOffset={6}
                      className="z-50 w-[200px] rounded-ios-lg overflow-hidden bg-popover/95 text-popover-foreground border border-border/60 shadow-[0_24px_56px_-18px_rgba(0,0,0,0.7)] backdrop-blur-2xl p-1.5"
                    >
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          await handleCopy();
                          setDesktopMenuOpen(false);
                        }}
                        className="w-full flex items-center justify-between gap-4 px-3 h-11 rounded-xl text-popover-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                        role="menuitem"
                      >
                        <span className="text-[15px] font-normal">Copy</span>
                        <Copy className="w-[18px] h-[18px]" strokeWidth={1.8} />
                      </button>
                      <div className="h-px bg-border/60 mx-2" />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditAction();
                          setDesktopMenuOpen(false);
                        }}
                        className="w-full flex items-center justify-between gap-4 px-3 h-11 rounded-xl text-popover-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                        role="menuitem"
                      >
                        <span className="text-[15px] font-normal">Edit</span>
                        <Pencil className="w-[18px] h-[18px]" strokeWidth={1.8} />
                      </button>
                    </PopoverContent>
                  </Popover>
                </div>
                {/* Mobile long-press menu — rendered in a portal and anchored to
                    the bubble in viewport coordinates so nothing can clip it. */}
                {menuOpen && menuPos &&
                  createPortal(
                    <div className="md:hidden">
                      <div
                        className="fixed inset-0 z-[70]"
                        onClick={closeMenu}
                        onTouchStart={closeMenu}
                        aria-hidden
                      />
                      <div
                        ref={mobileMenuRef}
                        role="menu"
                        dir="ltr"
                        className="fixed z-[71] w-[200px] rounded-2xl p-1.5 bg-popover text-popover-foreground border border-border shadow-[0_18px_44px_-16px_hsl(var(--foreground)/0.45)] animate-in fade-in-0 zoom-in-95 duration-150"
                        style={{ top: menuPos.top, left: menuPos.left }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            await handleCopy();
                            closeMenu();
                          }}
                          className="w-full flex items-center gap-3 px-3.5 h-11 rounded-xl text-popover-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                          role="menuitem"
                        >
                          <Copy className="w-[18px] h-[18px] shrink-0" strokeWidth={1.8} />
                          <span className="text-[15px] font-medium text-left flex-1">Copy</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditAction();
                            closeMenu();
                          }}
                          className="w-full flex items-center gap-3 px-3.5 h-11 rounded-xl text-popover-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                          role="menuitem"
                        >
                          <Pencil className="w-[18px] h-[18px] shrink-0" strokeWidth={1.8} />
                          <span className="text-[15px] font-medium text-left flex-1">Edit</span>
                        </button>
                      </div>
                    </div>,
                    document.body,
                  )}

              </div>
            );
          })()}
          <ReactionsRow
            reactions={reactions || []}
            currentUserId={currentUserId}
            onToggle={onToggleReaction}
            messageId={messageId}
            align={isOtherMember ? "left" : "right"}
          />
          {showReaders && (
            <ReadersRow readers={readers || []} align={isOtherMember ? "left" : "right"} />
          )}
        </div>
      </div>
    );
  }

  const hasStructured = structuredBlocks && structuredBlocks.some((b) => b.type !== "text");

  // Deep Research: render a clean card after streaming completes; the card's
  // Open button loads the full report in the research preview page.
  const looksLikeResearch =
    role === "assistant" &&
    (/Browser Agent Result for/i.test(content) ||
      /===\s*Next Source\s*===/i.test(content) ||
      isDeepResearch === true);
  // Deep Research reports collapse into a card once streaming completes; the
  // full report lives on the dedicated preview page behind the Open button.
  const showResearchCard = looksLikeResearch && !isStreaming && content.trim().length > 200;

  const showNarration =
    role === "assistant" && isDeepResearch && narrations && narrations.length > 0;
  const isResearchActive = !!isStreaming || (!!isThinking && !content);
  const activeThinkingSteps = useMemo(() => {
    if (!toolActivity || toolActivity.status !== "running") return undefined;
    const name = String(toolActivity.name || "").replace(/_/g, " ").trim();
    const target = String(toolActivity.target || "").trim();
    const line = [name, target].filter(Boolean).join(" · ");
    return line ? [line] : undefined;
  }, [toolActivity]);
  // Stay in the "thinking" state for the whole turn — including while the
  // model is picking / invoking a tool (reasoning tokens already streaming).
  const showLiveThinkingTrace =
    role === "assistant" &&
    (!!isThinking || (!!isStreaming && !content)) &&
    !showNarration &&
    !hasLearnCardContent;

  const showSlidesInfoBox =
    role === "assistant" &&
    (looksLikeSlidesInfo(displayContent) || (!!isSlidesMode && displayContent.trim().length > 0));
  const hasRunningTool = !!toolParts?.some((part) => part.state === "running");

  return (
    <Message
      aria-live={role === "assistant" && isStreaming ? "polite" : undefined}
      aria-busy={role === "assistant" && isStreaming ? true : undefined}
      className="mb-6 relative animate-message-rise"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {swipeHint && (
        <div
          className={`pointer-events-none absolute top-2 z-10 px-2 py-1 rounded-md text-[11px] font-medium bg-primary/15 text-primary backdrop-blur-md ${
            swipeHint === "regen" ? "right-2" : "left-2"
          }`}
        >
          {swipeHint === "regen" ? "↻ Regenerate" : "⑂ Branch"}
        </div>
      )}
      <MessageContent>
        {showNarration && (
          <ThinkingTrace
            steps={narrations!}
            status={searchStatus}
            active={isResearchActive}
            running={hasRunningTool || toolActivity?.status === "running"}
          />
        )}
        {showLiveThinkingTrace && (
          <ThinkingTrace
            status={searchStatus}
            steps={[...(narrations || []), ...(activeThinkingSteps || [])]}
            text={reasoning}
            active
            running={hasRunningTool || toolActivity?.status === "running"}
            className={content ? "mb-2" : ""}
          />
        )}
        {role === "assistant" && parallelTasks && parallelTasks.length > 1 && (
          <ParallelAgentsPanel tasks={parallelTasks} active={!!isStreaming || !!isThinking} />
        )}
        {role === "assistant" &&
          reasoning &&
          !showNarration &&
          !showLiveThinkingTrace &&
          isStreaming && (
            <ThinkingTrace
              text={reasoning}
              status={searchStatus}
              active
              running={hasRunningTool || toolActivity?.status === "running"}
            />
          )}

        {role === "assistant" &&
          !isStreaming &&
          !showNarration &&
          (!!thoughtsText || persistedThinkingSteps.length > 0) && (
            <ThinkingTrace text={thoughtsText} steps={persistedThinkingSteps} />
          )}
        {role === "assistant" && interrupted && !isStreaming && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
            <span className="flex-1">The previous response was interrupted.</span>
            {(onResume || onRegenerate) && (
              <button
                type="button"
                onClick={onResume || onRegenerate}
                className="rounded-md bg-amber-400/20 px-2 py-1 font-medium text-amber-100 hover:bg-amber-400/30 transition-colors"
              >
                Resume
              </button>
            )}
          </div>
        )}

        {/* Tool usage is intentionally NOT rendered as cards/buttons inside the
            chat. It is surfaced through the thinking badge above instead. */}
        {hasConnectCardContent ? (
          <div className="space-y-2">
            <Suspense fallback={null}>
              {parseConnectSegments(learnRenderContent).map((seg, idx) => {
                if (seg.type === "connect") return <ConnectCard key={idx} spec={seg.spec} />;
                const txt = seg.text.trim();
                if (!txt) return null;
                const bl = detectLang(txt);
                return (
                  <div
                    key={idx}
                    dir={langDir(bl)}
                    lang={bl === "ar" ? "ar" : bl === "en" ? "en" : undefined}
                    className={`prose-chat text-foreground lang-${bl}`}
                  >
                    <MarkdownRenderer
                      content={txt}
                      onLinkClick={handleLinkClick}
                      onPreviewCode={handlePreviewCode}
                    />
                  </div>
                );
              })}
            </Suspense>
          </div>
        ) : hasLearnCardContent ? (
          <div className="space-y-3">
            <Suspense fallback={null}>
              {parseLearnSegments(learnRenderContent).map((seg, idx) => {
                if (seg.kind === "card" && seg.card) {
                  return (
                    <SafeLearnCardBoundary key={idx}>
                      <LearnCard
                        card={seg.card}
                        onAnswer={(t) => onStructuredAction?.(t)}
                      />
                    </SafeLearnCardBoundary>
                  );
                }
                const txt = cleanLearnSegmentText(seg.text || "");
                if (!txt) return null;
                const bl = detectLang(txt);
                return (
                  <div
                    key={idx}
                    dir={langDir(bl)}
                    lang={bl === "ar" ? "ar" : bl === "en" ? "en" : undefined}
                    className={`prose-chat text-foreground lang-${bl}`}
                  >
                    <MarkdownRenderer
                      content={txt}
                      onLinkClick={handleLinkClick}
                      onPreviewCode={handlePreviewCode}
                    />
                  </div>
                );
              })}
            </Suspense>
          </div>
        ) : isThinking && !content && !showNarration ? (
          null
        ) : isSavedCoderProject ? (
          <Suspense fallback={null}>
            <CoderProjectCard files={projectFiles} summary={coderSummary} projectId={messageId ? `msg:${messageId}` : undefined} />
          </Suspense>
        ) : showResearchCard ? (
          <Suspense fallback={<ThinkingLoader />}>
            <DeepResearchCard
              query={
                researchQuery ||
                content
                  .split("\n")
                  .find((l) => l.trim().length > 0)
                  ?.replace(/^#+\s*/, "")
                  .slice(0, 80) ||
                "Deep Research"
              }
              report={content}
              images={images || []}
              sessionKey={researchSessionKey}
            />
          </Suspense>
        ) : (
          <>
            {Array.isArray(videos) && videos.length > 0 && (
              <div className="flex flex-col gap-3 mb-3">
                {videos
                  .filter((v, i, a) => a.indexOf(v) === i)
                  .map((url, i) => (
                    <SecureVideo
                      key={`${url}-${i}`}
                      src={url}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full max-w-[28rem] rounded-xl bg-background border border-border/40"
                    />
                  ))}
              </div>
            )}
            {Array.isArray(audios) && audios.length > 0 && (
              <div className="flex flex-col gap-2 mb-3">
                {audios
                  .filter((v, i, a) => a.indexOf(v) === i)
                  .map((url, i) => (
                    <audio
                      key={`${url}-${i}`}
                      src={url}
                      controls
                      preload="metadata"
                      className="w-full max-w-[28rem]"
                    />
                  ))}
              </div>
            )}
            {(() => {
              // Hosts that block hot-linking (broken image icon in chat).
              const BLOCKED_IMG_HOSTS =
                /(^|\.)(tiktok\.com|instagram\.com|cdninstagram\.com|fbcdn\.net|lookaside\.instagram\.com|facebook\.com|x\.com|twitter\.com|twimg\.com)$/i;
              const isUsable = (u: string) => {
                try {
                  const h = new URL(u).hostname;
                  return !BLOCKED_IMG_HOSTS.test(h);
                } catch {
                  return false;
                }
              };
              const allImages = [...(images || []), ...inlineImages].filter(isUsable);
              const dedupImages = allImages.filter((u, i, a) => a.indexOf(u) === i);
              return (
                dedupImages.length > 0 && (
                  <div className="flex flex-col gap-3 mb-3 w-full max-w-[42rem]">
                    {dedupImages.map((img, i) => (
                      <img decoding="async"
                        key={i}
                        src={img}
                        alt=""
                        loading="lazy"
                        className="w-full max-h-[70vh] rounded-xl border border-border/40 object-contain bg-card/30 cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => setPreviewImageUrl(img)}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ))}
                  </div>
                )
              );
            })()}

            {/* Shopping product cards removed */}

            {hasProjectPreview && (
              <div className="mb-3 flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={openProjectPreview}
                  className="group inline-flex items-center gap-3 flex-1 rounded-2xl border border-border/60 bg-gradient-to-br from-surface-1 to-surface-3 px-4 py-3 text-left shadow-sm hover:shadow-md hover:border-[var(--megsy-blue)]/60 transition-all"
                >
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--megsy-blue)]/20 text-[var(--megsy-blue)] group-hover:bg-[var(--megsy-blue)] group-hover:text-foreground transition-colors">
                    <Play className="w-4 h-4" fill="currentColor" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-bold text-foreground">
                      Project preview
                    </span>
                    <span className="block text-[11px] text-foreground/60 truncate">
                      {projectFiles.length} files · Click to run and browse
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setStudioOpen(true)}
                  className="group inline-flex items-center gap-3 flex-1 rounded-2xl border border-border/60 bg-gradient-to-br from-surface-1 to-surface-3 px-4 py-3 text-left shadow-sm hover:shadow-md hover:border-emerald-400/60 transition-all"
                >
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-background transition-colors">
                    <FolderTree className="w-4 h-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-bold text-foreground">Files</span>
                    <span className="block text-[11px] text-foreground/60 truncate">
                      {projectFiles.length} files · Browse and edit
                    </span>
                  </span>
                </button>
              </div>
            )}







            {false ? (
              <div className="space-y-3">
                <Suspense fallback={null}>
                  {parseLearnSegments(learnRenderContent).map((seg, idx) => {
                    if (seg.kind === "card" && seg.card) {
                      return (
                        <LearnCard
                          key={idx}
                          card={seg.card}
                          onAnswer={(t) => onStructuredAction?.(t)}
                        />
                      );
                    }
                    const txt = cleanLearnSegmentText(seg.text || "");
                    if (!txt) return null;
                    const bl = detectLang(txt);
                    return (
                      <div
                        key={idx}
                        dir={langDir(bl)}
                        lang={bl === "ar" ? "ar" : bl === "en" ? "en" : undefined}
                        className={`prose-chat text-foreground lang-${bl}`}
                      >
                        <MarkdownRenderer
                          content={txt}
                          onLinkClick={handleLinkClick}
                          onPreviewCode={handlePreviewCode}
                        />
                      </div>
                    );
                  })}
                </Suspense>
              </div>
            ) : hasStructured && !isStreaming ? (
              <div className="space-y-3">
                <Suspense fallback={null}>
                  {structuredBlocks!.map((block, idx) => {
                    if (block.type === "flow") {
                      return (
                        <FlowCard
                          key={idx}
                          steps={block.data.steps}
                          onAction={(action, stepTitle) => {
                            onStructuredAction?.(`${action}: ${stepTitle}`);
                          }}
                        />
                      );
                    }
                    if (block.type === "cards") {
                      return (
                        <InfoCards
                          key={idx}
                          items={block.data.items}
                          onAction={(action, title) => {
                            onStructuredAction?.(`${action}: ${title}`);
                          }}
                        />
                      );
                    }
                    if (block.type === "questions") {
                      return null;
                    }
                    const blockText =
                      typeof block.data === "string" ? block.data : JSON.stringify(block.data);
                    const bl = detectLang(blockText);
                    return (
                      <div
                        key={idx}
                        dir={langDir(bl)}
                        lang={bl === "ar" ? "ar" : bl === "en" ? "en" : undefined}
                        className={`prose-chat text-foreground lang-${bl}`}
                      >
                        <MarkdownRenderer
                          content={blockText}
                          onLinkClick={handleLinkClick}
                          onPreviewCode={handlePreviewCode}
                        />
                      </div>
                    );
                  })}
                </Suspense>
              </div>
            ) : (
              (() => {
                const al = detectLang(displayContent);
                // Detect numbered step plans and render as connected step cards
                const { steps, remaining } =
                  !isStreaming && role === "assistant"
                    ? parseSteps(displayContent)
                    : { steps: [], remaining: displayContent };
                const bodyText = stripLearnBlocks(steps.length ? remaining : displayContent);
                // While a deep-research report is still streaming, wrap the live text
                // in a simple "live draft" box so it doesn't look like the final answer.
                const inner = (
                  <div
                    dir={langDir(al)}
                    lang={al === "ar" ? "ar" : al === "en" ? "en" : undefined}
                    className={`prose-chat text-foreground lang-${al}${isStreaming ? " stream-soft-edge" : ""}`}
                  >
                    {steps.length > 0 && (
                      <Suspense fallback={null}>
                        <StepFlowCards steps={steps} />
                      </Suspense>
                    )}
                    {bodyText && (
                      <MarkdownRenderer
                        content={bodyText}
                        onLinkClick={handleLinkClick}
                        onPreviewCode={handlePreviewCode}
                      />
                    )}
                  </div>
                );
                const innerWithStar = (
                  <div className="relative">
                    {inner}
                    {isStreaming && !!bodyText && (
                      <span className="inline-flex ms-1 align-baseline">
                        <MegsyStarBrand className="h-3.5 w-3.5 text-[var(--megsy-blue)]" />
                      </span>
                    )}
                  </div>
                );
                if (showSlidesInfoBox) {
                  return (
                    <div className="space-y-2" dir={langDir(al)}>
                      {innerWithStar}
                    </div>
                  );
                }
                // Deep Research live/in-progress text (when the final card isn't ready yet)
                // → wrap inside a collapsible "Research draft" box so it doesn't spill into chat.
                const showResearchDraftBox = false;
                if (showResearchDraftBox) {
                  const isAr = al === "ar";
                  return (
                    <div
                      className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur-xl overflow-hidden"
                      dir={langDir(al)}
                    >
                      <button
                        type="button"
                        onClick={() => setResearchDraftOpen((v) => !v)}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium text-foreground/90 hover:bg-foreground/5 transition"
                      >
                        <span className="flex-1 text-start">
                          {"Research draft"}
                        </span>
                        <ChevronDown
                          className={`w-4 h-4 text-muted-foreground transition-transform ${researchDraftOpen ? "" : "-rotate-90"}`}
                        />
                      </button>
                      <AnimatePresence initial={false}>
                        {researchDraftOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="border-t border-border/40 px-4 py-3 max-h-[50vh] overflow-y-auto">
                              {inner}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                }
                return innerWithStar;
              })()
            )}

            {/* Sources + Thinking buttons */}
            {!isStreaming && sourceLinks.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border/40 flex flex-wrap items-center gap-2">
                {sourceLinks.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/60 border border-border/40 text-xs font-medium text-foreground hover:border-primary/40 transition-colors">
                      <span>Sources</span>
                      <span className="text-muted-foreground">({sourceLinks.length})</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-80 p-2 max-h-80 overflow-y-auto">
                    <div className="flex flex-col gap-1">
                      {sourceLinks.map((link, i) => (
                        <a
                          key={i}
                          href={link.url}
                          onClick={(e) => handleLinkClick(e, link.url)}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/60 transition-colors"
                        >
                          <div className="w-6 h-6 shrink-0 rounded-full bg-secondary/60 border border-border/40 flex items-center justify-center">
                            {getFavicon(link.url) && (
                              <img loading="lazy" decoding="async"
                                src={getFavicon(link.url)!}
                                alt=""
                                className="w-3.5 h-3.5 rounded-sm"
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-foreground truncate">
                              {getDomain(link.url)}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {link.url}
                            </div>
                          </div>
                        </a>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                )}
              </div>
            )}


            {/* Optional artifact slot (e.g. docs/slides card) — rendered before action buttons */}
            {bottomSlot && !isStreaming && <div className="mt-3">{bottomSlot}</div>}

            {/* Action buttons: like + copy + dislike only */}
            {!isStreaming && !hasRunningTool && content && !showSlidesInfoBox && !hideActions && (
              <div className="flex items-center gap-1 mt-2">
                <motion.button
                  onClick={() => handleLikeAction(liked === true ? null : true)}
                  className={`group p-1.5 rounded-xl transition-colors ${
                    liked === true
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                  }`}
                  title="Like"
                  whileTap={{ scale: 0.88 }}
                  transition={{ type: "spring", stiffness: 500, damping: 15 }}
                >
                  <motion.span
                    whileTap={{ rotate: -18, scale: 1.25 }}
                    transition={{ type: "spring", stiffness: 500, damping: 12 }}
                    className="block"
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                  </motion.span>
                </motion.button>

                <motion.button
                  onClick={handleCopy}
                  className="group p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
                  title={copied ? "Copied" : "Copy"}
                  whileTap={{ scale: 0.88 }}
                  transition={{ type: "spring", stiffness: 500, damping: 15 }}
                >
                  <motion.span
                    whileTap={{ y: -2 }}
                    transition={{ type: "spring", stiffness: 500, damping: 12 }}
                    className="block"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </motion.span>
                </motion.button>

                <motion.button
                  onClick={() => handleLikeAction(liked === false ? null : false)}
                  className={`group p-1.5 rounded-xl transition-colors ${
                    liked === false
                      ? "text-destructive bg-destructive/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                  }`}
                  title="Dislike"
                  whileTap={{ scale: 0.88 }}
                  transition={{ type: "spring", stiffness: 500, damping: 15 }}
                >
                  <motion.span
                    whileTap={{ rotate: 18, scale: 1.25 }}
                    transition={{ type: "spring", stiffness: 500, damping: 12 }}
                    className="block"
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                  </motion.span>
                </motion.button>
              </div>
            )}
            {!isStreaming && !hasRunningTool && content && (
              <ReactionsRow
                reactions={reactions || []}
                currentUserId={currentUserId}
                onToggle={onToggleReaction}
                messageId={messageId}
                align="left"
              />
            )}
          </>
        )}

        <Suspense fallback={null}>
          {previewCode && (
            <CodePreviewModal
              code={previewCode.code}
              lang={previewCode.lang}
              files={extractProjectFiles(content)}
              onClose={() => setPreviewCode(null)}
            />
          )}

          {previewImageUrl && (
            <ImagePreviewModal url={previewImageUrl} onClose={() => setPreviewImageUrl(null)} />
          )}

          {studioOpen && (
            <CoderStudioModal
              open={studioOpen}
              onClose={() => setStudioOpen(false)}
              initialFiles={projectFiles}
              filesOnly
            />
          )}

          {canvasOpen && (
            <ArtifactCanvas
              open={canvasOpen}
              onOpenChange={setCanvasOpen}
              content={content}
              files={projectFiles}
              images={canvasImages}
              sources={uniqueLinks}
            />
          )}
        </Suspense>
      </MessageContent>
    </Message>
  );
};

export default memo(ChatMessage);
