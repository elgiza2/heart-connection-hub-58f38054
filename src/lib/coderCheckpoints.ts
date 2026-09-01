/** @doc Lightweight localStorage-backed checkpoint history for Coder projects — enables one-click undo of file changes. */
import type { ProjectFile } from "@/lib/extractProjectFiles";

const KEY = "megsy:coder:checkpoints:v1";
const MAX_PER_PROJECT = 10;
const MAX_PROJECTS = 20;

export interface Checkpoint {
  ts: number;
  label: string;
  files: ProjectFile[];
}

type Store = Record<string, Checkpoint[]>;

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function write(store: Store) {
  try {
    // Trim oldest projects if too many
    const keys = Object.keys(store);
    if (keys.length > MAX_PROJECTS) {
      const sorted = keys
        .map((k) => ({ k, ts: store[k][store[k].length - 1]?.ts ?? 0 }))
        .sort((a, b) => b.ts - a.ts);
      const trimmed: Store = {};
      for (const { k } of sorted.slice(0, MAX_PROJECTS)) trimmed[k] = store[k];
      store = trimmed;
    }
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Quota exceeded — best-effort: drop all and retry once
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  }
}

function fingerprint(files: ProjectFile[]): string {
  return `${files.length}:${files.reduce((n, f) => n + f.content.length, 0)}`;
}

export function saveCheckpoint(projectId: string, files: ProjectFile[], label = "edit"): void {
  if (!projectId || !files.length) return;
  const store = read();
  const list = store[projectId] || [];
  // Skip if identical to latest
  if (list.length && fingerprint(list[list.length - 1].files) === fingerprint(files)) return;
  list.push({ ts: Date.now(), label, files });
  while (list.length > MAX_PER_PROJECT) list.shift();
  store[projectId] = list;
  write(store);
}

export function listCheckpoints(projectId: string): Checkpoint[] {
  return read()[projectId] || [];
}

/** Pop and return the previous checkpoint (undo). Returns null if none. */
export function undoCheckpoint(projectId: string): Checkpoint | null {
  const store = read();
  const list = store[projectId];
  if (!list || list.length < 2) return null;
  list.pop(); // current
  const prev = list[list.length - 1];
  store[projectId] = list;
  write(store);
  return prev;
}

export function clearCheckpoints(projectId: string): void {
  const store = read();
  delete store[projectId];
  write(store);
}
