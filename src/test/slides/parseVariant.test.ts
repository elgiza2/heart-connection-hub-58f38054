import { describe, it, expect } from "vitest";
import { parseVariant, ACCENT_HEX, ORNAMENT_CLASS } from "@/components/chat/SlidesDeckCard";

describe("parseVariant", () => {
  it("returns empty modifiers for plain base layout", () => {
    const r = parseVariant("split-right");
    expect(r.base).toBe("split-right");
    expect(r.accent).toBeUndefined();
    expect(r.density).toBeUndefined();
    expect(r.ornament).toBeUndefined();
  });

  it("parses full variant suffix", () => {
    const r = parseVariant("comparison--ruby-center-dense-ribbon");
    expect(r.base).toBe("comparison");
    expect(r.accent).toBe("ruby");
    expect(r.align).toBe("center");
    expect(r.density).toBe("dense");
    expect(r.ornament).toBe("ribbon");
  });

  it("handles hyphenated ornament (corner-mark)", () => {
    const r = parseVariant("centered--indigo-left-airy-corner-mark");
    expect(r.ornament).toBe("corner-mark");
  });

  it("lowercases input", () => {
    const r = parseVariant("SPLIT-RIGHT--INDIGO-CENTER-AIRY-RIBBON");
    expect(r.base).toBe("split-right");
    expect(r.accent).toBe("indigo");
  });

  it("handles undefined / empty", () => {
    expect(parseVariant(undefined).base).toBe("");
    expect(parseVariant("").base).toBe("");
  });

  it("ACCENT_HEX contains 16 colors", () => {
    expect(Object.keys(ACCENT_HEX)).toHaveLength(16);
    for (const v of Object.values(ACCENT_HEX)) {
      expect(v).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("ORNAMENT_CLASS values are valid CSS class strings", () => {
    for (const v of Object.values(ORNAMENT_CLASS)) {
      expect(v).toMatch(/^slide-ornament-/);
    }
  });
});
