/** @doc Mobile settings — manus-style dark grouped list (matches reference design). */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  Database,
  PanelBottom,
  Puzzle,
  Plug,
  Heart,
  UserRound,
  HelpCircle,
  Asterisk,
  Info,
  LogOut,
  Wallet,
  Gift,
  Moon,
  Sun,
  Languages,
  Mail as MailIcon,
} from "lucide-react";
import { KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/components/common/ConfirmDialog";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useCredits } from "@/hooks/useCredits";
import { t as authT, useUserLang, AVAILABLE_LANGS } from "@/lib/authI18n";
import { goBackOr } from "@/lib/navigation";
import { getStoredTheme, setTheme, type ThemeMode } from "@/lib/theme";

type Row = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  trailing?: string;
  path?: string;
  onClick?: () => void;
  external?: boolean;
  chevron?: "arrow" | "stepper" | "none";
  danger?: boolean;
};

const APP_VERSION = "v1.0.0";

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "U";

const ManusSettingsMobile = () => {
  const navigate = useNavigate();
  const account = useActiveAccount();
  const lang = useUserLang();
  const isAr = lang === "ar-eg";
  const { plan, credits } = useCredits();
  const [userEmail, setUserEmail] = useState("");
  const [logoutOpen, setLogoutOpen] = useState(false);

  const userName = account.name || userEmail.split("@")[0] || "User";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      setUserEmail(user.email || "");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const planLabel = (plan || "free").toLowerCase() === "free" ? "Free" : (plan || "").toUpperCase();

  const confirm = useConfirm();

  const handleLogout = async () => {
    const ok = await confirm({
      title: "Log out",
      description: "You'll need to sign in again to access your chats.",
      confirmLabel: "Log out",
    });
    if (!ok) return;
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredTheme());

  const mainRows: Row[] = [
    { icon: MailIcon, label: "Mail", trailing: "@megsyai.com", path: "/settings/mail" },
    { icon: KeyRound, label: "الباسوردات", path: "/settings/passwords" },
    { icon: Lightbulb, label: "Knowledge", path: "/settings/memory" },
    { icon: Bell, label: "Notifications", path: "/notifications" },
    { icon: Database, label: "Data controls", path: "/settings/data" },
    { icon: PanelBottom, label: "Cloud browser", path: "/settings/cloud-browser" },
    { icon: Puzzle, label: "Skills", path: "/settings/skills" },
    { icon: Plug, label: "Integrations", path: "/chat?integrations=1" },
  ];

  const advancedRows: Row[] = [
    { icon: Gift, label: "Referrals", path: "/settings/referrals" },
  ];

  const accountRows: Row[] = [
    { icon: UserRound, label: "Account", path: "/settings/profile/edit" },
  ];

  const langLabel = AVAILABLE_LANGS.find((l) => l.code === lang)?.native ?? "English";

  const appearanceRows: Row[] = [
    {
      icon: themeMode === "dark" ? Moon : Sun,
      label: "Appearance",
      trailing: themeMode === "dark" ? "Dark" : themeMode === "system" ? "System" : "Light",
      chevron: "none",
      onClick: () => {
        const next: ThemeMode = themeMode === "light" ? "dark" : themeMode === "dark" ? "system" : "light";
        setThemeMode(next);
        setTheme(next);
      },
    },
    { icon: Languages, label: "Language", trailing: langLabel, path: "/settings/language" },
  ];


  const linkRows: Row[] = [
    { icon: Heart, label: "Rate this app", external: true, onClick: () => window.open("https://www.trustpilot.com/review/megsyai.com", "_blank", "noopener") },
    { icon: HelpCircle, label: "Get help", external: true, onClick: () => window.open("https://help.megsyai.com", "_blank", "noopener") },
    { icon: Info, label: "About us", external: true, onClick: () => window.open("https://about.megsyai.com", "_blank", "noopener") },
    { icon: Asterisk, label: "Version", trailing: APP_VERSION, chevron: "none" },
  ];



  const renderRow = (row: Row, idx: number) => {
    const Icon = row.icon;
    const Chevron = isAr ? ChevronLeft : ChevronRight;
    return (
      <button
        key={row.label}
        type="button"
        onClick={() => (row.onClick ? row.onClick() : row.path && navigate(row.path))}
        disabled={!row.onClick && !row.path}
        className={`ms-row${idx > 0 ? " ms-row-div" : ""}${row.danger ? " ms-row-danger" : ""}`}
      >
        <Icon className="ms-row-icon" />
        <span className="ms-row-label">{row.label}</span>
        {row.trailing && <span className="ms-row-trailing">{row.trailing}</span>}
        {row.chevron === "none" ? null : row.external ? (
          <span className="ms-row-chev ms-row-ext">↗</span>
        ) : (
          <Chevron className="ms-row-chev" />
        )}
      </button>
    );
  };

  return (
    <div className="ms-root" dir={"ltr"}>
      <style>{manusCss}</style>
      <div className="ms-screen">
        <header className="ms-header">
          <h1 className="ms-brand">megsy</h1>
          <button type="button" className="ms-hbtn" aria-label={authT("back")} onClick={() => goBackOr(navigate, "/chat")}>
            {isAr ? <ChevronLeft className="ms-hicon" /> : <ChevronRight className="ms-hicon" />}
          </button>
        </header>

        <main className="ms-body">
          {/* Profile */}
          <button type="button" className="ms-card ms-profile" onClick={() => navigate("/settings/profile/edit")}>
            {account.avatarUrl ? (
              <img src={account.avatarUrl} alt="" className="ms-avatar" loading="lazy" decoding="async" />
            ) : (
              <span className="ms-avatar ms-avatar-fallback">{initialsOf(userName)}</span>
            )}
            <span className="ms-profile-text">
              <span className="ms-profile-name">{userName}</span>
              <span className="ms-profile-sub">{"Personal"}</span>
            </span>
          </button>

          {/* Plan */}
          <section className="ms-card">
            <div className="ms-plan-row">
              <span className="ms-plan-name">{planLabel}</span>
              <button type="button" className="ms-plan-cta" onClick={() => navigate("/pricing")}>
                {"Upgrade"}
              </button>
            </div>
            <button type="button" className="ms-row ms-row-div" onClick={() => navigate("/usage")}>
              <Wallet className="ms-row-icon" />
              <span className="ms-row-label">{"Credits"}</span>
              <span className="ms-row-trailing">{credits ?? 0}</span>
              {isAr ? <ChevronLeft className="ms-row-chev" /> : <ChevronRight className="ms-row-chev" />}
            </button>
          </section>

          <section className="ms-card">{mainRows.map(renderRow)}</section>
          <section className="ms-card">{advancedRows.map(renderRow)}</section>

          <section className="ms-card">{accountRows.map(renderRow)}</section>
          <section className="ms-card">{appearanceRows.map(renderRow)}</section>
          <section className="ms-card">{linkRows.map(renderRow)}</section>


          <section className="ms-card">
            <button type="button" className="ms-row" onClick={() => setLogoutOpen(true)}>
              <LogOut className="ms-row-icon" />
              <span className="ms-row-label">{"Log out"}</span>
            </button>
          </section>

          <div className="ms-spacer" />
        </main>

        {logoutOpen && (
          <div className="ms-confirm-scrim" role="presentation" onClick={() => setLogoutOpen(false)}>
            <div
              className="ms-confirm"
              role="dialog"
              aria-modal="true"
              aria-label="Log out"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="ms-confirm-title">Log out?</h3>
              <p className="ms-confirm-body">You'll need to sign in again to use Megsy.</p>
              <div className="ms-confirm-actions">
                <button type="button" className="ms-confirm-btn" onClick={() => setLogoutOpen(false)}>
                  Cancel
                </button>
                <button type="button" className="ms-confirm-btn ms-confirm-btn-primary" onClick={handleLogout}>
                  Log out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const manusCss = `
.ms-root {
  min-height: 100dvh;
  background: var(--mn-bg);
  color: var(--mn-fg);
  display: flex;
  justify-content: center;
  font-family: -apple-system, "SF Pro Display", Inter, "Segoe UI", Roboto, sans-serif;
}
.ms-screen { width: 100%; max-width: 420px; }
.ms-header {
  position: sticky; top: 0; z-index: 5;
  display: grid; grid-template-columns: 44px 1fr 44px; align-items: center;
  padding: calc(env(safe-area-inset-top, 0px) + 8px) 10px 8px;
  background: var(--mn-bg);
}
.ms-hbtn {
  grid-column: 3;
  position: relative; width: 44px; height: 44px; margin: -5px;
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; border: 0; color: var(--mn-fg); cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.ms-hbtn:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; border-radius: 12px; }
.ms-hicon { width: 20px; height: 20px; }
.ms-brand {
  grid-column: 2; text-align: center;
  margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.01em;
  font-family: "Times New Roman", Georgia, serif;
}
.ms-body { padding: 4px 12px 0; display: flex; flex-direction: column; gap: 16px; }
.ms-card {
  width: 100%;
  background: var(--mn-card);
  border-radius: 14px;
  overflow: hidden;
  border: 0;
}
button.ms-card { cursor: pointer; }
.ms-profile {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 14px; text-align: start; color: inherit;
}
.ms-avatar {
  width: 44px; height: 44px; border-radius: 999px; object-fit: cover; flex-shrink: 0;
}
.ms-avatar-fallback {
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--mn-avatar); color: #fff; font-size: 17px; font-weight: 600;
}
.ms-profile-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.ms-profile-name { font-size: 16px; font-weight: 600; }
.ms-profile-sub { font-size: 12px; color: var(--mn-muted); }
.ms-plan-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 13px 14px;
}
.ms-plan-name { font-size: 18px; font-weight: 700; font-family: "Times New Roman", Georgia, serif; }
.ms-plan-cta {
  background: var(--mn-cta-bg); color: var(--mn-cta-fg); border: 0; cursor: pointer;
  border-radius: 9px; padding: 7px 13px; font-size: 12.5px; font-weight: 600;
}
.ms-row {
  width: 100%;
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px;
  background: transparent; border: 0; color: var(--mn-fg);
  text-align: start; font: inherit; cursor: pointer;
  transition: background-color 160ms ease;
}
.ms-row:disabled { cursor: default; }
.ms-row:active:not(:disabled) { background: var(--mn-sep); }
.ms-row-div {
  position: relative;
}
.ms-row-div::before {
  content: "";
  position: absolute;
  top: 0;
  left: 44px;
  right: 14px;
  height: 1px;
  background: rgba(255, 255, 255, 0.055);
}
.ms-row-icon { width: 18px; height: 18px; flex-shrink: 0; color: var(--mn-fg); opacity: 0.95; }
.ms-row-label { flex: 1; font-size: 14px; font-weight: 500; }
.ms-row-trailing { font-size: 13px; color: var(--mn-muted); flex-shrink: 0; }
.ms-row-chev { width: 15px; height: 15px; flex-shrink: 0; color: hsl(var(--muted-foreground)); }
.ms-row-ext { font-size: 13px; line-height: 1; }
.ms-spacer { height: calc(env(safe-area-inset-bottom, 0px) + 28px); }
.ms-menu-scrim {
  position: fixed; inset: 0; z-index: 60;
  display: flex; align-items: flex-end; justify-content: center;
  padding: 0 12px calc(env(safe-area-inset-bottom, 0px) + 16px);
  background: rgba(0, 0, 0, 0.35);
  animation: ms-fade 140ms ease;
}
.ms-menu {
  width: 100%; max-width: 396px;
  background: var(--mn-card-2);
  border-radius: 14px; overflow: hidden;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
  animation: ms-rise 180ms cubic-bezier(0.22, 1, 0.36, 1);
}
.ms-menu-item {
  width: 100%; display: flex; align-items: center; gap: 12px;
  padding: 14px 16px; background: transparent; border: 0;
  color: var(--mn-fg); font: inherit; font-size: 14px; text-align: start; cursor: pointer;
}
.ms-menu-item + .ms-menu-item { box-shadow: inset 0 1px 0 var(--mn-sep); }
.ms-menu-item:active { background: var(--mn-press); }
.ms-menu-icon { width: 18px; height: 18px; flex-shrink: 0; opacity: 0.9; }
.ms-menu-label { flex: 1; }
.ms-menu-check { width: 16px; height: 16px; flex-shrink: 0; }
@keyframes ms-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes ms-rise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }

`;

export default ManusSettingsMobile;
