import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildSpecPrompt, deployCoderProjectToAnything } from "@/lib/anything/coderBridge";

const api = vi.hoisted(() => ({
  me: vi.fn(),
  status: vi.fn(),
  create: vi.fn(),
  publish: vi.fn(),
  generate: vi.fn(),
}));

vi.mock("@/lib/anything/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/anything/client")>("@/lib/anything/client");
  return {
    ...actual,
    anything: {
      me: api.me,
      projects: { create: api.create, status: api.status, publish: api.publish, generate: api.generate },
    },
  };
});


describe("anything coder bridge", () => {
  it("inlines files and keeps design intent", () => {
    const p = buildSpecPrompt(
      [
        { path: "index.html", content: "<h1>Games</h1>" },
        { path: "node_modules/x/i.js", content: "junk" },
      ],
      "A neon games portal",
    );
    expect(p).toContain("--- index.html ---");
    expect(p).toContain("neon games portal");
    expect(p).not.toContain("node_modules");
  });

  it("stays within the prompt budget and reports omissions", () => {
    const big = { path: "big.js", content: "x".repeat(80_000) };
    const p = buildSpecPrompt([{ path: "a.html", content: "<p>a</p>" }, big]);
    expect(p.length).toBeLessThan(70_000);
    expect(p).toContain("Omitted for length");
    expect(p).toContain("big.js");
  });
});

describe("anything deploy flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it("publishes after the revision is VALID and returns the live deployment URL", async () => {
    api.me.mockResolvedValue({ organizations: [{ id: "org1", name: "o" }] });
    api.create.mockResolvedValue({ projectGroupId: "p1" });
    api.status
      .mockResolvedValueOnce({ status: "BUILDING", buildErrors: null, deployment: null })
      .mockResolvedValueOnce({ status: "VALID", buildErrors: null, deployment: null })
      .mockResolvedValueOnce({ status: "VALID", buildErrors: null, deployment: { status: "DEPLOYING", url: null } })
      .mockResolvedValue({ status: "VALID", buildErrors: null, deployment: { status: "SUCCESS", url: "https://p1.created.app" } });
    api.publish.mockResolvedValue({ success: true, slug: null });

    const p = deployCoderProjectToAnything([{ path: "index.html", content: "<h1>hi</h1>" }]);
    await vi.advanceTimersByTimeAsync(60_000);
    const res = await p;

    expect(api.publish).toHaveBeenCalledWith("p1");
    expect(res.url).toBe("https://p1.created.app");
    expect(res.published).toBe(true);
    expect(res.buildErrors).toBeNull();
  });

  it("does not publish when the build reported errors", async () => {
    api.me.mockResolvedValue({ organizations: [{ id: "org1", name: "o" }] });
    api.create.mockResolvedValue({ projectGroupId: "p2" });
    api.status.mockResolvedValue({ status: "ERROR", buildErrors: "boom", deployment: null });

    const p = deployCoderProjectToAnything([{ path: "index.html", content: "x" }]);
    await vi.advanceTimersByTimeAsync(30_000);
    const res = await p;

    expect(api.publish).not.toHaveBeenCalled();
    expect(res.buildErrors).toBe("boom");
    expect(res.url).toBeNull();
  });
});
