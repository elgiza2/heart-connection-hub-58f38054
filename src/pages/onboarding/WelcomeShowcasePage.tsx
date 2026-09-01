/** @doc WelcomeShowcasePage — first-run onboarding showcase before the chat. */
/**
 * WelcomeShowcasePage — first-open onboarding showcase (all devices).
 */
import { useNavigate } from "react-router-dom";
import FeatureShowcase from "@/components/onboarding/FeatureShowcase";
import { supabase } from "@/integrations/supabase/client";

export default function WelcomeShowcasePage() {
  const navigate = useNavigate();

  return (
    <FeatureShowcase
      onFinish={async () => {
        try {
          localStorage.setItem("megsy_seen_welcome", "1");
        } catch {}
        // Already signed in → go straight to the app instead of the auth screen.
        let signedIn = false;
        try {
          const { data } = await supabase.auth.getSession();
          signedIn = !!data.session;
        } catch {}
        navigate(signedIn ? "/chat" : "/auth", { replace: true });
      }}
    />
  );
}
