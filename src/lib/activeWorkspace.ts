// Active workspace selection — tiny synchronous helpers + a change event so
// every subscriber (sidebar, pages) can refilter when the user switches.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// In-memory cache only — persisted source of truth is profiles.active_workspace_id.
// We DO NOT use localStorage for app state (only for design/theme).
let _activeId: string | null = null;
let _hydrated = false;
export const WORKSPACE_CHANGED_EVENT = "megsy:workspace-changed";

export function getActiveWorkspaceId(): string | null {
  return _activeId;
}

export function setActiveWorkspaceId(id: string | null) {
  _activeId = id;
  // Bust per-workspace cached lists so stale data from previous workspace disappears.
  // (These caches ARE allowed in localStorage — only for load speed.)
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (
        k.startsWith("megsy_cache_") ||
        k.startsWith("megsy_conv_cache_") ||
        k.startsWith("megsy_sidebar_conv_")
      ) {
        localStorage.removeItem(k);
      }
    }
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent(WORKSPACE_CHANGED_EVENT, { detail: { id } }));
  } catch {}
}

// Hydrate from DB once per session.
export async function hydrateActiveWorkspaceFromDB(): Promise<string | null> {
  if (_hydrated) return _activeId;
  _hydrated = true;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("profiles")
      .select("active_workspace_id")
      .eq("id", user.id)
      .maybeSingle();
    const id = (data as any)?.active_workspace_id ?? null;
    if (id !== _activeId) {
      _activeId = id;
      try {
        window.dispatchEvent(new CustomEvent(WORKSPACE_CHANGED_EVENT, { detail: { id } }));
      } catch {}
    }
    return id;
  } catch {
    return null;
  }
}

// Reset hydration on sign-out / sign-in.
export function resetActiveWorkspaceCache() {
  _activeId = null;
  _hydrated = false;
}

// React hook: returns the current active workspace id and re-renders when it changes.
export function useActiveWorkspaceId(): string | null {
  const [id, setId] = useState<string | null>(() => getActiveWorkspaceId());
  useEffect(() => {
    // Trigger hydration from DB on mount.
    hydrateActiveWorkspaceFromDB().then((v) => setId(v));
    const onChange = () => setId(getActiveWorkspaceId());
    window.addEventListener(WORKSPACE_CHANGED_EVENT, onChange);
    return () => {
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, onChange);
    };
  }, []);
  return id;
}
