/** @doc Completes an Apple sign-in and turns it into a normal app session. */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthenticateWithRedirectCallback, useAuth } from "@clerk/clerk-react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { clerkEnabled } from "@/lib/clerk/config";
import { clerkApi } from "@/lib/clerk/client";

function Bridge() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || ran.current) return;
    ran.current = true;

    (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Sign-in expired, please try again");
        const res = await clerkApi("bridge_session", token);
        if (res.ok === false || !res.token_hash || !res.email) {
          throw new Error(res.error || "Could not finish signing you in");
        }
        const { error: verifyError } = await supabase.auth.verifyOtp({
          type: "magiclink",
          token_hash: res.token_hash,
        });
        if (verifyError) throw new Error(verifyError.message);
        navigate("/", { replace: true });
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, [isLoaded, isSignedIn, getToken, navigate]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
      {error ? <AlertCircle className="h-6 w-6 text-destructive" /> : <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
      <p className="text-sm text-muted-foreground">{error ?? "Signing you in…"}</p>
      {error && (
        <Button variant="secondary" size="sm" onClick={() => navigate("/auth", { replace: true })}>
          Back to sign in
        </Button>
      )}
    </div>
  );
}

export default function AppleCallbackPage() {
  if (!clerkEnabled) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-6 text-center text-sm text-muted-foreground">
        Apple sign-in is not enabled yet.
      </div>
    );
  }
  return (
    <>
      {/* Consumes the redirect params and establishes the broker session. */}
      <AuthenticateWithRedirectCallback signInFallbackRedirectUrl="/auth/apple-callback" />
      <Bridge />
    </>
  );
}
