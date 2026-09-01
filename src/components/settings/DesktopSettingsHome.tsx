import { useEffect, useState, type FC, type SVGProps } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Sparkles, Globe, Brain, Info, Mail, KeyRound, Monitor } from "lucide-react";
import { getStoredTheme, setTheme, type ThemeMode } from "@/lib/theme";
import { Moon as MoonIcon, Sun as SunIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/components/common/ConfirmDialog";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { translateExactText, useUserLang, AVAILABLE_LANGS } from "@/lib/authI18n";
import OliveAvatar from "@/components/branding/OliveAvatar";
import MegsyStar from "@/components/branding/MegsyStar";
import {
  AccountIcon,
  BillingIcon,
  AppearanceIcon,
  IntegrationsIcon,
  SupportIcon,
  PrivacyIcon,
  StatusIcon,
  LogoutIcon,
} from "@/components/settings/SettingsIcons";

type Row = {
  icon: FC<SVGProps<SVGSVGElement>>;
  label: string;
  path?: string;
  onClick?: () => void;
  trailing?: string;
};
type Group = { title: string; rows: Row[] };

export function DesktopSettingsHome() {
  const lang = useUserLang();
  const tx = (text: string) => translateExactText(text, lang);
  const navigate = useNavigate();
  const go = (path: string) => navigate(path);
  const account = useActiveAccount();
  const avatarUrl = account.avatarUrl;
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredTheme());
  const [userEmail, setUserEmail] = useState("");
  const [plan, setPlan] = useState("free");
  const userName = account.name || userEmail.split("@")[0] || tx("User");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      setUserEmail(user.email || "");
      const { data: profile } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", user.id)
        .single();
      if (profile && !cancelled) setPlan(profile.plan || "free");
    })();
    return () => { cancelled = true; };
  }, [account.kind]);

  const isFree = plan === "free";

  const currentLangLabel =
    AVAILABLE_LANGS.find((l) => l.code === lang)?.native ?? "English";

  const confirm = useConfirm();

  const handleLogout = async () => {
    const ok = await confirm({
      title: "Log out",
      description: "You'll need to sign in again to access your chats.",
      confirmLabel: "Log out",
    });
    if (!ok) return;
    await supabase.auth.signOut();
    go("/auth");
  };

  const groups: Group[] = [
    {
      title: tx("Account"),
      rows: [
        { icon: AccountIcon, label: tx("Profile"), path: "/settings/profile" },
        { icon: BillingIcon, label: tx("Plan & billing"), path: "/settings/billing" },
      ],
    },
    {
      title: tx("Preferences"),
      rows: [
        { icon: AppearanceIcon, label: tx("Composer"), path: "/settings/customization" },
        { icon: (p) => <Mail {...p} />, label: tx("Mail"), path: "/settings/mail" },
        { icon: (p) => <KeyRound {...p} />, label: "الباسوردات", path: "/settings/passwords" },
        { icon: (p) => <Brain {...p} />, label: tx("Memory"), path: "/settings/memory" },
        { icon: IntegrationsIcon, label: tx("Integrations"), path: "/chat?integrations=1" },
        { icon: IntegrationsIcon, label: tx("MCP Servers"), path: "/settings/mcp" },
        { icon: (p) => <Monitor {...p} />, label: tx("My computer"), path: "/settings/desktop-bridge" },
        {
          icon: (p) => <Globe {...p} />,
          label: tx("Language"),
          path: "/settings/language",
          trailing: currentLangLabel,
        },
      ],
    },
    {
      title: tx("More"),
      rows: [
        { icon: SupportIcon, label: tx("Help & Support"), path: "/settings/support" },
        { icon: PrivacyIcon, label: tx("Privacy & Data"), path: "/settings/privacy" },
        { icon: StatusIcon, label: tx("System status"), path: "/settings/system-status" },
        {
          icon: (p) => (themeMode === "dark" ? <MoonIcon {...p} /> : <SunIcon {...p} />),
          label: tx("Appearance"),
          trailing: themeMode === "dark" ? tx("Dark") : themeMode === "system" ? tx("System") : tx("Light"),
          onClick: () => {
            const next: ThemeMode = themeMode === "light" ? "dark" : themeMode === "dark" ? "system" : "light";
            setThemeMode(next);
            setTheme(next);
          },
        },
        { icon: (p) => <Info {...p} />, label: tx("About us"), onClick: () => window.open("https://about.megsyai.com", "_blank", "noopener") },
      ],
    },
  ];

  return (
    <div className="relative z-10 mx-auto w-full max-w-xl space-y-8 pb-16">
      <style>{desktopRowCss}</style>
      {/* Profile block — centered, mobile-inspired */}
      <section className="flex flex-col items-center pt-4">
        <div className="h-[104px] w-[104px] rounded-full overflow-hidden ring-2 ring-foreground/20 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.7)]">
          {avatarUrl ? (
            <img loading="lazy" decoding="async" src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <OliveAvatar seed={userEmail || userName} className="h-full w-full" />
          )}
        </div>
        <p className="mt-4 text-[22px] font-semibold tracking-tight text-foreground">{userName}</p>
        <p className="mt-1 text-[13.5px] text-foreground/60">{userEmail || "—"}</p>
      </section>

      {/* Upgrade CTA */}
      {isFree && (
        <button
          onClick={() => go("/settings/billing")}
          className="group relative w-full rounded-2xl px-5 py-4 flex items-center gap-3.5 text-left text-foreground overflow-hidden border border-foreground/12 shadow-[0_18px_50px_-18px_rgba(99,102,241,0.7)] transition-transform hover:-translate-y-0.5"
          style={{
            background:
              "linear-gradient(135deg, rgba(139,92,246,0.95) 0%, rgba(99,102,241,0.95) 55%, rgba(59,130,246,0.95) 100%)",
          }}
        >
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-foreground/15 border border-foreground/25 backdrop-blur">
            <MegsyStar className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[15.5px] font-semibold leading-tight">{tx("Upgrade to Premium")}</p>
            <p className="mt-0.5 text-[12.5px] text-foreground/85 leading-snug">
              {tx("Higher credits, priority models and early features.")}
            </p>
          </div>
          <Sparkles className="h-4 w-4 text-foreground/85 shrink-0" />
        </button>
      )}

      {/* Grouped rows */}
      <div className="space-y-6">
        {groups.map((group) => (
          <section key={group.title}>
            <h2 className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/55">
              {group.title}
            </h2>
            <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
              {group.rows.map((row) => {
                const Icon = row.icon;
                return (
                  <button
                    key={row.label}
                    onClick={() => (row.onClick ? row.onClick() : row.path && go(row.path))}
                    className="ds-row w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-muted/60 active:bg-muted transition-colors"
                  >

                    <Icon className="w-[18px] h-[18px] text-foreground/75 shrink-0" />
                    <span className="flex-1 text-[14.5px] font-medium text-foreground">{row.label}</span>
                    {row.trailing && (
                      <span className="text-[12.5px] text-foreground/55 shrink-0">{row.trailing}</span>
                    )}
                    <ChevronRight className="w-4 h-4 text-foreground/65 shrink-0" />
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        {/* Logout group */}
        <section>
          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-muted/60 active:bg-muted transition-colors"
      aria-label="Logout"
    >
              <LogoutIcon className="w-[18px] h-[18px] text-destructive shrink-0" />
              <span className="flex-1 text-[14.5px] font-medium text-destructive">{tx("Sign out")}</span>

            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

const desktopRowCss = `
  .ds-row {
    position: relative;
  }
  .ds-row + .ds-row::before {
    content: "";
    position: absolute;
    top: 0;
    left: 50px;
    right: 20px;
    height: 1px;
    background: hsl(var(--foreground) / 0.055);
  }
`;


export default DesktopSettingsHome;
