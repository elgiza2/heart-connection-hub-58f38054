/** @doc Captures referral code from a shared link and redirects to sign-up. */
import { useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export const REFERRAL_STORAGE_KEY = "megsy_referral_code";

/**
 * Captures a referral code from /ref/:code:
 *  - stores it in localStorage (with utm context + landing info)
 *  - records a click row in `referral_clicks` (RLS allows anon insert)
 *  - forwards the visitor to /auth so the signup form pre-fills the invite code
 */
const ReferralRedirectPage = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!code) {
      navigate("/", { replace: true });
      return;
    }

    const clean = code.trim().toUpperCase().slice(0, 64);
    const search = new URLSearchParams(location.search);
    const utm_source = search.get("utm_source");
    const utm_medium = search.get("utm_medium");
    const utm_campaign = search.get("utm_campaign");
    const referer = document.referrer || null;
    const landing_path = location.pathname + location.search;

    try {
      localStorage.setItem(
        REFERRAL_STORAGE_KEY,
        JSON.stringify({
          code: clean,
          ts: Date.now(),
          utm_source,
          utm_medium,
          utm_campaign,
          referer,
          landing_path,
        }),
      );
    } catch {}

    // Resolve referrer_user_id from the code, then insert a click row.
    // Fire-and-forget; never block the redirect.
    (async () => {
      try {
        const { data: codeRow } = await supabase
          .from("referral_codes")
          .select("user_id")
          .ilike("code", clean)
          .maybeSingle();
        await supabase.from("referral_clicks").insert({
          code: clean,
          referrer_user_id: codeRow?.user_id ?? null,
          user_agent: navigator.userAgent,
          referer,
          utm_source,
          utm_medium,
          utm_campaign,
          landing_path,
        });
      } catch {}
    })();

    navigate("/auth?ref=" + encodeURIComponent(clean), { replace: true });
  }, [code, location.pathname, location.search, navigate]);

  return null;
};

export default ReferralRedirectPage;
