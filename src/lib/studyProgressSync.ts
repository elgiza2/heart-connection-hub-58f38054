/** @doc Cross-device sync for StudyHUD state. Debounced upsert to `app_kv` so the same user's streak/XP/Bloom rung follows them across devices without blocking the local UX. localStorage remains the source of truth for the current tab; the DB is a durable mirror. */

import { supabase } from "@/integrations/supabase/client";
import { getStudyState, subscribeStudyState, type StudyState } from "@/lib/studyProgress";

const KV_KEY = "megsy:study:v1";
const KV_PROJECT = "megsy:learn";
const DEBOUNCE_MS = 1500;

let timer: ReturnType<typeof setTimeout> | null = null;
let unsub: (() => void) | null = null;
let installed = false;
let userIdCache: string | null = null;

async function getUserId(): Promise<string | null> {
  if (userIdCache) return userIdCache;
  const { data } = await supabase.auth.getUser();
  userIdCache = data.user?.id ?? null;
  return userIdCache;
}

async function pushToDb(state: StudyState) {
  const uid = await getUserId();
  if (!uid) return;
  try {
    await supabase
      .from("app_kv")
      .upsert(
        { user_id: uid, project_id: KV_PROJECT, key: KV_KEY, value: state as any },
        { onConflict: "user_id,project_id,key" as any },
      );
  } catch {
    /* offline / RLS – silent */
  }
}

async function pullFromDb(): Promise<StudyState | null> {
  const uid = await getUserId();
  if (!uid) return null;
  try {
    const { data } = await supabase
      .from("app_kv")
      .select("value,updated_at")
      .eq("user_id", uid)
      .eq("project_id", KV_PROJECT)
      .eq("key", KV_KEY)
      .maybeSingle();
    return (data?.value as unknown as StudyState) ?? null;
  } catch {
    return null;
  }
}

/**
 * Install once on app boot (or on chat mount): merges any newer remote state into
 * localStorage, then debounces every local change back to the DB.
 */
export function installStudyProgressSync(): () => void {
  if (installed || typeof window === "undefined") return () => undefined;
  installed = true;

  // Initial merge: prefer whichever side has more answered cards (progress-forward).
  (async () => {
    const remote = await pullFromDb();
    if (!remote) return;
    const local = getStudyState();
    if (remote.cardsAnswered > local.cardsAnswered || remote.xp > local.xp) {
      try {
        window.localStorage.setItem(KV_KEY, JSON.stringify(remote));
        window.dispatchEvent(new CustomEvent("megsy:study-progress"));
      } catch {
        /* quota */
      }
    }
  })();

  unsub = subscribeStudyState(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void pushToDb(getStudyState());
    }, DEBOUNCE_MS);
  });

  return () => {
    if (timer) clearTimeout(timer);
    unsub?.();
    unsub = null;
    installed = false;
  };
}
