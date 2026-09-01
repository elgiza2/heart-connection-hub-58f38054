import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveWorkspaceId, WORKSPACE_CHANGED_EVENT } from "@/lib/activeWorkspace";
import { getCachedUser } from "@/lib/cachedUser";
import { getOwnProfile, invalidateOwnProfile } from "@/lib/ownProfile";

export const CREDITS_CHANGED_EVENT = "credits-changed";

// Workspace-aware credits hook. When a workspace is active, returns workspace credits.
// In personal mode, returns the user's profile credits. Used for display in headers.
export function useCredits() {
  const wsId = useActiveWorkspaceId();
  const [credits, setCredits] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [plan, setPlan] = useState<string>("free");
  const [loading, setLoading] = useState(true);

  const fetchCredits = useCallback(async () => {
    setLoading(true);
    const user = await getCachedUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setUserId(user.id);

    if (wsId) {
      const { data } = await supabase
        .from("workspaces")
        .select("credits, plan")
        .eq("id", wsId)
        .maybeSingle();
      if (data) {
        setCredits(Number((data as any).credits));
        setPlan(((data as any).plan as string) || "free");
      } else {
        setCredits(0);
      }
    } else {
      const data = await getOwnProfile(user.id);
      if (data) {
        setCredits(Number(data.credits));
        setPlan((data as any).plan || "free");
      }
    }
    setLoading(false);
  }, [wsId]);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  useEffect(() => {
    const onChange = () => {
      // Credit balance changed server-side — bypass the shared profile cache.
      invalidateOwnProfile();
      void fetchCredits();
    };
    window.addEventListener(WORKSPACE_CHANGED_EVENT, onChange);
    window.addEventListener(CREDITS_CHANGED_EVENT, onChange);
    return () => {
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, onChange);
      window.removeEventListener(CREDITS_CHANGED_EVENT, onChange);
    };
  }, [fetchCredits]);

  const isPaid = plan && plan !== "free" && plan !== "trial";

  const hasEnoughCredits = (cost: number) => {
    // While loading, don't block — assume yes; the server will re-validate
    if (loading || credits === null) return true;
    // Paid plans have broader access; video remains server-validated by MC/fair-use rules.
    if (isPaid) return true;
    return credits >= cost;
  };

  return { credits, userId, plan, isPaid, loading, hasEnoughCredits, refreshCredits: fetchCredits };
}
