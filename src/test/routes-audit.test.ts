import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const APP = fs.readFileSync(path.resolve(__dirname, "../App.tsx"), "utf8");
const APP_ROUTES = fs.readFileSync(path.resolve(__dirname, "../routes/AppRoutes.tsx"), "utf8");
const LAZY_PAGES = fs.readFileSync(path.resolve(__dirname, "../routes/lazyPages.ts"), "utf8");

// Parse `const Name = lazy(() => import("./path"))` and plain `import Name from "./path"`
function parseImports(src: string) {
  const map = new Map<string, string>();
  const lazyRe = /const\s+(\w+)\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*["']([^"']+)["']\s*\)/g;
  const namedRe = /const\s*\{\s*([^}]+)\s*\}\s*=\s*await?\s*import\(\s*["']([^"']+)["']\s*\)/g;
  const staticRe = /import\s+(\w+)\s+from\s+["']([^"']+)["']/g;
  const staticBraceRe = /import\s+\{\s*([^}]+)\s*\}\s*from\s+["']([^"']+)["']/g;
  const exportedLazyRe = /export\s+const\s+(\w+)\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*["']([^"']+)["']/g;

  for (const m of src.matchAll(lazyRe)) map.set(m[1], m[2]);
  for (const m of src.matchAll(exportedLazyRe)) map.set(m[1], m[2]);
  for (const m of src.matchAll(staticRe)) map.set(m[1], m[2]);
  for (const m of src.matchAll(staticBraceRe)) {
    const names = m[1].split(",").map((s) =>
      s
        .trim()
        .split(/\s+as\s+/)
        .pop()!
        .trim(),
    );
    for (const n of names) map.set(n, m[2]);
  }
  for (const m of src.matchAll(namedRe)) {
    const names = m[1].split(",").map((s) =>
      s
        .trim()
        .split(/\s*:\s*/)
        .pop()!
        .trim(),
    );
    for (const n of names) map.set(n, m[2]);
  }
  return map;
}

function resolveImport(spec: string): string | null {
  if (spec.startsWith("@/")) spec = path.resolve(__dirname, "..", spec.slice(2));
  else if (spec.startsWith("./") || spec.startsWith("../"))
    spec = path.resolve(__dirname, "..", spec);
  else return "external"; // node_module — assume ok

  const exts = [".tsx", ".ts", ".jsx", ".js"];
  for (const e of exts) if (fs.existsSync(spec + e)) return spec + e;
  for (const e of exts)
    if (fs.existsSync(path.join(spec, "index" + e))) return path.join(spec, "index" + e);
  if (fs.existsSync(spec)) return spec;
  return null;
}

const imports = parseImports(`${APP}\n${APP_ROUTES}\n${LAZY_PAGES}`);

// Extract every <Route path="..." element={...}/>
const routeRe = /<Route\s+([^>]*?)\/?>/g;
const routes: Array<{ raw: string; pathAttr?: string; elementExpr?: string }> = [];
for (const m of APP_ROUTES.matchAll(routeRe)) {
  const attrs = m[1];
  const pathMatch = attrs.match(/path=["']([^"']+)["']/);
  const elMatch =
    attrs.match(/element=\{([\s\S]+?)\}\s*$/) || attrs.match(/element=\{([\s\S]+?)\}/);
  routes.push({ raw: m[0], pathAttr: pathMatch?.[1], elementExpr: elMatch?.[1] });
}

describe("App router audit", () => {
  it("has many routes", () => {
    expect(routes.length).toBeGreaterThan(100);
  });

  it("includes a wildcard 404 catch-all", () => {
    expect(routes.some((r) => r.pathAttr === "*")).toBe(true);
  });

  it("has BrowserRouter (not HashRouter)", () => {
    expect(APP).toMatch(/BrowserRouter/);
    expect(APP).not.toMatch(/HashRouter/);
  });

  it("every Route element references a defined component", () => {
    const missing: string[] = [];
    for (const r of routes) {
      if (!r.elementExpr) continue;
      // Find PascalCase identifiers in the element expression
      const ids = Array.from(new Set(r.elementExpr.match(/\b[A-Z][A-Za-z0-9]+\b/g) || []));
      const ignored = new Set([
        "Navigate",
        "ProtectedRoute",
        "Outlet",
        "Suspense",
        "Fragment",
        "Route",
        "Routes",
        "BrowserRouter",
      ]);

      for (const id of ids) {
        if (ignored.has(id)) continue;
        if (!imports.has(id)) missing.push(`${r.pathAttr ?? "(index)"} -> <${id}>`);
      }
    }
    expect(missing, "Undefined component refs:\n" + missing.join("\n")).toEqual([]);
  });

  it("every lazy/static page import resolves to a real file", () => {
    const missing: string[] = [];
    for (const [name, spec] of imports) {
      if (!spec.startsWith("@/")) continue;
      const resolved = resolveImport(spec);
      if (resolved === null) missing.push(`${name}: ${spec}`);
    }
    expect(missing, "Unresolved imports:\n" + missing.join("\n")).toEqual([]);
  });

  it("every page module has a default export", () => {
    const failures: string[] = [];
    for (const [name, spec] of imports) {
      if (!spec.startsWith("@/")) continue;
      const resolved = resolveImport(spec);
      if (!resolved || resolved === "external") continue;
      if (!/\/pages\//.test(resolved)) continue;
      const content = fs.readFileSync(resolved, "utf8");
      if (!/export\s+default/.test(content) && !/export\s*\{[^}]*\bdefault\b/.test(content)) {
        failures.push(`${name} (${spec}) missing default export`);
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("has no duplicate route paths", () => {
    const seen = new Map<string, number>();
    for (const r of routes) {
      if (!r.pathAttr) continue;
      seen.set(r.pathAttr, (seen.get(r.pathAttr) ?? 0) + 1);
    }
    const dups = Array.from(seen.entries()).filter(([, n]) => n > 1);
    expect(dups, "Duplicate paths:\n" + dups.map(([p, n]) => `${p} x${n}`).join("\n")).toEqual([]);
  });
});
