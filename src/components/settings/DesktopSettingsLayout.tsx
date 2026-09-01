import { ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ArrowLeft, PanelLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/components/common/ConfirmDialog";
import AppLayout from "@/layouts/AppLayout";
import { useSettingsShell } from "@/components/settings/SettingsShell";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";
import { translateExactText, useUserLang } from "@/lib/authI18n";
import AppSidebar from "@/components/layout/AppSidebar";
import {
  AccountIcon,
  WorkspacesIcon,
  BillingIcon,
  ThemeIcon,
  IntegrationsIcon,
  MemoryIcon,
  SkillsIcon,
  NotificationsIcon,
  SupportIcon,
  PrivacyIcon,
  SignOutIcon,
  AiPersonalizationIcon,
} from "@/components/settings/SettingsIcons";

type NavItem = {
  id: string;
  label: string;
  path: string;
  Icon: React.ComponentType<{ className?: string }>;
  badge?: "NEW" | "SOON";
};
type NavGroup = { title: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Account",
    items: [
      { id: "overview", label: "Overview", path: "/settings", Icon: AccountIcon },
      { id: "profile", label: "Profile", path: "/settings/profile", Icon: AccountIcon },
      { id: "billing", label: "Plan & Billing", path: "/settings/billing", Icon: BillingIcon },
    ],
  },
  {
    title: "Workspace",
    items: [
      { id: "integrations", label: "Integrations", path: "/chat?integrations=1", Icon: IntegrationsIcon },
      { id: "mcp", label: "MCP Servers", path: "/settings/mcp", Icon: IntegrationsIcon },
    ],
  },
  {
    title: "System",
    items: [
      { id: "customization", label: "Composer", path: "/settings/customization", Icon: ThemeIcon },
      { id: "notifications", label: "Notifications", path: "/settings/notifications", Icon: NotificationsIcon },
      { id: "privacy", label: "Privacy & Data", path: "/settings/privacy", Icon: PrivacyIcon },
    ],
  },
  {
    title: "Support",
    items: [{ id: "support", label: "Help Center", path: "/settings/support", Icon: SupportIcon }],
  },
];

interface DesktopSettingsLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
}

export function DesktopSettingsLayout({
  children,
  title,
  subtitle,
  action,
}: DesktopSettingsLayoutProps) {
  const lang = useUserLang();
  const tx = (text: string) => translateExactText(text, lang);
  const navigate = useNavigate();
  const location = useLocation();
  const shell = useSettingsShell();
  const [collapsed, setCollapsed, toggleCollapsed] = useSidebarCollapsed();
  const go = (path: string) => navigate(path);

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

  const isActive = (path: string) => {
    const currentPath = location.pathname;
    if (path === "/settings") return currentPath === "/settings";
    return currentPath === path || currentPath.startsWith(path + "/");
  };

  const isSettingsHome = location.pathname === "/settings";


  // When mounted inside the persistent SettingsShell, portal just the inner
  // content (header + body) into the shell's main area so the sidebar/chrome
  // never unmounts between sub-pages.
  if (shell.active && shell.mainEl) {
    return createPortal(
      <>
        <div className="mx-auto max-w-6xl px-10 py-10 xl:px-12">
          <div className="settings-desktop-content pb-24 text-foreground">{children}</div>
        </div>
      </>,
      shell.mainEl,
    );
  }

  return (
    <AppLayout>
      <div
        data-settings-page
        data-settings-home={isSettingsHome ? "true" : undefined}
        className={cn(
          "settings-desktop-canvas relative h-full w-full overflow-hidden antialiased text-foreground",
          "bg-transparent"
        )}
      >
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
          <div className="absolute inset-0 settings-canvas-bg" />
        </div>

        <div className="relative z-10 h-full w-full flex">
          {isSettingsHome && (
            <aside
              data-app-sidebar="true"
              className="theme-fixed relative z-40 hidden md:flex shrink-0 overflow-hidden border-e border-transparent"
              style={{ width: 260, minWidth: 260, flexBasis: 260, backgroundColor: "transparent" }}
            >
              <AppSidebar
                inline
                open
                forceExpanded
                onClose={() => {}}
                onNewChat={() => go("/chat")}
                onSelectConversation={(id) => navigate(`/chat?c=${id}`)}
                activeConversationId={null}
                currentMode="chat"
              />
            </aside>
          )}

          {/* Main */}
          <div className="flex-1 overflow-y-auto bg-transparent">
            <div className="mx-auto max-w-6xl px-10 py-10 xl:px-12">
              <div className="settings-desktop-content pb-24 text-foreground">{children}</div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function SettingsHeader({
  title,
  subtitle,
  action,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  if (!title && !subtitle && !action) return null;
  return (
    <div className="border-b border-border/50 bg-card/25 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-10 py-8 xl:px-12 flex items-start justify-between gap-6">
        <div className="min-w-0">
          {title && (
            <h1 className="text-[30px] leading-tight font-semibold text-foreground">
              {title}
            </h1>
          )}
          {subtitle && (
            <p className="mt-2 text-[14px] text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}

export default DesktopSettingsLayout;
