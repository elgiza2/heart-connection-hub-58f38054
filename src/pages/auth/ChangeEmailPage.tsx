/** @doc Change the account email address with verification. */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { sanitizeErrorMessage } from "@/lib/sanitizeError";
import { useIsMobile } from "@/hooks/use-mobile";
import { SubShell, SubSection, SubCard } from "@/components/settings/SubShell";
import ProfileGlassShell, {
  GlassSection,
  GlassCard,
  GlassRow,
  GlassField,
  GlassPrimaryButton,
  GlassSecondaryButton,
} from "@/components/profile/ProfileGlassShell";
import { IOS26_ICONS } from "@/assets/ios26-icons";

const ChangeEmailPage = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [newEmail, setNewEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentEmail, setCurrentEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentEmail(user.email || "");
    });
  }, []);

  const handleChangeEmail = async () => {
    if (!newEmail) return toast.error("Please enter an email");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail))
      return toast.error("Please enter a valid email");
    if (newEmail === currentEmail) return toast.error("This is your current email");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;
      toast.success("Confirmation email sent to both addresses");
      navigate("/settings/security");
    } catch (error: any) {
      toast.error(sanitizeErrorMessage(error, "Failed to update email"));
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => navigate("/settings/security");

  if (isMobile) {
    return (
      <ProfileGlassShell
        title="Email"
        subtitle="Update the email linked to your account. We'll send a confirmation link to both addresses before the change takes effect."
        onBack={goBack}
      >
        <GlassSection title="Current">
          <GlassCard>
            <GlassRow
              icon={<img loading="lazy" decoding="async" src={IOS26_ICONS.privacy} alt="" />}
              label="Signed in as"
              hint={currentEmail || "—"}
              trailing={null}
            />
          </GlassCard>
        </GlassSection>

        <GlassSection title="New email">
          <GlassCard>
            <div className="ng-card-pad">
              <GlassField
                label="New address"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleChangeEmail()}
                placeholder="your-new@email.com"
                hint="We'll send a confirmation link to both addresses."
              />
            </div>
          </GlassCard>
        </GlassSection>

        <div className="ng-actions">
          <GlassSecondaryButton onClick={goBack}>Cancel</GlassSecondaryButton>
          <GlassPrimaryButton
            onClick={handleChangeEmail}
            disabled={loading || !newEmail}
          >
            {loading ? "Sending…" : "Update email"}
          </GlassPrimaryButton>
        </div>
      </ProfileGlassShell>
    );
  }

  return (
    <SubShell
      title="Change Email"
      subtitle="Update the email address linked to your account. We'll send a confirmation link to both addresses before the change takes effect."
      backTo="/settings/security"
    >
      <SubSection title="Current email" description="The address currently linked to your Megsy account.">
        <SubCard>
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
            Signed in as
          </p>
          <p className="mt-1.5 text-[15px] font-medium text-foreground truncate">
            {currentEmail || "—"}
          </p>
        </SubCard>
      </SubSection>

      <SubSection title="New email" description="Enter the new email address. You'll need to confirm from both inboxes to complete the change.">
        <SubCard>
          <label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
            New email address
          </label>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleChangeEmail()}
            placeholder="your-new@email.com"
            className="mt-2 w-full px-3.5 py-2.5 rounded-lg bg-background/60 border border-border/70 text-[14px] text-foreground outline-none focus:border-foreground/40 transition-colors"
          />
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              onClick={goBack}
              className="px-4 py-2 rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleChangeEmail}
              disabled={loading || !newEmail}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40 transition-colors"
            >
              {loading ? "Sending…" : "Update email"}
            </button>
          </div>
        </SubCard>
      </SubSection>
    </SubShell>
  );
};

export default ChangeEmailPage;
