/** @doc Permanently delete the account and all associated data. */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, UserRoundX } from "lucide-react";
import { t as authT, translateAuthError } from "@/lib/authI18n";
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


const DeleteAccountPage = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (confirmText !== "DELETE") return toast.error(authT("typeDelete"));
    if (!password.trim()) return toast.error(authT("enterPasswordConfirm"));
    setIsDeleting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("User not found");
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email, password,
      });
      if (signInError) {
        toast.error(authT("incorrectPassword"));
        setIsDeleting(false);
        return;
      }
      toast.success(authT("accountDeletionRequested"));
      await supabase.auth.signOut();
      navigate("/auth");
    } catch (error: any) {
      toast.error(translateAuthError(error, "deleteAccountFailed"));
    } finally {
      setIsDeleting(false);
    }
  };

  const deletedItems = [
    { label: "Profile Information", hint: "Name, avatar, contact details" },
    { label: "All Conversations", hint: "Chats, messages, threads" },
    { label: "Generated Images & Videos", hint: "Every asset you created" },
    { label: "MC & Subscription", hint: "Credits and active plans" },
  ];

  const goBack = () => navigate("/settings/security");

  if (isMobile) {
    return (
      <ProfileGlassShell
        title="Delete account"
        subtitle="Permanently remove your Megsy account and all associated data. This action cannot be undone."
        onBack={goBack}
      >
        <GlassSection title="Warning">
          <GlassCard>
            <GlassRow
              icon={<AlertTriangle className="w-[18px] h-[18px]" />}
              label="Permanent action"
              hint="Once deleted, your data cannot be recovered."
              danger
              trailing={null}
            />
          </GlassCard>
        </GlassSection>

        <GlassSection title="What gets deleted">
          <GlassCard>
            {deletedItems.map((item) => (
              <GlassRow
                key={item.label}
                icon={<UserRoundX className="w-[18px] h-[18px]" />}
                label={item.label}
                hint={item.hint}
                danger
                trailing={null}
              />
            ))}
          </GlassCard>
        </GlassSection>

        <GlassSection title="Confirm deletion">
          <GlassCard>
            <div className="ng-card-pad">
              <GlassField
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
              />
              <GlassField
                label="Type DELETE to confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleDeleteAccount()}
                placeholder="DELETE"
                hint="Capital letters required."
              />
            </div>
          </GlassCard>
        </GlassSection>

        <div className="ng-actions">
          <GlassSecondaryButton onClick={goBack}>Cancel</GlassSecondaryButton>
          <GlassPrimaryButton
            onClick={handleDeleteAccount}
            disabled={isDeleting || confirmText !== "DELETE"}
            style={{ background: "linear-gradient(135deg,#f43f5e,#e11d48)", color: "#fff" }}
          >
            {isDeleting ? "Deleting…" : "Delete account"}
          </GlassPrimaryButton>
        </div>
      </ProfileGlassShell>
    );
  }


  return (
    <SubShell
      title="Delete Account"
      subtitle="Permanently remove your Megsy account and all associated data. This action cannot be undone."
      backTo="/settings/security"
    >
      <SubSection title="What gets deleted" description="Everything tied to your account will be removed from Megsy's servers.">
        <SubCard>
          <ul className="space-y-2.5">
            {deletedItems.map((item) => (
              <li key={item.label} className="flex items-center gap-3 text-[14px] text-foreground">
                <span className="w-1 h-1 rounded-full bg-rose-400/70" />
                {item.label}
              </li>
            ))}
          </ul>
        </SubCard>
      </SubSection>

      <SubSection title="Confirm deletion" description="Enter your password and type DELETE in capital letters to confirm.">
        <SubCard>
          <div className="rounded-lg border border-rose-500/25 bg-rose-500/[0.04] px-4 py-3 flex items-start gap-3 mb-5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" strokeWidth={2} />
            <p className="text-[12.5px] text-rose-200/90 leading-relaxed">
              This action is permanent. Once deleted, your data cannot be recovered.
            </p>
          </div>

          <label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            className="mt-2 w-full px-3.5 py-2.5 rounded-lg bg-background/60 border border-border/70 text-[14px] text-foreground outline-none focus:border-foreground/40 transition-colors"
          />

          <label className="mt-4 block text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
            Type <span className="text-rose-400 font-semibold">DELETE</span> to confirm
          </label>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleDeleteAccount()}
            placeholder="DELETE"
            className="mt-2 w-full px-3.5 py-2.5 rounded-lg bg-background/60 border border-border/70 text-[14px] text-foreground outline-none tracking-[0.2em] uppercase focus:border-foreground/40 transition-colors"
          />

          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              onClick={goBack}
              className="px-4 py-2 rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteAccount}
              disabled={isDeleting || confirmText !== "DELETE"}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-rose-500 text-foreground hover:bg-rose-500/90 disabled:opacity-40 transition-colors"
            >
              {isDeleting ? "Deleting…" : "Delete my account"}
            </button>
          </div>
        </SubCard>
      </SubSection>
    </SubShell>
  );
};

export default DeleteAccountPage;
