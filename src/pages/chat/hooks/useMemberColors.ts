import { useCallback } from "react";

// Stable color palette for member bubbles. Hashes the userId so each member
// keeps the same color across sessions/devices without needing storage.
const MEMBER_COLORS = [
  { bg: "#2563eb", text: "#ffffff" }, // blue
  { bg: "#10b981", text: "#ffffff" }, // emerald
  { bg: "#f59e0b", text: "#1a1a1a" }, // amber
  { bg: "#ef4444", text: "#ffffff" }, // red
  { bg: "#8b5cf6", text: "#ffffff" }, // violet
  { bg: "#ec4899", text: "#ffffff" }, // pink
  { bg: "#06b6d4", text: "#ffffff" }, // cyan
  { bg: "#84cc16", text: "#1a1a1a" }, // lime
] as const;

export type MemberColor = (typeof MEMBER_COLORS)[number];

/**
 * Returns a stable `colorForUser(userId)` resolver. Same userId always maps
 * to the same color from a deterministic palette. Returns null for empty ids.
 */
export function useMemberColors() {
  return useCallback((userId?: string | null): MemberColor | null => {
    if (!userId) return null;
    let h = 0;
    for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
    return MEMBER_COLORS[h % MEMBER_COLORS.length];
  }, []);
}
