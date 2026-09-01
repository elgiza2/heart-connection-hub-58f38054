import { describe, it, expect } from "vitest";
import { findAssetRequests, applyAssetsToFiles, stripUnresolvedTokens, estimateAssetCredits } from "@/lib/coderAssets";

describe("coder assets", () => {
  const files = [
    { path: "index.html", lang: "html", content: `<img src="{{MEGSY_IMAGE:space shooter cover}}"><img src="./images/hero-banner.png"><video src="{{MEGSY_VIDEO:gameplay clip}}">` },
    { path: "style.css", lang: "css", content: `body{background-image:url('{{MEGSY_IMAGE:space shooter cover}}')}` },
  ];
  it("finds and dedupes requests", () => {
    const reqs = findAssetRequests(files, "games");
    expect(reqs.length).toBe(3);
    const img = reqs.find((r) => r.prompt.includes("space shooter"))!;
    expect(img.tokens.length).toBe(1);
    expect(reqs.some((r) => r.prompt.includes("hero banner"))).toBe(true);
    expect(estimateAssetCredits(reqs)).toBe(2 + 2 + 12);
  });
  it("applies urls everywhere", () => {
    const reqs = findAssetRequests(files, "games");
    const done = reqs.map((r) => ({ ...r, status: "done" as const, credits: 2, url: `https://cdn/${r.id}.png` }));
    const out = stripUnresolvedTokens(applyAssetsToFiles(files, done));
    expect(out.join("")).not.toMatch(/MEGSY_/);
    expect(out[1].content).toContain("https://cdn/");
    expect(out[0].content).not.toContain("./images/hero-banner.png");
  });
});
