import { supabase } from "@/integrations/supabase/client";

/**
 * Checks if the just-signed-in user needs to complete an MFA challenge.
 * Returns the path to redirect to if MFA is required, otherwise null.
 */
export async function getMfaRedirect(intendedRedirect?: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) return null;
    if (data?.nextLevel === "aal2" && data.currentLevel === "aal1") {
      const r = intendedRedirect ? `?redirect=${encodeURIComponent(intendedRedirect)}` : "";
      return `/auth/mfa${r}`;
    }
    return null;
  } catch {
    return null;
  }
}
