/**
 * Hardened rehype-sanitize schema for chat markdown.
 *
 * Extends the default GitHub-style schema to keep the visual features Megsy
 * relies on (KaTeX math, syntax highlighting classes, task-list checkboxes,
 * inline `dir="auto"`/`dir="rtl"`/`dir="ltr"` for BiDi text) while still
 * stripping <script>, event handlers, and any javascript: URIs from
 * AI-produced or user-shared markdown.
 */
import { defaultSchema } from "rehype-sanitize";

// The upstream types are strict about tuple shapes; use a permissive local
// alias to keep the schema declarative without noisy casts on every line.
type Attrs = Record<string, any[]>;

const baseAttrs = (defaultSchema.attributes ?? {}) as Attrs;

const attributes: Attrs = {
  ...baseAttrs,
  "*": [
    ...(baseAttrs["*"] ?? []),
    "className",
    ["dir", "auto", "ltr", "rtl"],
    "ariaHidden",
    "ariaLabel",
    "role",
  ],
  math: ["xmlns", "display"],
  annotation: ["encoding"],
  semantics: [],
  mrow: [],
  mi: [],
  mo: [],
  mn: [],
  ms: [],
  mtext: [],
  msqrt: [],
  mroot: [],
  msub: [],
  msup: [],
  msubsup: [],
  mfrac: [],
  mspace: ["width", "height", "depth"],
  mtable: [],
  mtr: [],
  mtd: [],
  munder: [],
  mover: [],
  munderover: [],
  span: [...(baseAttrs.span ?? []), "className", "dir"],
  code: [...(baseAttrs.code ?? []), "className", "dir"],
  pre: [...(baseAttrs.pre ?? []), "className", "dir"],
  input: [["type", "checkbox"], ["disabled", true], "checked"],
};

const tagNames = Array.from(
  new Set([
    ...(defaultSchema.tagNames ?? []),
    "math",
    "semantics",
    "annotation",
    "mrow",
    "mi",
    "mo",
    "mn",
    "ms",
    "mtext",
    "msqrt",
    "mroot",
    "msub",
    "msup",
    "msubsup",
    "mfrac",
    "mspace",
    "mtable",
    "mtr",
    "mtd",
    "munder",
    "mover",
    "munderover",
  ]),
);

export const chatMarkdownSchema = {
  ...defaultSchema,
  tagNames,
  attributes: attributes as any,
  protocols: {
    ...(defaultSchema.protocols ?? {}),
    href: ["http", "https", "mailto", "tel"],
    src: ["http", "https"],
    cite: ["http", "https"],
  },
  strip: ["script", "style", "iframe", "object", "embed", "form", "meta", "link"],
  clobber: [],
  clobberPrefix: "user-content-",
} as any;
