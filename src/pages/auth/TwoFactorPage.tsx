/** @doc Set up and manage two-factor authentication. */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, ShieldCheck, Copy, Check, ChevronLeft } from "lucide-react";
import { sanitizeErrorMessage } from "@/lib/sanitizeError";
import { useIsMobile } from "@/hooks/use-mobile";
import { SubShell, SubSection, SubCard } from "@/components/settings/SubShell";
import ProfileGlassShell, {
  GlassSection,
  GlassCard,
  GlassPrimaryButton,
  GlassSecondaryButton,
} from "@/components/profile/ProfileGlassShell";

type Step = "loading" | "status" | "enroll";

const TwoFactorPage = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [step, setStep] = useState<Step>("loading");
  const [factors, setFactors] = useState<any[]>([]);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string>("");
  const [secret, setSecret] = useState<string>("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadFactors = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const totp = (data?.totp || []).filter((f: any) => f.status === "verified");
      setFactors(totp);
      setStep("status");
    } catch (e: any) {
      toast.error(sanitizeErrorMessage(e, "Failed to load 2FA status"));
      setStep("status");
    }
  };

  useEffect(() => { loadFactors(); }, []);

  const startEnroll = async () => {
    setBusy(true);
    try {
      const { data: list } = await supabase.auth.mfa.listFactors();
      const unverified = (list?.totp || []).filter((f: any) => f.status !== "verified");
      for (const f of unverified) await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Authenticator ${Date.now()}`,
      });
      if (error) throw error;
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
      setStep("enroll");
    } catch (e: any) {
      toast.error(sanitizeErrorMessage(e, "Failed to start 2FA setup"));
    } finally { setBusy(false); }
  };

  const verifyEnroll = async () => {
    if (!factorId || otp.length !== 6) return toast.error("Enter the 6-digit code");
    setBusy(true);
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chErr) throw chErr;
      const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: otp });
      if (vErr) throw vErr;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.rpc("update_profile_safe", { p_user_id: user.id, p_two_factor_enabled: true });
      }
      toast.success("Two-factor authentication enabled");
      setOtp(""); setFactorId(null); setQr(""); setSecret("");
      await loadFactors();
    } catch (e: any) {
      toast.error(sanitizeErrorMessage(e, "Invalid code"));
    } finally { setBusy(false); }
  };

  const disable2FA = async () => {
    if (!confirm("Disable two-factor authentication?")) return;
    setBusy(true);
    try {
      const { data: list } = await supabase.auth.mfa.listFactors();
      const all = [...(list?.totp || []), ...((list as any)?.phone || [])];
      for (const f of all) await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.rpc("update_profile_safe", { p_user_id: user.id, p_two_factor_enabled: false });
      }
      toast.success("Two-factor authentication disabled");
      await loadFactors();
    } catch (e: any) {
      toast.error(sanitizeErrorMessage(e, "Failed to disable 2FA"));
    } finally { setBusy(false); }
  };

  const cancelEnroll = async () => {
    if (factorId) await supabase.auth.mfa.unenroll({ factorId });
    setFactorId(null); setQr(""); setSecret(""); setOtp("");
    setStep("status");
  };

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const enabled = factors.length > 0;

  const goBack = () =>
    navigate("/settings/security");

  if (isMobile) {
    return (
      <ProfileGlassShell
        title="Two-factor"
        subtitle="Add an extra layer of security using an authenticator app like Google Authenticator, 1Password, or Authy."
        onBack={goBack}
      >
        {step === "loading" && (
          <GlassCard>
            <div style={{ padding: 24, textAlign: "center", color: "rgba(232,232,232,0.6)", fontSize: 13.5 }}>Loading…</div>
          </GlassCard>
        )}

        {step === "status" && (
          <>
            <GlassSection title="Status" index="01">
              <GlassCard>
                <div style={{ display: "flex", gap: 12, padding: 16 }}>
                  <div
                    style={{
                      width: 44, height: 44, borderRadius: 22,
                      display: "grid", placeItems: "center",
                      flexShrink: 0,
                      background: enabled ? "rgba(52,211,153,0.14)" : "var(--overlay-white-06)",
                      color: enabled ? "#6ee7b7" : "rgba(232,232,232,0.7)",
                      boxShadow: `inset 0 0 0 1px ${enabled ? "rgba(52,211,153,0.35)" : "var(--overlay-white-12)"}`,
                    }}
                  >
                    {enabled ? <ShieldCheck className="w-5 h-5" strokeWidth={1.8} /> : <Shield className="w-5 h-5" strokeWidth={1.8} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: "#e8e8e8" }}>
                      {enabled ? "Enabled" : "Disabled"}
                    </p>
                    <p style={{ marginTop: 4, fontSize: 13, color: "rgba(232,232,232,0.6)", lineHeight: 1.5 }}>
                      {enabled
                        ? "You'll be asked for a 6-digit code from your authenticator app at sign in."
                        : "Turn on 2FA to require a code from your authenticator app at sign in."}
                    </p>
                  </div>
                </div>
              </GlassCard>
            </GlassSection>

            {enabled ? (
              <button
                onClick={disable2FA}
                disabled={busy}
                className="pgs-btn"
                style={{
                  width: "100%",
                  background: "rgba(244,63,94,0.85)",
                  color: "#fff",
                }}
              >
                {busy ? "Disabling…" : "Disable 2FA"}
              </button>
            ) : (
              <GlassPrimaryButton onClick={startEnroll} disabled={busy} style={{ width: "100%" }}>
                {busy ? "Preparing…" : "Enable 2FA"}
              </GlassPrimaryButton>
            )}
          </>
        )}

        {step === "enroll" && (
          <>
            <GlassSection title="Scan QR" index="01">
              <GlassCard>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 16 }}>
                  {qr && (
                    <div style={{ padding: 12, borderRadius: 20, background: "#fff" }}>
                      <img loading="lazy" decoding="async" src={qr} alt="2FA QR" width={200} height={200} />
                    </div>
                  )}
                  <p style={{ marginTop: 14, fontSize: 12, fontWeight: 500, color: "rgba(232,232,232,0.6)" }}>
                    Or enter this key manually
                  </p>
                  <button
                    onClick={copySecret}
                    style={{
                      marginTop: 8,
                      display: "inline-flex", alignItems: "center", gap: 8,
                      padding: "8px 12px", borderRadius: 12,
                      fontSize: 12, fontFamily: "ui-monospace, monospace",
                      background: "var(--overlay-white-05)",
                      color: "#e8e8e8", border: 0,
                      boxShadow: "inset 0 0 0 1px var(--overlay-white-12)",
                      cursor: "pointer", maxWidth: "100%",
                    }}
      aria-label="Check"
    >
                    <span style={{ wordBreak: "break-all", textAlign: "left" }}>{secret}</span>
                    {copied
                      ? <Check className="w-3.5 h-3.5" style={{ color: "#6ee7b7", flexShrink: 0 }} />
                      : <Copy className="w-3.5 h-3.5" style={{ color: "rgba(232,232,232,0.6)", flexShrink: 0 }} />}
                  </button>
                </div>
              </GlassCard>
            </GlassSection>

            <GlassSection title="Verify code" index="02">
              <GlassCard>
                <div style={{ padding: 16 }}>
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onKeyDown={(e) => e.key === "Enter" && verifyEnroll()}
                    placeholder="000000"
                    className="pgs-input"
                    style={{ textAlign: "center", fontSize: 22, letterSpacing: "0.4em" }}
                  />
                  <p style={{ marginTop: 8, fontSize: 12, color: "rgba(232,232,232,0.55)" }}>
                    Enter the 6-digit code from your authenticator app.
                  </p>
                </div>
              </GlassCard>
            </GlassSection>

            <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
              <GlassSecondaryButton onClick={cancelEnroll} style={{ flex: 1 }}>
                Cancel
              </GlassSecondaryButton>
              <GlassPrimaryButton
                onClick={verifyEnroll}
                disabled={busy || otp.length !== 6}
                style={{ flex: 1 }}
              >
                {busy ? "Verifying…" : "Verify & enable"}
              </GlassPrimaryButton>
            </div>
          </>
        )}
      </ProfileGlassShell>
    );
  }


  return (
    <SubShell
      title="Two-Factor Authentication"
      subtitle="Add an extra layer of security to your account using an authenticator app like Google Authenticator, 1Password, or Authy."
      backTo="/settings/security"
    >
      {step === "loading" && (
        <SubSection title="Status" description="Checking your 2FA configuration.">
          <SubCard><p className="text-[13.5px] text-muted-foreground">Loading…</p></SubCard>
        </SubSection>
      )}

      {step === "status" && (
        <SubSection
          title="Status"
          description={enabled
            ? "Your account is protected. A code will be required at sign in."
            : "Two-factor authentication is currently disabled."}
        >
          <SubCard>
            <div className="flex items-start gap-3">
              <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border ${
                enabled
                  ? "border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-300"
                  : "border-border/70 bg-muted/30 text-muted-foreground"
              }`}>
                {enabled ? <ShieldCheck className="w-5 h-5" strokeWidth={1.8} /> : <Shield className="w-5 h-5" strokeWidth={1.8} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14.5px] font-medium text-foreground">{enabled ? "Enabled" : "Disabled"}</p>
                <p className="mt-1 text-[12.5px] text-muted-foreground leading-relaxed">
                  {enabled
                    ? "You'll be asked for a 6-digit code from your authenticator app when signing in."
                    : "Turn on 2FA to require a code from your authenticator app at sign in."}
                </p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              {enabled ? (
                <button onClick={disable2FA} disabled={busy}
                  className="px-4 py-2 rounded-lg text-[13px] font-medium bg-rose-500/90 text-foreground hover:bg-rose-500 disabled:opacity-40 transition-colors">
                  {busy ? "Disabling…" : "Disable 2FA"}
                </button>
              ) : (
                <button onClick={startEnroll} disabled={busy}
                  className="px-4 py-2 rounded-lg text-[13px] font-medium bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40 transition-colors">
                  {busy ? "Preparing…" : "Enable 2FA"}
                </button>
              )}
            </div>
          </SubCard>
        </SubSection>
      )}

      {step === "enroll" && (
        <>
          <SubSection title="Scan QR code" description="Open your authenticator app and scan the code below, or enter the key manually.">
            <SubCard>
              <div className="flex flex-col items-center">
                {qr && (
                  <div className="p-3 rounded-xl bg-white">
                    <img loading="lazy" decoding="async" src={qr} alt="2FA QR" width={192} height={192} />
                  </div>
                )}
                <p className="mt-4 text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                  Or enter this key manually
                </p>
                <button onClick={copySecret}
                  className="mt-2 inline-flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-mono bg-background/60 border border-border/70 text-foreground hover:border-foreground/40 transition-colors"
      aria-label="Check"
    >
                  <span className="break-all">{secret}</span>
                  {copied ? <Check className="w-3.5 h-3.5 shrink-0 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
                </button>
              </div>
            </SubCard>
          </SubSection>

          <SubSection title="Verify code" description="Enter the 6-digit code shown in your authenticator app to finish setup.">
            <SubCard>
              <label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                Authentication code
              </label>
              <input
                inputMode="numeric" pattern="[0-9]*" maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(e) => e.key === "Enter" && verifyEnroll()}
                placeholder="000000"
                className="mt-2 w-full px-3.5 py-2.5 rounded-lg bg-background/60 border border-border/70 text-center text-[18px] tracking-[0.4em] text-foreground outline-none focus:border-foreground/40 transition-colors"
              />
              <div className="mt-5 flex items-center justify-end gap-2">
                <button onClick={cancelEnroll}
                  className="px-4 py-2 rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors">
                  Cancel
                </button>
                <button onClick={verifyEnroll} disabled={busy || otp.length !== 6}
                  className="px-4 py-2 rounded-lg text-[13px] font-medium bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40 transition-colors">
                  {busy ? "Verifying…" : "Verify & enable"}
                </button>
              </div>
            </SubCard>
          </SubSection>
        </>
      )}
    </SubShell>
  );
};

export default TwoFactorPage;
