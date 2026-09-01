import { describe, it, expect } from "vitest";
import { stripUnresolvedTokens } from "@/lib/coderAssets";

describe("stripUnresolvedTokens", () => {
  it("removes the whole <video> element when its source never resolved", () => {
    const out = stripUnresolvedTokens([
      {
        path: "index.html",
        content:
          '<main><video src="{{MEGSY_VIDEO:a hero clip}}" controls></video><p>after</p></main>',
        lang: "html",
      },
    ]);
    expect(out[0].content).not.toContain("<video");
    expect(out[0].content).not.toContain("MEGSY_VIDEO");
    expect(out[0].content).toContain("<p>after</p>");
  });

  it("falls back to a placeholder image rather than an empty src", () => {
    const out = stripUnresolvedTokens([
      { path: "index.html", content: '<img src="{{MEGSY_IMAGE:a cat}}">', lang: "html" },
    ]);
    expect(out[0].content).toContain("placehold.co");
    expect(out[0].content).not.toContain("MEGSY_IMAGE");
  });

  it("leaves untouched files as the same object", () => {
    const file = { path: "a.ts", content: "export const a = 1;", lang: "ts" };
    expect(stripUnresolvedTokens([file])[0]).toBe(file);
  });
});
