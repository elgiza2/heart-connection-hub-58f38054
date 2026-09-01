// Premium slides quota: free users get 3 free premium slide generations per day,
// then it costs 1 credit per generation.
import { supabase } from "@/integrations/supabase/client";

export const FREE_PREMIUM_SLIDES_PER_DAY = 3;
export const PREMIUM_SLIDES_CREDIT_COST = 1;
const FEATURE = "premium_slides";

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function getPremiumSlidesUsedToday(userId: string): Promise<number> {
  const { data } = await supabase
    .from("daily_free_usage")
    .select("usage_count")
    .eq("user_id", userId)
    .eq("usage_date", todayYMD())
    .eq("feature", FEATURE)
    .maybeSingle();
  return Math.max(0, (data as any)?.usage_count ?? 0);
}

/**
 * Authorize one premium slide generation for the user.
 * - If they still have free uses today: allow without charging.
 * - Otherwise: deduct PREMIUM_SLIDES_CREDIT_COST credits.
 *
 * Both the daily-quota increment and the credit charge happen atomically in a
 * single server-side function (`consume_daily_free_or_credits`); the browser
 * can no longer write `daily_free_usage` directly.
 */
export async function authorizePremiumSlide(
  _userId?: string,
): Promise<{ ok: true; charged: boolean; remainingFree: number } | { ok: false; reason: string }> {
  const { data, error } = await supabase.rpc("consume_daily_free_or_credits", {
    p_feature: FEATURE,
    p_free_per_day: FREE_PREMIUM_SLIDES_PER_DAY,
    p_cost: PREMIUM_SLIDES_CREDIT_COST,
    p_description: "Premium slides generation (over daily free quota)",
  } as never);

  if (error) return { ok: false, reason: "Could not process credit charge" };

  const result = data as
    | { success?: boolean; charged?: boolean; remaining_free?: number; error?: string }
    | null;

  if (!result?.success) return { ok: false, reason: result?.error || "Insufficient credits" };

  return {
    ok: true,
    charged: !!result.charged,
    remainingFree: Math.max(0, result.remaining_free ?? 0),
  };
}

