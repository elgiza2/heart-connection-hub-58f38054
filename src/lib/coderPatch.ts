/** @doc Apply search/replace patch blocks so Coder can edit large files without rewriting them entirely. */
import type { ProjectFile } from "@/lib/extractProjectFiles";

export interface PatchBlock {
  path: string;
  search: string;
  replace: string;
}

/**
 * Parses fenced blocks of the form:
 *
 * ```patch src/App.tsx
 * <<<<<<< SEARCH
 * old text
 * =======
 * new text
 * >>>>>>> REPLACE
 * ```
 *
 * Multiple SEARCH/REPLACE pairs inside one block are supported.
 */
export function extractPatchBlocks(content: string): PatchBlock[] {
  if (!content) return [];
  const fence = /```(?:patch|diff)[ \t]+([\w./-]+)[ \t]*\n([\s\S]*?)```/g;
  const out: PatchBlock[] = [];
  let m: RegExpExecArray | null;
  while ((m = fence.exec(content)) !== null) {
    const path = m[1].trim();
    const body = m[2];
    const pair = /<{5,}\s*SEARCH\s*\n([\s\S]*?)\n={5,}\s*\n([\s\S]*?)\n>{5,}\s*REPLACE/g;
    let p: RegExpExecArray | null;
    while ((p = pair.exec(body)) !== null) {
      out.push({ path, search: p[1], replace: p[2] });
    }
  }
  return out;
}

/**
 * Whitespace-tolerant fallback match: models often re-indent or normalise
 * trailing spaces, which would otherwise fail an exact `indexOf`.
 */
function findFuzzy(content: string, search: string): { index: number; length: number } | null {
  const needle = search.split("\n").map((l) => l.trim());
  if (needle.length === 0) return null;
  const lines = content.split("\n");
  const offsets: number[] = [];
  let pos = 0;
  for (const l of lines) { offsets.push(pos); pos += l.length + 1; }
  for (let i = 0; i + needle.length <= lines.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (lines[i + j].trim() !== needle[j]) { ok = false; break; }
    }
    if (!ok) continue;
    const start = offsets[i];
    const endLine = i + needle.length - 1;
    const end = offsets[endLine] + lines[endLine].length;
    return { index: start, length: end - start };
  }
  return null;
}

export interface ApplyResult {
  files: ProjectFile[];
  applied: number;
  failed: PatchBlock[];
}

export function applyPatchBlocks(files: ProjectFile[], patches: PatchBlock[]): ApplyResult {
  if (patches.length === 0) return { files, applied: 0, failed: [] };
  const map = new Map(files.map((f) => [f.path, { ...f }]));
  const failed: PatchBlock[] = [];
  let applied = 0;
  for (const patch of patches) {
    const file = map.get(patch.path);
    if (!file) { failed.push(patch); continue; }
    let idx = file.content.indexOf(patch.search);
    let matchLen = patch.search.length;
    if (idx === -1) {
      const fuzzy = findFuzzy(file.content, patch.search);
      if (!fuzzy) { failed.push(patch); continue; }
      idx = fuzzy.index;
      matchLen = fuzzy.length;
    }
    // Use manual splice to avoid String.replace's $-backreference interpretation
    // (which would mangle any replacement containing $1, $&, $$, etc.).
    file.content = file.content.slice(0, idx) + patch.replace + file.content.slice(idx + matchLen);
    applied += 1;
  }
  return { files: Array.from(map.values()), applied, failed };
}
