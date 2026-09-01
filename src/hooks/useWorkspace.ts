import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCachedUser } from "@/lib/cachedUser";
import {
  setActiveWorkspaceId,
  hydrateActiveWorkspaceFromDB,
  getActiveWorkspaceId,
} from "@/lib/activeWorkspace";

export interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  credits: number;
  default_member_monthly_limit: number | null;
  avatar_url: string | null;
  created_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  monthly_limit: number | null;
  monthly_used: number;
  joined_at: string;
}

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(() => getActiveWorkspaceId());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const user = await getCachedUser();
    if (!user) {
      setLoading(false);
      return;
    }
    // Hydrate active id from DB on first load.
    const hydrated = await hydrateActiveWorkspaceFromDB();
    if (hydrated !== activeId) setActiveIdState(hydrated);
    const { data: members } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id);
    const ids = (members ?? []).map((m: any) => m.workspace_id);
    if (ids.length === 0) {
      setWorkspaces([]);
      setLoading(false);
      return;
    }
    const { data: ws } = await supabase
      .from("workspaces")
      .select("*")
      .in("id", ids)
      .order("created_at", { ascending: true });
    setWorkspaces((ws as any) ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime: update credits / new workspaces / removals
  useEffect(() => {
    const channelName = `workspaces-list-${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "workspaces" }, () =>
        refresh(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "workspace_members" }, () =>
        refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  const setActive = useCallback(async (id: string | null) => {
    setActiveIdState(id);
    // Persist + bust caches + notify all subscribers (sidebar, pages).
    setActiveWorkspaceId(id);
    const user = await getCachedUser();
    if (user) {
      await supabase
        .from("profiles")
        .update({ active_workspace_id: id } as any)
        .eq("id", user.id);
    }
  }, []);

  const active = workspaces.find((w) => w.id === activeId) ?? null;

  return { workspaces, active, activeId, setActive, loading, refresh };
}

export function useWorkspaceMembers(workspaceId: string | null) {
  const [members, setMembers] = useState<
    (WorkspaceMember & { display_name?: string; email?: string; avatar_url?: string | null })[]
  >([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setMembers([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("workspace_members")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("joined_at", { ascending: true });
    const list = (data as any) ?? [];
    if (list.length) {
      const ids = list.map((m: any) => m.user_id);
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", ids);
      const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
      setMembers(list.map((m: any) => ({ ...m, ...(map.get(m.user_id) ?? {}) })));
    } else {
      setMembers([]);
    }
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!workspaceId) return;
    const channelName = `ws-members-${workspaceId}-${Math.random().toString(36).slice(2, 10)}`;
    const ch = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workspace_members",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [workspaceId, refresh]);

  return { members, loading, refresh };
}
