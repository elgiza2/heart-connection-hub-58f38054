import { describe, it, expect, beforeAll } from "vitest";
import { render } from "@testing-library/react";
import SlidesDeckCard, { type SlideDeck, type SlideData } from "@/components/chat/SlidesDeckCard";

beforeAll(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const palette = { primary: "#111", accent: "#6366f1", bg: "#fff", fg: "#111" };

function deckOf(slide: SlideData, language?: string): SlideDeck {
  return {
    title: "T",
    templateId: "default",
    palette,
    language,
    slides: [{ type: "cover", title: "Cover" }, slide],
  };
}

const cases: { name: string; slide: SlideData }[] = [
  { name: "cover", slide: { type: "cover", title: "Hello", subtitle: "Sub" } },
  {
    name: "split-right",
    slide: {
      layout: "split-right--indigo-left-balanced-ribbon",
      title: "X",
      body: "Body text",
      image: "https://x/i.jpg",
    },
  },
  {
    name: "big-number",
    slide: {
      layout: "big-number--rose-center-airy-grid",
      type: "stats",
      title: "Stats",
      big_value: "92%",
      big_label: "growth",
    },
  },
  {
    name: "comparison",
    slide: {
      layout: "comparison--ruby-center-dense-ribbon",
      left_title: "A",
      left_bullets: ["a1"],
      right_title: "B",
      right_bullets: ["b1"],
    },
  },
  {
    name: "timeline",
    slide: {
      layout: "timeline--gold-left-balanced-dots",
      title: "TL",
      events: [{ date: "2024", title: "x" }],
    },
  },
  {
    name: "process",
    slide: {
      layout: "process--mint-left-balanced-plain",
      title: "Steps",
      steps: [{ title: "Step 1" }],
    },
  },
  {
    name: "gallery",
    slide: { layout: "masonry-cards--cyan-center-airy-frame", title: "G", images: ["a", "b", "c"] },
  },
  {
    name: "quote",
    slide: {
      layout: "pull-quote--violet-center-airy-plain",
      type: "quote",
      quote: "Hello",
      attribution: "Me",
    },
  },
  {
    name: "bullets-three-col",
    slide: { layout: "three-col--teal-left-balanced-grid", title: "3", bullets: ["1", "2", "3"] },
  },
  { name: "closing-cta", slide: { type: "closing", title: "End", cta: "Go" } },
];

describe("SlideRender — every layout type renders without throwing (LTR)", () => {
  for (const { name, slide } of cases) {
    it(`renders ${name}`, () => {
      const { container } = render(<SlidesDeckCard deck={deckOf(slide)} />);
      expect(container).toBeTruthy();
    });
  }
});

describe("SlideRender — every layout type renders without throwing (RTL)", () => {
  for (const { name, slide } of cases) {
    it(`renders ${name} in arabic`, () => {
      const { container } = render(
        <SlidesDeckCard deck={deckOf({ ...slide, title: slide.title || "عنوان" }, "ar")} />,
      );
      expect(container).toBeTruthy();
    });
  }
});

describe("SlideRender — defensive against malformed data", () => {
  it("handles slide with only a title", () => {
    const { container } = render(<SlidesDeckCard deck={deckOf({ title: "Only" })} />);
    expect(container).toBeTruthy();
  });
  it("handles empty bullets array", () => {
    const { container } = render(<SlidesDeckCard deck={deckOf({ title: "X", bullets: [] })} />);
    expect(container).toBeTruthy();
  });
  it("handles unknown layout id", () => {
    const { container } = render(
      <SlidesDeckCard deck={deckOf({ layout: "nonsense-xyz", title: "X" })} />,
    );
    expect(container).toBeTruthy();
  });
  it("handles missing palette fields gracefully", () => {
    const deck = deckOf({ title: "X" });
    const { container } = render(<SlidesDeckCard deck={deck} />);
    expect(container).toBeTruthy();
  });
});
