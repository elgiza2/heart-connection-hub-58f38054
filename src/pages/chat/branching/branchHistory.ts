// Snapshot-based branching: whenever an assistant reply is regenerated (or the
// preceding user message is edited), the prior tail is stored on the pivot
// *user* message under `altBranches`. Users can then flip between versions
// using the small BranchSwitcher without losing the alternative reply.
//
// Data model (fields live on the pivot user Message):
//   altBranches: Message[][]   — tail versions NOT currently rendered.
//   branchPosition: number     — 1-indexed slot the currently-rendered tail
//                                occupies in the conceptual full array.
//
// The visible `messages` state always holds the "live" tail. altBranches
// stores only the frozen alternatives.
//
// An optional `persist` callback fires whenever the pivot mutates so callers
// can write altBranches/branchPosition into the pivot's DB row (metadata
// JSONB). Persistence is best-effort — failure never blocks the UI.

import type { Message } from "../chatConstants";

export type SetMessagesFn = (updater: (prev: Message[]) => Message[]) => void;
export type PersistPivotFn = (pivot: Message) => void;

interface Options {
  persist?: PersistPivotFn;
}

function firePersist(persist: PersistPivotFn | undefined, pivot: Message) {
  if (!persist) return;
  try {
    persist(pivot);
  } catch {
    // best effort
  }
}

/**
 * Snapshot the current tail starting at `assistantIdx` onto the pivot user
 * message at `pivotIdx = assistantIdx - 1`, then truncate the visible messages
 * array up to and including the pivot. Called right before regenerating a
 * reply so the old reply (and any follow-ups) survive as a switchable branch.
 */
export function snapshotAndTruncateForRegenerate(
  setMessages: SetMessagesFn,
  assistantIdx: number,
  opts: Options = {},
) {
  const pivotIdx = assistantIdx - 1;
  if (pivotIdx < 0) return;
  setMessages((prev) => {
    if (assistantIdx >= prev.length) return prev;
    const pivot = prev[pivotIdx];
    if (!pivot || pivot.role !== "user") return prev.slice(0, assistantIdx);
    const currentTail = prev.slice(assistantIdx);
    const newPivot = insertTailAsNewLastBranch(pivot, currentTail);
    firePersist(opts.persist, newPivot);
    return [...prev.slice(0, pivotIdx), newPivot];
  });
}

/**
 * Snapshot the current tail starting at `editIdx` (the user message being
 * edited) onto the *previous* user pivot (editIdx - 1's owning turn). If no
 * suitable pivot exists (editIdx === 0 or preceding message isn't a user
 * message we can hang branches on), fall back to plain truncation so the
 * edit still works.
 */
export function snapshotAndTruncateForEdit(
  setMessages: SetMessagesFn,
  editIdx: number,
  opts: Options = {},
) {
  setMessages((prev) => {
    if (editIdx < 0 || editIdx >= prev.length) return prev;
    // Find the nearest preceding user message to use as branching pivot.
    let pivotIdx = -1;
    for (let i = editIdx - 1; i >= 0; i -= 1) {
      if (prev[i]?.role === "user") {
        pivotIdx = i;
        break;
      }
    }
    // Fallback: no preceding pivot — behave like a plain splice.
    if (pivotIdx < 0) {
      const base = [...prev];
      base.splice(editIdx, base[editIdx + 1]?.role === "assistant" ? 2 : 1);
      return base;
    }
    const tail = prev.slice(pivotIdx + 1); // everything after pivot, including edited user
    const pivot = prev[pivotIdx]!;
    const newPivot = insertTailAsNewLastBranch(pivot, tail);
    firePersist(opts.persist, newPivot);
    return [...prev.slice(0, pivotIdx), newPivot];
  });
}

function insertTailAsNewLastBranch(pivot: Message, tail: Message[]): Message {
  const existingAlts = pivot.altBranches || [];
  const existingPos = pivot.branchPosition;
  let mergedAlts: Message[][];
  if (existingPos && existingPos >= 1 && existingPos <= existingAlts.length + 1) {
    mergedAlts = [
      ...existingAlts.slice(0, existingPos - 1),
      tail,
      ...existingAlts.slice(existingPos - 1),
    ];
  } else {
    mergedAlts = [...existingAlts, tail];
  }
  return {
    ...pivot,
    altBranches: mergedAlts,
    branchPosition: mergedAlts.length + 1,
  };
}

/**
 * Swap the live tail (starting at `assistantIdx`) with the stored branch at
 * 1-indexed position `targetPosition`. No-ops if the target equals current.
 */
export function switchToBranch(
  setMessages: SetMessagesFn,
  assistantIdx: number,
  targetPosition: number,
  opts: Options = {},
) {
  const pivotIdx = assistantIdx - 1;
  if (pivotIdx < 0) return;
  setMessages((prev) => {
    if (assistantIdx > prev.length) return prev;
    const pivot = prev[pivotIdx];
    if (!pivot || pivot.role !== "user") return prev;
    const alts = pivot.altBranches || [];
    if (alts.length === 0) return prev;
    const total = alts.length + 1;
    const currentPos =
      pivot.branchPosition && pivot.branchPosition >= 1 && pivot.branchPosition <= total
        ? pivot.branchPosition
        : total;
    if (targetPosition < 1 || targetPosition > total || targetPosition === currentPos) return prev;
    const currentTail = prev.slice(assistantIdx);
    const full: Message[][] = [
      ...alts.slice(0, currentPos - 1),
      currentTail,
      ...alts.slice(currentPos - 1),
    ];
    const newLive = full[targetPosition - 1];
    const newAlts = full.filter((_, i) => i !== targetPosition - 1);
    const newPivot: Message = {
      ...pivot,
      altBranches: newAlts,
      branchPosition: targetPosition,
    };
    firePersist(opts.persist, newPivot);
    return [...prev.slice(0, pivotIdx), newPivot, ...newLive];
  });
}

/** Info the switcher UI needs to render itself. */
export interface BranchInfo {
  current: number;
  total: number;
  goPrev: () => void;
  goNext: () => void;
}

export function computeBranchInfo(
  messages: Message[],
  assistantIdx: number,
  setMessages: SetMessagesFn,
  opts: Options = {},
): BranchInfo | null {
  const pivotIdx = assistantIdx - 1;
  if (pivotIdx < 0) return null;
  const pivot = messages[pivotIdx];
  if (!pivot || pivot.role !== "user") return null;
  const alts = pivot.altBranches || [];
  if (alts.length === 0) return null;
  const total = alts.length + 1;
  const current =
    pivot.branchPosition && pivot.branchPosition >= 1 && pivot.branchPosition <= total
      ? pivot.branchPosition
      : total;
  return {
    current,
    total,
    goPrev: () => {
      if (current > 1) switchToBranch(setMessages, assistantIdx, current - 1, opts);
    },
    goNext: () => {
      if (current < total) switchToBranch(setMessages, assistantIdx, current + 1, opts);
    },
  };
}
