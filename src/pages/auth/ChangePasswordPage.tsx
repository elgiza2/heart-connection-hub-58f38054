/** @doc Change the current account password while signed in. */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff, ChevronLeft } from "lucide-react";
import { sanitizeErrorMessage } from "@/lib/sanitizeError";
import { useIsMobile } from "@/hooks/use-mobile";
import { SubShell, SubSection, SubCard } from "@/components/settings/SubShell";
import ProfileGlassShell, {
  GlassSection,
  GlassCard,
  GlassPrimaryButton,
  GlassSecondaryButton,
} from "@/components/profile/ProfileGlassShell";
import { cn } from "@/lib/utils";

const ChangePasswordPage = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) return toast.error("Please fill all fields");
    if (newPassword.length < 8) return toast.error("Password must be at least 8 characters");
    if (newPassword !== confirmPassword) return toast.error("Passwords do not match");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password changed successfully");
      navigate("/settings/security");
    } catch (error: any) {
      toast.error(sanitizeErrorMessage(error, "Failed to change password"));
    } finally {
      setLoading(false);
    }
  };

  const strength =
    newPassword.length >= 16 ? 4
    : newPassword.length >= 12 ? 3
    : newPassword.length >= 8 ? 2
    : newPassword.length > 0 ? 1 : 0;
  const strengthLabels = ["", "Weak", "Medium", "Strong", "Very Strong"];
  const strengthTones = ["bg-border", "bg-rose-400", "bg-amber-400", "bg-emerald-400", "bg-emerald-400"];

  const goBack = () =>
    navigate("/settings/security");

  const PwdField = ({
    label, value, onChange, show, setShow, onEnter, mobile = false,
  }: {
    label: string; value: string; onChange: (v: string) => void;
    show: boolean; setShow: (v: boolean) => void; onEnter?: () => void; mobile?: boolean;
  }) => (
    <div>
      <label className={mobile
        ? "text-[12px] font-medium text-foreground/60 px-0.5"
        : "text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium"}>
        {label}
      </label>
      <div className={mobile ? "relative mt-1.5" : "relative mt-2"}>
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
          placeholder="••••••••"
          className={mobile
            ? "w-full px-3.5 py-3 pr-11 rounded-xl bg-background/60 border border-border/70 text-[15px] text-foreground outline-none focus:border-foreground/40 transition-colors"
            : "w-full px-3.5 py-2.5 pr-11 rounded-lg bg-background/60 border border-border/70 text-[14px] text-foreground outline-none focus:border-foreground/40 transition-colors"}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-2 top-1/2 -translate-y-1/2 grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
          aria-label={show ? "Hide" : "Show"}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <ProfileGlassShell
        title="Password"
        subtitle="Choose a strong password with at least 8 characters. You'll stay signed in on this device."
        onBack={goBack}
      >
        <GlassSection title="New password" index="01">
          <GlassCard>
            <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
              <PwdField label="New password" value={newPassword} onChange={setNewPassword} show={showNew} setShow={setShowNew} mobile />
              <PwdField label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} show={showConfirm} setShow={setShowConfirm} onEnter={handleChangePassword} mobile />
              {newPassword && (
                <div>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={cn("h-1.5 flex-1 rounded-full transition-all", i <= strength ? strengthTones[strength] : "bg-foreground/10")}
                      />
                    ))}
                  </div>
                  <p style={{ marginTop: 8, fontSize: 12, color: "rgba(235,220,205,0.6)", fontWeight: 500 }}>
                    {strengthLabels[strength]}
                  </p>
                </div>
              )}
              <p style={{ fontSize: 12, color: "rgba(235,220,205,0.5)", lineHeight: 1.5 }}>
                Use at least 8 characters. Longer is stronger.
              </p>
            </div>
          </GlassCard>
        </GlassSection>

        <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
          <GlassSecondaryButton onClick={goBack} style={{ flex: 1 }}>
            Cancel
          </GlassSecondaryButton>
          <GlassPrimaryButton
            onClick={handleChangePassword}
            disabled={loading || !newPassword || !confirmPassword}
            style={{ flex: 1 }}
          >
            {loading ? "Updating…" : "Update password"}
          </GlassPrimaryButton>
        </div>
      </ProfileGlassShell>
    );
  }

  return (
    <SubShell
      title="Change Password"
      subtitle="Choose a strong password with at least 8 characters. You'll stay signed in on this device."
      backTo="/settings/security"
    >
      <SubSection title="New password" description="Use a mix of letters, numbers, and symbols. Longer passwords are stronger.">
        <SubCard>
          <div className="space-y-4">
            <PwdField label="New password" value={newPassword} onChange={setNewPassword} show={showNew} setShow={setShowNew} />
            <PwdField label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} show={showConfirm} setShow={setShowConfirm} onEnter={handleChangePassword} />
            {newPassword && (
              <div>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className={cn("h-1.5 flex-1 rounded-full transition-all", i <= strength ? strengthTones[strength] : "bg-border/60")} />
                  ))}
                </div>
                <p className="mt-2 text-[12px] text-muted-foreground font-medium">{strengthLabels[strength]}</p>
              </div>
            )}
          </div>
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              onClick={() => navigate("/settings/security")}
              className="px-4 py-2 rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleChangePassword}
              disabled={loading || !newPassword || !confirmPassword}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40 transition-colors"
            >
              {loading ? "Updating…" : "Update password"}
            </button>
          </div>
        </SubCard>
      </SubSection>
    </SubShell>
  );
};

export default ChangePasswordPage;
