/** @doc Security — email, password, 2FA, session and account deletion. */
import { useEffect, useState } from "react";
import {
  MailCheck,
  ShieldEllipsis,
  KeyRound,
  UserRoundX,
  LogOut,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  SubShell,
  SubSection,
  SubRowList,
  SubRow,
  DangerCallout,
} from "@/components/settings/SubShell";
import ProfileGlassShell, {
  GlassSection,
  GlassCard,
  GlassRow,
} from "@/components/profile/ProfileGlassShell";
import { IOS26_ICONS } from "@/assets/ios26-icons";

const SecuritySettingsPage = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [userEmail, setUserEmail] = useState("");
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      setUserEmail(user.email || "");
      try {
        const { data: f } = await supabase.auth.mfa.listFactors();
        if (!cancelled) {
          const verified = (f?.totp || []).some((x: any) => x.status === "verified");
          setTwoFactorEnabled(verified);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const goBack = () => navigate("/settings");

  if (isMobile) {
    return (
      <ProfileGlassShell
        title="Security"
        subtitle="Manage sign-in credentials, two-factor auth and your session."
        onBack={goBack}
      >
        <GlassSection title="Sign-in" index="01">
          <GlassCard>
            <GlassRow
              icon={<img loading="lazy" decoding="async" src={IOS26_ICONS.privacy} alt="" />}
              label="Email"
              hint={userEmail || "Update primary email"}
              onClick={() => navigate("/settings/change-email")}
            />
            <GlassRow
              icon={<KeyRound className="w-[18px] h-[18px]" />}
              label="Password"
              hint="Rotate your account password"
              onClick={() => navigate("/settings/change-password")}
            />
            <GlassRow
              icon={<ShieldEllipsis className="w-[18px] h-[18px]" />}
              label="Two-factor auth"
              trailing={twoFactorEnabled ? "On" : "Off"}
              onClick={() => navigate("/settings/two-factor")}
            />
          </GlassCard>
        </GlassSection>

        <GlassSection title="Session" index="02">
          <GlassCard>
            <GlassRow
              icon={<img loading="lazy" decoding="async" src={IOS26_ICONS.logout} alt="" />}
              label="Sign out"
              danger
              onClick={handleLogout}
            />
            <GlassRow
              icon={<UserRoundX className="w-[18px] h-[18px]" />}
              label="Delete account"
              hint="Permanent — 30-day recovery"
              danger
              onClick={() => navigate("/settings/delete-account")}
            />
          </GlassCard>
        </GlassSection>
      </ProfileGlassShell>
    );
  }

  return (
    <SubShell
      title="Security"
      subtitle="Manage sign-in credentials, two-factor authentication and your session."
    >
      <SubSection title="Sign-in" description="Update your email, password and multi-factor settings.">
        <SubRowList>
          <SubRow
            icon={MailCheck}
            label="Change email"
            hint={userEmail || "Update primary email"}
            onClick={() => navigate("/settings/change-email")}
          />
          <SubRow
            icon={ShieldEllipsis}
            label="Change password"
            hint="Update your account password"
            onClick={() => navigate("/settings/change-password")}
          />
          <SubRow
            icon={KeyRound}
            label="Two-factor authentication"
            hint={twoFactorEnabled ? "Enabled — OTP required at sign-in" : "Disabled — tap to set up"}
            onClick={() => navigate("/settings/two-factor")}
            trailing={
              <span
                className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                  twoFactorEnabled
                    ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/[0.08]"
                    : "text-muted-foreground border-border"
                }`}
              >
                {twoFactorEnabled ? "On" : "Off"}
              </span>
            }
          />
        </SubRowList>
      </SubSection>

      <SubSection title="Session" description="Sign out of Megsy on this device.">
        <SubRowList>
          <SubRow icon={LogOut} label="Sign out" onClick={handleLogout} />
        </SubRowList>
      </SubSection>

      <SubSection title="Danger zone" description="Permanent actions. These cannot be undone.">
        <DangerCallout
          title="Delete account"
          description="All workspaces, chats and data are wiped. You have 30 days to cancel."
          action={
            <button
              onClick={() => navigate("/settings/delete-account")}
              className="h-9 px-4 text-[13px] font-medium rounded-full border border-rose-500/40 text-rose-300 hover:bg-rose-500/[0.08] transition"
            >
              <span className="inline-flex items-center gap-1.5">
                <UserRoundX className="w-3.5 h-3.5" />
                Delete
              </span>
            </button>
          }
        />
      </SubSection>
    </SubShell>
  );
};

export default SecuritySettingsPage;
