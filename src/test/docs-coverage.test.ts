// Guarantees every user-facing surface stays documented forever.
//
// This test fails the build if any file under `src/pages/**` or
// `supabase/functions/<name>/index.ts` is missing a `@doc` tag in its
// leading comment. The /docs page still renders undocumented files
// (with a humanized fallback), but a real one-line description is
// required for any new surface.
//
// Add this to the top of any new page/function to satisfy the rule:
//   /** @doc Short, human-friendly description of what this does. */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function hasDocTag(file: string): boolean {
  const src = readFileSync(file, "utf8").slice(0, 4000);
  return /@doc\s+\S/.test(src);
}

describe("docs coverage", () => {
  it("every user-facing page (src/pages/**/*Page.tsx) has a @doc tag", () => {
    const pagesDir = join(ROOT, "src", "pages");
    const files = walk(pagesDir).filter(
      (f) =>
        f.endsWith("Page.tsx") &&
        !f.endsWith(".test.tsx") &&
        !/[\\/](components|hooks|services|utils|data|constants|lazyComponents)[\\/]/.test(f),
    );
    const missing = files.filter((f) => !hasDocTag(f)).map((f) => relative(ROOT, f));
    expect(
      missing,
      `Missing @doc tag on user-facing page(s):\n  ${missing.join("\n  ")}\n\nAdd /** @doc Description here. */ at the top of each page file.`,
    ).toEqual([]);
  });

  it("every supabase/functions/*/index.ts has a @doc tag", () => {
    const fnDir = join(ROOT, "supabase", "functions");
    const files = readdirSync(fnDir)
      .filter((d) => !d.startsWith("_"))
      .map((d) => join(fnDir, d, "index.ts"))
      .filter((p) => {
        try {
          return statSync(p).isFile();
        } catch {
          return false;
        }
      });
    const missing = files.filter((f) => !hasDocTag(f)).map((f) => relative(ROOT, f));
    expect(missing, `Missing @doc tag on:\n  ${missing.join("\n  ")}`).toEqual([]);
  });
});
