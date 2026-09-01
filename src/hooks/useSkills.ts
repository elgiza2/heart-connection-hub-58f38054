import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveWorkspaceId, WORKSPACE_CHANGED_EVENT } from "@/lib/activeWorkspace";

export interface Skill {
  id: string;
  user_id?: string | null;
  name: string;
  description: string;
  instructions: string;
  body?: string;
  triggers?: string[];
  enabled_tools: string[];
  preferred_model: string | null;
  icon: string | null;
  is_active?: boolean;
  is_enabled?: boolean;
  source?: "mine" | "system";
}

/**
 * Backwards-compat shim. The "active skill" model is deprecated in favor of
 * model-driven auto-invocation over the user's enabled skills. Kept as a no-op
 * to avoid breaking older imports during the migration.
 */
export function useActiveSkill() {
  return { activeSkill: null as Skill | null, setActiveSkill: (_: Skill | null) => {} };
}

const LIBRARY_CACHE_KEY = "megsy_cache_system_skills_v1";
const LIBRARY_CACHE_TTL = 12 * 60 * 60 * 1000; // 12h — admin-curated

function readSkillsCache(key: string): Skill[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, expiry } = JSON.parse(raw);
    if (!Array.isArray(data) || (expiry && Date.now() > expiry)) return null;
    return data as Skill[];
  } catch {
    return null;
  }
}

function writeSkillsCache(key: string, data: Skill[], ttl: number) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, expiry: Date.now() + ttl }));
  } catch {
    /* ignore */
  }
}

export function useSkills() {
  const initialLib = typeof window !== "undefined" ? readSkillsCache(LIBRARY_CACHE_KEY) : null;
  const [mySkills, setMySkills] = useState<Skill[]>([]);
  const [librarySkills, setLibrarySkills] = useState<Skill[]>(initialLib ?? []);
  const [loading, setLoading] = useState(!initialLib);
  const activeWs = useActiveWorkspaceId();

  const reload = useCallback(async () => {
    // If we already have a library cache, keep UI rendered and revalidate quietly.
    if (!librarySkills.length) setLoading(true);
    let mineQ = supabase.from("skills").select("*");
    if (activeWs) mineQ = mineQ.eq("workspace_id", activeWs);
    else mineQ = mineQ.is("workspace_id", null);
    const [mine, lib] = await Promise.all([
      mineQ.order("created_at", { ascending: false }),
      supabase.from("system_skills").select("*").eq("is_active", true).order("display_order"),
    ]);
    setMySkills(((mine.data as any[]) || []).map((s) => ({ ...s, source: "mine" as const })));
    const libNext = ((lib.data as any[]) || []).map((s) => ({ ...s, source: "system" as const }));
    setLibrarySkills(libNext);
    writeSkillsCache(LIBRARY_CACHE_KEY, libNext, LIBRARY_CACHE_TTL);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWs]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const onChange = () => {
      reload();
    };
    window.addEventListener(WORKSPACE_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, onChange);
  }, [reload]);

  const toggleEnabled = useCallback(async (skill: Skill, next: boolean) => {
    if (skill.source !== "mine") return;
    setMySkills((prev) => prev.map((s) => (s.id === skill.id ? { ...s, is_enabled: next } : s)));
    await supabase.from("skills").update({ is_enabled: next }).eq("id", skill.id);
  }, []);

  const enabledSkills = useMemo(() => mySkills.filter((s) => s.is_enabled !== false), [mySkills]);

  return { mySkills, librarySkills, enabledSkills, loading, reload, toggleEnabled };
}
