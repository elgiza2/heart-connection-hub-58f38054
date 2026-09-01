/**
 * تخزين قرارات الموافقة/الReject على tool calls الحساسة.
 *
 * - المصدر الحقيقي: جدول `public.hitl_tool_approvals` في Supabase (RLS
 *   يقصر كل مستخدم على قراراته). القرار موحّد عبر الأجهزة.
 * - كاش محلي: `localStorage` لقراءة متزامنة (sync) داخل الـ UI بدون
 *   انتظار جولة شبكة.
 * - المفتاح المحلي: `megsy:hitl:{userId}:{toolName}` — القيمة:
 *   `"approved" | "denied"`.
 * - عند التبويت الأول للApp، استدع `hydrateHitlCache(userId)` مرة
 *   واحدة لملء الكاش من السيرفر.
 */

import { supabase } from "@/integrations/supabase/client";

const PREFIX = "megsy:hitl";
type Decision = "approved" | "denied";

function key(userId: string | null | undefined, toolName: string): string {
  const uid = userId || "anon";
  return `${PREFIX}:${uid}:${toolName.toLowerCase()}`;
}

/* ─── Local cache (sync) ─────────────────────────────────────── */

export function getHitlDecision(
  userId: string | null | undefined,
  toolName: string,
): Decision | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(key(userId, toolName));
    return v === "approved" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

function writeLocal(
  userId: string | null | undefined,
  toolName: string,
  decision: Decision | null,
): void {
  if (typeof window === "undefined") return;
  try {
    if (decision) window.localStorage.setItem(key(userId, toolName), decision);
    else window.localStorage.removeItem(key(userId, toolName));
  } catch {
    /* ignore */
  }
}

/* ─── Server-backed writes (async) ───────────────────────────── */

export function setHitlDecision(
  userId: string | null | undefined,
  toolName: string,
  decision: Decision,
): void {
  // Optimistic local write first — UI is instant.
  writeLocal(userId, toolName, decision);
  if (!userId) return; // anon: local only, no server sync.
  void (async () => {
    try {
      const { error } = await supabase
        .from("hitl_tool_approvals")
        .upsert(
          { user_id: userId, tool_name: toolName.toLowerCase(), decision },
          { onConflict: "user_id,tool_name" },
        );
      if (error) {
        console.warn("[hitl] server upsert failed", error.message);
      }
    } catch (e) {
      console.warn("[hitl] server upsert threw", e);
    }
  })();
}

export function clearHitlDecision(
  userId: string | null | undefined,
  toolName: string,
): void {
  writeLocal(userId, toolName, null);
  if (!userId) return;
  void (async () => {
    try {
      await supabase
        .from("hitl_tool_approvals")
        .delete()
        .eq("user_id", userId)
        .eq("tool_name", toolName.toLowerCase());
    } catch {
      /* ignore */
    }
  })();
}

/* ─── One-shot hydration from server → localStorage ─────────── */

let hydrated = new Set<string>();

export async function hydrateHitlCache(
  userId: string | null | undefined,
): Promise<void> {
  if (!userId || typeof window === "undefined") return;
  if (hydrated.has(userId)) return;
  hydrated.add(userId);
  try {
    const { data, error } = await supabase
      .from("hitl_tool_approvals")
      .select("tool_name, decision");
    if (error) throw error;
    for (const row of data ?? []) {
      const d = row.decision === "denied" ? "denied" : "approved";
      writeLocal(userId, String(row.tool_name), d);
    }
  } catch (e) {
    console.warn("[hitl] hydrate failed", e);
    hydrated.delete(userId); // allow retry
  }
}
