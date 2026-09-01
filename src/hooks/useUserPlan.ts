import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isPaidUser } from "@/lib/subscriptionGating";
import { getCachedUser } from "@/lib/cachedUser";
import { getOwnProfile } from "@/lib/ownProfile";

export function useUserPlan() {
  const [plan, setPlan] = useState<string>("free");
  const [isPaid, setIsPaid] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const user = await getCachedUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Prefer server-side truth via has_paid_plan RPC.
      const { data: paid } = await supabase.rpc("has_paid_plan", { p_user_id: user.id });
      if (typeof paid === "boolean") setIsPaid(paid);

      const data = await getOwnProfile(user.id);
      if (data) {
        const p = (data.plan || "free").toString().toLowerCase();
        setPlan(p);
        if (typeof paid !== "boolean") setIsPaid(isPaidUser(p));
      }
      setLoading(false);
    };
    load();
  }, []);

  return { plan, isPaid, loading };
}
