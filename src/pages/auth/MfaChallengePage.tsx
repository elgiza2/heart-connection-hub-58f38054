/** @doc Multi-factor authentication challenge during sign-in. */
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield } from "lucide-react";
import { sanitizeErrorMessage } from "@/lib/sanitizeError";

const MfaChallengePage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get("redirect") || "/chat";
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error) throw error;
        const totp = (data?.totp || []).find((f: any) => f.status === "verified");
        if (!totp) {
          navigate(redirect, { replace: true });
          return;
        }
        setFactorId(totp.id);
        const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id });
        if (chErr) throw chErr;
        setChallengeId(ch.id);
      } catch (e: any) {
        toast.error(sanitizeErrorMessage(e, "Failed to start 2FA challenge"));
      }
    })();
  }, [navigate, redirect]);

  const verify = async () => {
    if (!factorId || !challengeId || code.length !== 6) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
      if (error) throw error;
      toast.success("Verified");
      navigate(redirect, { replace: true });
    } catch (e: any) {
      toast.error(sanitizeErrorMessage(e, "Invalid code"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh grid place-items-center bg-background p-4">
      <div className="w-full max-w-sm space-y-4 rounded-3xl border bg-card p-6 text-center shadow-sm">
        <Shield className="mx-auto h-12 w-12 text-primary" />
        <h1 className="text-xl font-bold">Two-Factor Authentication</h1>
        <p className="text-sm text-muted-foreground">
          Enter the 6-digit code from your authenticator app.
        </p>
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={(e) => e.key === "Enter" && verify()}
          placeholder="000000"
          className="w-full rounded-xl border bg-muted/40 px-4 py-3 text-center text-2xl tracking-[0.5em] font-bold outline-none focus:ring-2 focus:ring-primary/30"
          autoFocus
        />
        <button
          onClick={verify}
          disabled={busy || code.length !== 6}
          className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Verifying…" : "Verify"}
        </button>
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            navigate("/auth", { replace: true });
          }}
          className="w-full text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel and sign out
        </button>
      </div>
    </div>
  );
};

export default MfaChallengePage;
