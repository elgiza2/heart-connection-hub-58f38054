// Post-build cleanup: removes stray dotfiles/dev-only files that must never be
// deployed with the static bundle (e.g. .env copies, editor/OS metadata).
import { readdirSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";
const REMOVE = new Set([".DS_Store", "Thumbs.db", ".env", ".env.local", ".gitkeep"]);

function walk(dir) {
  let removed = 0;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (REMOVE.has(entry) || entry.startsWith(".env")) {
      rmSync(p, { recursive: true, force: true });
      removed++;
      continue;
    }
    if (statSync(p).isDirectory()) removed += walk(p);
  }
  return removed;
}

try {
  const removed = walk(DIST);
  console.log(`strip-template-dotfiles: removed ${removed} file(s) from ${DIST}/`);
} catch (err) {
  if (err?.code !== "ENOENT") throw err;
}
