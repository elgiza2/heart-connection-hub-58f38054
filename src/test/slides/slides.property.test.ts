/**
 * Property-based tests for slides — 5000 iterations per property.
 * Uses fast-check (open source) to fuzz-test layout registry + parser.
 */
import { describe, it } from "vitest";
import fc from "fast-check";
import {
  LAYOUTS,
  BASE_LAYOUT_IDS,
  resolveBaseLayout,
  getLayoutMeta,
  suggestLayout,
} from "@/lib/slides/layouts";
import { parseVariant, ACCENT_HEX, ORNAMENT_CLASS } from "@/components/chat/SlidesDeckCard";

const RUNS = 5000;

describe("Slides registry — property-based invariants", () => {
  it("every registered layout resolves to a known base", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: LAYOUTS.length - 1 }), (i) => {
        const meta = LAYOUTS[i];
        return BASE_LAYOUT_IDS.includes(meta.base);
      }),
      { numRuns: RUNS },
    );
  });

  it("parseVariant never throws on arbitrary string input", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        parseVariant(s);
        return true;
      }),
      { numRuns: RUNS },
    );
  });

  it("parseVariant never throws on unicode / RTL strings", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (s: string) => {
        parseVariant(s);
        return true;
      }),
      { numRuns: RUNS },
    );
  });

  it("resolveBaseLayout always returns a known base for any string", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const base = resolveBaseLayout(s);
        return BASE_LAYOUT_IDS.includes(base) || base === "centered";
      }),
      { numRuns: RUNS },
    );
  });

  it("getLayoutMeta returns either undefined or a meta with a valid base", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const m = getLayoutMeta(s);
        if (m === undefined) return true;
        return BASE_LAYOUT_IDS.includes(m.base);
      }),
      { numRuns: RUNS },
    );
  });

  it("parseVariant density (when present) is always in {airy, balanced, dense}", () => {
    fc.assert(
      fc.property(fc.constantFrom(...LAYOUTS.filter((l) => l.density).map((l) => l.id)), (id) => {
        const r = parseVariant(id);
        return r.density === undefined || ["airy", "balanced", "dense"].includes(r.density);
      }),
      { numRuns: RUNS },
    );
  });

  it("parseVariant accent (when present) maps to a known hex color", () => {
    fc.assert(
      fc.property(fc.constantFrom(...LAYOUTS.filter((l) => l.accent).map((l) => l.id)), (id) => {
        const r = parseVariant(id);
        if (!r.accent) return true;
        return r.accent in ACCENT_HEX;
      }),
      { numRuns: RUNS },
    );
  });

  it("parseVariant ornament (when present) maps to a known CSS class", () => {
    fc.assert(
      fc.property(fc.constantFrom(...LAYOUTS.filter((l) => l.ornament).map((l) => l.id)), (id) => {
        const r = parseVariant(id);
        if (!r.ornament) return true;
        return r.ornament === "plain" || r.ornament in ORNAMENT_CLASS;
      }),
      { numRuns: RUNS },
    );
  });

  it("suggestLayout always returns a renderable base", () => {
    fc.assert(
      fc.property(
        fc.record({
          contentType: fc.constantFrom(
            "title",
            "section",
            "text",
            "text+image",
            "bullets",
            "stats",
            "comparison",
            "timeline",
            "process",
            "quote",
            "gallery",
            "definition",
          ),
          bulletsCount: fc.integer({ min: 0, max: 20 }),
          bodyWords: fc.integer({ min: 0, max: 500 }),
          hasImage: fc.boolean(),
          statsCount: fc.integer({ min: 0, max: 10 }),
        }),
        (shape) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const id = suggestLayout(shape as any);
          return BASE_LAYOUT_IDS.includes(id);
        },
      ),
      { numRuns: RUNS },
    );
  });
});
