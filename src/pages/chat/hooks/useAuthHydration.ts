import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getUserSafe } from "@/lib/authSafe";
import { getOwnProfile } from "@/lib/ownProfile";
import type { MegsyTier } from "./useChatTier";


/**
 * Hydrates Megsy chat with the current user's id, display-name, plan, AI tier
 * preference, and "first visit" greeting flag. Subscribes to auth changes so
 * the chat stays in sync when the user signs in/out in another tab.
 */
export function useAuthHydration(setters: {
  setChatUserId: (next: string | null) => void;
  setUserName: (next: string) => void;
  setUserPlan: (next: string) => void;
  setIsFirstVisit: (next: boolean) => void;
  setMegsyTier: (next: MegsyTier) => void;
}) {
  const { setChatUserId, setUserName, setUserPlan, setIsFirstVisit, setMegsyTier } = setters;

  useEffect(() => {
    let cancelled = false;

    const resetAuthState = () => {
      if (cancelled) return;
      setChatUserId(null);
      setUserName("");
      setUserPlan("free");
      setIsFirstVisit(false);
    };

    const hydrateAuthState = async () => {
      const user = await getUserSafe();
      if (!user) {

        resetAuthState();
        return;
      }
      if (cancelled) return;
      setChatUserId(user.id);
      const profile = await getOwnProfile(user.id);
      const name =
        (profile as any)?.display_name ||
        (user.user_metadata?.full_name as string) ||
        (user.email?.split("@")[0] ?? "");
      const firstName = (name || "").split(/\s+/)[0];
      if (cancelled) return;
      setUserName(firstName);
      setUserPlan((profile as any)?.plan || "free");
      const { data: pers } = await supabase
        .from("ai_personalization")
        .select("preferred_tier")
        .eq("user_id", user.id)
        .maybeSingle();
      const prefTier = (pers as any)?.preferred_tier;
      if (!cancelled && prefTier && ["lite", "pro", "max"].includes(prefTier)) {
        setMegsyTier(prefTier as MegsyTier);
      }
      if (!cancelled && !(profile as any)?.chat_greeted) {
        setIsFirstVisit(true);
        await supabase
          .from("profiles")
          .update({ chat_greeted: true } as any)
          .eq("id", user.id);
      }
    };

    void hydrateAuthState();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        resetAuthState();
        return;
      }
      void hydrateAuthState();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
