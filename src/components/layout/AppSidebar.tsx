import EmptyState from "@/components/common/EmptyState";
import { memo, startTransition, useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useLocation, type NavigateOptions } from "react-router-dom";
import { Plus, PanelLeft, LogIn, Cloud, Sparkles, Settings, ChevronDown, Mail as MailIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getUserSafe } from "@/lib/authSafe";
import { getOwnProfile } from "@/lib/ownProfile";

import { AnimatePresence, m as motion } from "framer-motion";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";
import MegsyStar from "@/components/files/MegsyStar";
import { BrandLogo, BrandWord } from "@/components/brand/BrandLogo";

import { CornIcon, EarnIcon, HomeIcon } from "@/components/sidebar/SidebarIcons";
import { useActiveWorkspaceId, WORKSPACE_CHANGED_EVENT } from "@/lib/activeWorkspace";
import WorkspaceSwitcher from "@/components/workspace/WorkspaceSwitcher";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import SidebarSubNav from "@/components/layout/SidebarSubNav";
import { pathForZone, stripZonePrefix } from "@/lib/zoneRouting";
import { prefetchRoute as sharedPrefetchRoute } from "@/hooks/usePrefetchRoute";
import { t as uiT, useUserLang } from "@/lib/authI18n";
import { useSidebarPins } from "@/lib/sidebarPins";
import megsyCardImg from "@/assets/megsy-models-card.webp.asset.json";

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
  mode: string;
  is_pinned?: boolean;
}

interface AppSidebarProps {
  open: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onSelectConversation?: (id: string) => void;
  activeConversationId?: string | null;
  currentMode?: string;
  inline?: boolean;
  forceExpanded?: boolean;
  /**
   * Render the mobile sidebar as an always-mounted "underlay" panel that sits
   * beneath the chat surface (Claude-style push reveal). The parent is
   * responsible for translating the chat surface to reveal it.
   */
  underlay?: boolean;
  mobileSide?: "left" | "right";
}

const wsTag = (ws: string | null) => ws ?? "personal";
const cacheKey = (mode: string, uid: string, ws: string | null) =>
  `sidebar:convos:${mode}:${uid}:${wsTag(ws)}`;
const userCacheKey = (uid: string) => `sidebar:user:${uid}`;
const lastUserKey = "sidebar:last-user";
// Route prefetch is now centralized in usePrefetchRoute — the sidebar shares
// the same in-memory cache with the landing navbar so a hover in one place
// benefits the other. Zone-prefixed paths get normalized before lookup.
const prefetchRoute = (path: string) =>
  sharedPrefetchRoute(stripZonePrefix(path.split(/[?#]/)[0]));

const sectionAccentFor = (pathname: string, mode: string): { name: string; hsl: string } => {
  if (pathname.startsWith("/media") || pathname.startsWith("/images") || mode === "images")
    return { name: "images", hsl: "338 100% 71%" };
  if (pathname.startsWith("/videos") || pathname.startsWith("/cinema") || mode === "videos")
    return { name: "videos", hsl: "187 85% 53%" };
  if (
    pathname.startsWith("/megsy") ||
    pathname.startsWith("/agents") ||
    pathname.startsWith("/workspace") ||
    mode === "megsy-pr" ||
    mode === "build"
  )
    return { name: "os", hsl: "158 64% 52%" };
  return { name: "chat", hsl: "252 92% 67%" };
};

function groupByDate(items: Conversation[]) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 24 * 60 * 60 * 1000;
  const startOfYesterday = startOfToday - day;
  const startOf7Days = startOfToday - 6 * day;
  const startOf30Days = startOfToday - 29 * day;
  const buckets: Record<string, Conversation[]> = {
    Pinned: [],
    Today: [],
    Yesterday: [],
    "Last 7 Days": [],
    "Last 30 Days": [],
    Older: [],
  };
  const byUpdated = (a: Conversation, b: Conversation) =>
    new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  const pinned: Conversation[] = [];
  const others: Conversation[] = [];
  for (const c of items) {
    if (c.is_pinned) pinned.push(c);
    else others.push(c);
  }
  pinned.sort(byUpdated);
  others.sort(byUpdated);
  buckets.Pinned = pinned;
  for (const c of others) {
    const t = new Date(c.updated_at).getTime();
    if (t >= startOfToday) buckets.Today.push(c);
    else if (t >= startOfYesterday) buckets.Yesterday.push(c);
    else if (t >= startOf7Days) buckets["Last 7 Days"].push(c);
    else if (t >= startOf30Days) buckets["Last 30 Days"].push(c);
    else buckets.Older.push(c);
  }
  return buckets;
}

const AppSidebar = ({
  open,
  onClose,
  onNewChat,
  onSelectConversation,
  activeConversationId,
  currentMode = "chat",
  inline = false,
  forceExpanded = false,
  underlay = false,
  mobileSide,
}: AppSidebarProps) => {
  useUserLang();
  const navigate = useNavigate();
  const location = useLocation();
  const activeWs = useActiveWorkspaceId();

  // Hydrate user from cache instantly so the bottom pill never flashes.
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [userName, setUserName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [credits, setCredits] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // The nav list is always fully expanded — the old "More" toggle is gone.
  const [moreOpen, setMoreOpen] = useState(true);
  const [mobileScrolled, setMobileScrolled] = useState(false);

  // When the sidebar closes (mobile overlay OR underlay), collapse the
  // "More" section so reopening always starts in the compact state.
  // Without this, the underlay panel (always-mounted) keeps `moreOpen=true`
  // forever because its mobile UI hides the toggle once expanded.
  useEffect(() => {
    if (!open) setMoreOpen(true);
  }, [open]);

  const isBuildMode = currentMode === "build";
  const showRecent = ["chat", "learning", "shopping", "research", "slides", "videos", "images", "code"].includes(currentMode);
  const showsUnifiedChatHistory =
    currentMode === "chat" || currentMode === "research" || currentMode === "slides";
  // In the general (chat) sidebar, surface conversations from every service —
  // videos, images, code, learning, shopping — so users can find any past
  // session without switching workspaces.
  const showsAllServicesHistory = currentMode === "chat";

  // Hydrate from local cache (user info + conversations) before network.
  // SECURITY: never read credits / subscription / billing info from localStorage —
  // those are sensitive values that must always come from the server.
  useEffect(() => {
    let cancelled = false;

    const hydrateSafeCache = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const sessionUid = session?.user?.id;
        const lastUid = localStorage.getItem(lastUserKey);

        if (!sessionUid) {
          setConversations([]);
          setUserName("");
          setAvatarUrl(null);
          return;
        }

        if (lastUid && lastUid !== sessionUid) {
          localStorage.removeItem(userCacheKey(lastUid));
        }

        const raw = localStorage.getItem(userCacheKey(sessionUid));
        if (!cancelled && raw) {
          const u = JSON.parse(raw);
          if (u.userName) setUserName(u.userName);
          if (u.avatarUrl !== undefined) setAvatarUrl(u.avatarUrl);
        }

        const conv = localStorage.getItem(cacheKey(currentMode, sessionUid, activeWs));
        if (!cancelled && conv) {
          const arr = JSON.parse(conv);
          if (Array.isArray(arr)) setConversations(arr);
        }
      } catch {
        if (!cancelled) setConversations([]);
      }
    };

    void hydrateSafeCache();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!showRecent || !currentUserId) return;
    try {
      const raw = localStorage.getItem(cacheKey(currentMode, currentUserId, activeWs));
      if (raw) {
        const cached = JSON.parse(raw) as Conversation[];
        if (Array.isArray(cached)) setConversations(cached);
        else setConversations([]);
      } else {
        setConversations([]);
      }
    } catch {
      setConversations([]);
    }
  }, [currentUserId, currentMode, showRecent, activeWs]);

  useEffect(() => {
    loadUserInfo();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadUserInfo();
    });

    return () => {
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (showRecent) loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMode, currentUserId, activeWs]);

  useEffect(() => {
    const onFocus = () => {
      if (showRecent) loadConversations();
    };
    const onConversationsChanged = () => {
      if (showRecent) loadConversations();
    };
    const onWorkspaceChanged = () => {
      // Clear the visible list immediately so old workspace data does not flash.
      setConversations([]);
      if (showRecent) loadConversations();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("megsy:conversations-changed", onConversationsChanged);
    window.addEventListener(WORKSPACE_CHANGED_EVENT, onWorkspaceChanged);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("megsy:conversations-changed", onConversationsChanged);
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, onWorkspaceChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMode, showRecent, currentUserId]);

  const loadUserInfo = async () => {
    const user = await getUserSafe();
    if (!user) {

      setCurrentUserId(null);
      setUserName("");
      setAvatarUrl(null);
      setCredits(0);
      setConversations([]);
      try {
        localStorage.removeItem(lastUserKey);
      } catch {}
      return;
    }
    setCurrentUserId(user.id);
    const emailPrefix = user.email?.split("@")[0] || "User";
    const fallbackName =
      user.user_metadata?.display_name ||
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.user_metadata?.user_name ||
      emailPrefix;
    setUserName(fallbackName);
    const profile = await getOwnProfile(user.id);
    const next = { userName: fallbackName, avatarUrl: user.user_metadata?.avatar_url || null };
    let nextCredits = 0;
    if (profile) {
      nextCredits = Number(profile.credits) || 0;
      next.avatarUrl = profile.avatar_url || next.avatarUrl;
      if (profile.display_name) next.userName = profile.display_name;
      setCredits(nextCredits);
      setAvatarUrl(next.avatarUrl);
      setUserName(next.userName);
    }
    try {
      localStorage.setItem(lastUserKey, user.id);
      // SECURITY: do NOT persist credits in localStorage.
      localStorage.setItem(userCacheKey(user.id), JSON.stringify(next));
    } catch {}
  };

  const loadConversations = async () => {
    const user = await getUserSafe();
    if (!user) return;

    const validModes = ["code", "images", "videos", "learning", "shopping", "research", "slides"];
    const modeFilter = validModes.includes(currentMode) ? currentMode : "chat";
    const modesToFetch = showsAllServicesHistory
      ? ["chat", "research", "slides", "videos", "images", "code", "learning", "shopping"]
      : showsUnifiedChatHistory
        ? ["chat", "research", "slides"]
        : [modeFilter];

    const { data: memberRows } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", user.id);
    const memberConvIds = (memberRows || []).map((r: any) => r.conversation_id);

    let query = supabase
      .from("conversations")
      .select("id, title, updated_at, mode, is_pinned")
      .in("mode", modesToFetch);
    if (memberConvIds.length > 0) {
      query = query.or(`user_id.eq.${user.id},id.in.(${memberConvIds.join(",")})`);
    } else {
      query = query.eq("user_id", user.id);
    }
    // Filter by active workspace: a workspace shows only its conversations,
    // "personal" mode (no workspace) shows only conversations not tied to any workspace.
    if (activeWs) {
      query = query.eq("workspace_id", activeWs);
    } else {
      query = query.is("workspace_id", null);
    }
    const { data } = await query
      .order("is_pinned", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(50);
    if (data) {
      setConversations(data);
      try {
        localStorage.setItem(cacheKey(modeFilter, user.id, activeWs), JSON.stringify(data));
      } catch {}
    } else {
      setConversations([]);
    }
  };

  const account = useActiveAccount();
  const activeUserId = currentUserId || account.id;
  const displayName = (account.name || userName || "User").trim() || "User";
  const displayAvatar = account.avatarUrl ?? avatarUrl;
  const initial = displayName.charAt(0).toUpperCase() || "U";
  const [collapsed, setCollapsed, toggleCollapsed] = useSidebarCollapsed();
  const isCollapsed = inline && collapsed && !forceExpanded;
  const groups = useMemo(() => groupByDate(conversations), [conversations]);
  const flatConversations = useMemo(() => Object.values(groups).flat(), [groups]);
  const sectionAccent = useMemo(
    () => sectionAccentFor(stripZonePrefix(location.pathname), currentMode),
    [location.pathname, currentMode],
  );

  // Desktop inline: collapse the sidebar immediately after any selection.
  const closeInline = useCallback(() => {
    if (inline) setCollapsed(true);
  }, [inline, setCollapsed]);

  const navigateSmoothly = useCallback(
    (path: string, options?: NavigateOptions) => {
      const target = pathForZone(path, location.pathname);
      onClose();
      closeInline();
      void prefetchRoute(target);
      startTransition(() => navigate(target, options));
    },
    [closeInline, location.pathname, navigate, onClose],
  );

  const sidebarPins = useSidebarPins();
  const currentAppPath = stripZonePrefix(location.pathname);
  const resolvedMobileSide =
    mobileSide ??
    (typeof document !== "undefined" && document.documentElement.dir === "rtl" ? "right" : "left");
  const isMobileRightSide = resolvedMobileSide === "right";

  const primaryNav: Array<{
    label: string;
    Icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
    path: string;
    match: (p: string) => boolean;
  }> = [
    {
      label: uiT("sidebarHome"),
      Icon: HomeIcon,
      path: "/",
      match: (p: string) => p === "/" || p.startsWith("/chat"),
    },
  ];

  const moreNav: Array<{
    label: string;
    Icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
    path: string;
    match: (p: string) => boolean;
  }> = [
  ];

  // Mail only appears once the user pins it from the Mail page.
  if (sidebarPins.includes("mail")) {
    moreNav.push({
      label: "Mail",
      Icon: (props) => <MailIcon size={props.size} className={props.className} strokeWidth={props.strokeWidth} />,
      path: "/settings/mail",
      match: (p: string) => p.startsWith("/settings/mail"),
    });
  }

  // Earn is visible for everyone (site + Telegram). Tasks stays Telegram-only.
  moreNav.push({
    label: uiT("sidebarEarn"),
    Icon: EarnIcon,
    path: "/settings/referrals",
    match: (p: string) => p.startsWith("/settings/referrals") && !p.includes("tasks"),
  });

  const handleNewChat = () => {
    if (isBuildMode) navigateSmoothly("/build");
    else {
      onNewChat();
      onClose();
      closeInline();
    }
  };

  // Cartoon palette (mirrors ReferralsPage)
  const PAGE_BG = "var(--page-bg)";
  const SURFACE = "hsl(var(--surface-1))";
  const SURFACE_2 = "hsl(var(--surface-3))";
  const BORDER = "hsl(var(--surface-4))";
  const TEXT = "hsl(var(--brand-parchment))";
  const MUTED = "hsl(var(--brand-muted))";
  const INK = "hsl(var(--brand-ink))";
  const YELLOW = "hsl(var(--brand-action))";
  const MINT = "hsl(var(--brand-mint))";
  const cartoonFont = '"Space Grotesk", "Inter", system-ui, sans-serif';

  // Cartoon-style "sticker" surface for prominent buttons (new chat, etc.)
  const glassStyle: React.CSSProperties = {
    backgroundColor: SURFACE_2,
    border: `2px solid ${BORDER}`,
    color: TEXT,
    boxShadow: `3px 3px 0 ${BORDER}`,
  };

  // Sidebar shell — flat cartoon dark (mobile keeps this)
  const panelGlassStyle: React.CSSProperties = {
    ["--section-accent" as any]: sectionAccent.hsl,
    backgroundColor: PAGE_BG,
    color: TEXT,
    fontFamily: cartoonFont,
    boxShadow: `inset -2px 0 0 ${BORDER}`,
  };

  // Desktop — EXACT same glass recipe as the chat composer input (chat-composer-frame).
  const desktopGlassStyle: React.CSSProperties = {
    ["--section-accent" as any]: sectionAccent.hsl,
    backgroundColor: "var(--overlay-black-22)",
    backgroundImage: "none",
    backdropFilter: "blur(22px) saturate(1.5) brightness(1.1)",
    WebkitBackdropFilter: "blur(22px) saturate(1.5) brightness(1.1)" as any,
    color: TEXT,
    fontFamily: cartoonFont,
    border: "0",
    boxShadow:
      "inset 0 0 4px 0 rgba(250, 250, 250, 0.5), inset 0 1px 0 0 var(--overlay-white-22), 0 12px 40px -12px var(--overlay-black-55)",
  };

  // Active nav item — soft accent-tinted glass capsule
  const activeItemStyle: React.CSSProperties = {
    background:
      "linear-gradient(180deg, hsl(var(--section-accent) / 0.18), hsl(var(--section-accent) / 0.06))",
    color: "var(--overlay-white-100)",
    border: "1px solid hsl(var(--section-accent) / 0.28)",
    boxShadow:
      "inset 0 1px 0 var(--overlay-white-12), 0 0 0 1px hsl(var(--section-accent) / 0.05), 0 6px 18px -10px hsl(var(--section-accent) / 0.55)",
    fontWeight: 600,
  };

  // Inactive nav item — dim glass hover
  const inactiveItemStyle: React.CSSProperties = {
    color: "var(--overlay-white-62)",
    backgroundColor: "transparent",
    border: "1px solid transparent",
  };



  const innerContent = (
    <motion.div
      data-app-sidebar-panel="true"
      layout={inline ? true : false}
      transition={{ type: "spring", stiffness: 320, damping: 32, mass: 0.9 }}
      className="flex flex-col h-full w-full text-foreground relative overflow-hidden"
      style={desktopGlassStyle}
    >
      {/* HEADER — brand + collapse */}
      <div
        className={`relative shrink-0 h-14 px-3 flex items-center ${isCollapsed ? "justify-center" : "justify-between"}`}
        style={{ borderBottom: "1px solid var(--overlay-white-06)" }}
      >

        {!isCollapsed && (
          <div className="flex items-center gap-2 min-w-0 pl-1">
            <BrandLogo
              alt=""
              width={22}
              height={22}
              className="h-[22px] w-[22px] shrink-0"
              loading="eager"
              decoding="async"
            />
            <BrandWord
              className="text-[18px] tracking-tight truncate"
              style={{ fontWeight: 900, letterSpacing: "-0.02em" }}
            >
              Megsy
            </BrandWord>
          </div>
        )}

        {inline && (
          <button
            onClick={toggleCollapsed}
            className="w-11 h-11 grid place-items-center rounded-full transition active:scale-90"
            style={{ color: TEXT, border: "none", backgroundColor: "transparent" }}
            aria-label="Toggle sidebar"
            title={isCollapsed ? "Expand" : "Collapse"}
          >
            <PanelLeft className="w-[16px] h-[16px]" strokeWidth={2.4} />
          </button>
        )}
      </div>

      {/* NAV — clean iOS-style list: Apps always visible, rest behind More */}
      <div
        className={`shrink-0 ${isCollapsed ? "px-2 py-3 flex flex-col items-center gap-1" : "px-3 pt-3 pb-3 flex flex-col gap-0.5"}`}
      >
        {primaryNav.map(({ label, Icon, path, match }) => {
          const active = match(currentAppPath);
          if (isCollapsed) {
            return (
              <button
                key={label}
                onClick={() => navigateSmoothly(path)}
                onMouseEnter={() => prefetchRoute(path)}
                onFocus={() => prefetchRoute(path)}
                title={label}
                aria-label={label}
                className="relative w-10 h-10 grid place-items-center rounded-xl transition-all duration-200 hover:bg-[var(--overlay-white-05)] active:scale-95"
                style={{
                  color: active ? "var(--overlay-white-100)" : "var(--overlay-white-60)",
                  backgroundColor: active ? "var(--overlay-white-10)" : "transparent",
                  boxShadow: active ? "inset 0 0 0 1px var(--overlay-white-16)" : "none",
                }}
              >
                <Icon size={18} strokeWidth={2} />
              </button>
            );
          }
          return (
            <motion.button
              layout
              key={label}
              onClick={() => navigateSmoothly(path)}
              onMouseEnter={() => prefetchRoute(path)}
              onFocus={() => prefetchRoute(path)}
              initial={false}
              animate={{
                color: active ? "var(--overlay-white-100)" : "var(--overlay-white-60)",
                backgroundColor: active ? "var(--overlay-white-08)" : "transparent",
              }}
              whileHover={{ backgroundColor: "var(--overlay-white-04)" }}
              whileTap={{ scale: 0.985 }}
              className="group relative w-full h-10 pl-3 pr-3 flex items-center gap-3 rounded-xl transition-shadow"
              style={{
                boxShadow: active ? "inset 0 0 0 1px var(--overlay-white-12)" : "none",
              }}
            >
              <span
                className="shrink-0 transition-colors duration-200 group-hover:text-foreground"
                style={{ color: active ? "var(--overlay-white-100)" : "var(--overlay-white-70)" }}
              >
                <Icon size={17} strokeWidth={2} />
              </span>
              <motion.span
                layout
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="text-[13px] tracking-tight flex-1 text-left"
                style={{ fontWeight: active ? 600 : 500 }}
              >
                {label}
              </motion.span>
            </motion.button>
          );
        })}

        {/* More button */}
        {!isCollapsed && (
          <>
            <motion.button
              layout
              onClick={() => setMoreOpen(true)}
              initial={false}
              animate={{
                color: moreOpen ? "var(--overlay-white-100)" : "var(--overlay-white-60)",
                backgroundColor: moreOpen ? "var(--overlay-white-08)" : "transparent",
              }}
              whileHover={{ backgroundColor: "var(--overlay-white-04)" }}
              whileTap={{ scale: 0.985 }}
              className="hidden"
              aria-expanded={moreOpen}
            >
              <span
                className="shrink-0 transition-colors duration-200 group-hover:text-foreground"
                style={{ color: moreOpen ? "var(--overlay-white-100)" : "var(--overlay-white-70)" }}
              >
                <ChevronDown
                  size={17}
                  strokeWidth={2}
                  className={`transition-transform duration-200 ${moreOpen ? "rotate-180" : ""}`}
                />
              </span>
              <motion.span
                layout
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="text-[13px] tracking-tight flex-1 text-left"
                style={{ fontWeight: 500 }}
              >
                {uiT("more") || "More"}
              </motion.span>
            </motion.button>

            <AnimatePresence initial={false}>
              {moreOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden flex flex-col gap-0.5"
                >
                  {moreNav.map(({ label, Icon, path, match }) => {
                    const active = match(currentAppPath);
                    return (
                      <motion.button
                        layout
                        key={label}
                        onClick={() => navigateSmoothly(path)}
                        onMouseEnter={() => prefetchRoute(path)}
                        onFocus={() => prefetchRoute(path)}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -8 }}
                        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                        whileHover={{ backgroundColor: "var(--overlay-white-04)" }}
                        whileTap={{ scale: 0.985 }}
                        className="group relative w-full h-10 pl-3 pr-3 flex items-center gap-3 rounded-xl transition-shadow"
                        style={{
                          color: active ? "var(--overlay-white-100)" : "var(--overlay-white-60)",
                          backgroundColor: active ? "var(--overlay-white-08)" : "transparent",
                          boxShadow: active ? "inset 0 0 0 1px var(--overlay-white-12)" : "none",
                        }}
                      >
                        <span
                          className="shrink-0 transition-colors duration-200 group-hover:text-foreground"
                          style={{ color: active ? "var(--overlay-white-100)" : "var(--overlay-white-70)" }}
                        >
                          <Icon size={17} strokeWidth={2} />
                        </span>
                        <span
                          className="text-[13px] tracking-tight flex-1 text-left"
                          style={{ fontWeight: active ? 600 : 500 }}
                        >
                          {label}
                        </span>
                      </motion.button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>




      {/* Media sub-nav — only on media routes */}
      {currentAppPath.startsWith("/media") && (
        <div
          className={`shrink-0 border-t border-foreground/10 ${
            isCollapsed ? "px-2 py-2 flex flex-col items-center gap-1" : "px-3 py-2 space-y-1"
          }`}
        >
          {(() => {
            const active = currentAppPath.startsWith("/gallery");
            if (isCollapsed) {
              return (
                <button
                  onClick={() => navigateSmoothly("/gallery")}
                  onMouseEnter={() => prefetchRoute("/gallery")}
                  title="Cloud"
                  aria-label="Cloud"
                  style={active ? activeItemStyle : undefined}
                  className={`relative w-10 h-10 grid place-items-center rounded-xl border border-transparent transition-all ${
                    active
                      ? "text-foreground"
                      : "text-foreground/75 hover:text-foreground hover:bg-foreground/[0.06]"
                  }`}
                >
                  <Cloud className="w-5 h-5" strokeWidth={2} />
                </button>
              );
            }
            return (
              <motion.button
                layout
                onClick={() => navigateSmoothly("/gallery")}
                onMouseEnter={() => prefetchRoute("/gallery")}
                style={active ? activeItemStyle : undefined}
                whileHover={{ backgroundColor: "var(--overlay-white-04)" }}
                whileTap={{ scale: 0.985 }}
                className={`w-full h-10 px-3 flex items-center gap-3 rounded-xl border border-transparent transition-colors ${
                  active
                    ? "text-foreground"
                    : "text-foreground/80 hover:text-foreground"
                }`}
              >
                <Cloud className="w-5 h-5" strokeWidth={2} />
                <motion.span
                  layout
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className="text-[14px] font-medium"
                >
                  Cloud
                </motion.span>
              </motion.button>
            );
          })()}
        </div>
      )}

      {/* NEW CHAT — Liquid Glass capsule */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            key="new-chat-btn"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative shrink-0 px-3 pb-2"
          >
            <button
              onClick={handleNewChat}
              style={{
                background: "var(--overlay-white-06)",
                color: "var(--overlay-white-100)",
                border: "1px solid var(--overlay-white-14)",
                boxShadow:
                  "inset 0 1px 1px var(--overlay-white-12), 0 8px 20px -8px var(--overlay-black-50)",
                fontWeight: 600,
              }}
              className="w-full h-11 px-4 flex items-center justify-between rounded-2xl transition-all duration-300 hover:bg-[var(--overlay-white-10)] active:scale-[0.98] text-[13.5px] tracking-tight"
              title={isBuildMode ? "New project" : "New chat"}
            >
              <span>{isBuildMode ? "New project" : "New chat"}</span>
              <Plus className="w-4 h-4" strokeWidth={2} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>


      {/* SCROLLABLE — conversations or sub-nav */}
      <AnimatePresence initial={false} mode="popLayout">
        {!isCollapsed ? (
          <motion.div
            key="scrollable"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex-1 min-h-0 overflow-y-auto px-2 pb-3 [scrollbar-width:thin]"
          >
            {showRecent ? (
              conversations.length === 0 ? (
                <EmptyState
                  compact
                  title="No conversations yet"
                  description="Start a new chat and it will show up here."
                />
              ) : (
                <ul className="space-y-1">
                {flatConversations.map((conv) => {
                      const onChatPage = currentAppPath === "/chat";
                      const isActive = activeConversationId === conv.id;
                      return (
                        <li
                          key={conv.id}
                          style={{
                            contentVisibility: "auto",
                            containIntrinsicSize: "auto 44px",
                          }}
                        >
                          <button
                            onClick={() => {
                              onClose();
                              closeInline();
                              if (onChatPage) onSelectConversation?.(conv.id);
                              else
                                navigateSmoothly("/chat", {
                                  state: { loadConversationId: conv.id },
                                });
                            }}
                            style={
                              isActive
                                ? {
                                    backgroundColor: "transparent",
                                    color: TEXT,
                                    border: "none",
                                    fontWeight: 800,
                                  }
                                : {
                                    backgroundColor: "transparent",
                                    color: TEXT,
                                    border: "none",
                                    fontWeight: 600,
                                  }
                            }
                            aria-label={conv.title || "Untitled"}
                            title={conv.title || "Untitled"}
                            className="w-full text-start px-3 py-2 rounded-full text-[13px] truncate transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                          >
                            <span className="truncate">{conv.title || "Untitled"}</span>
                          </button>
                        </li>
                      );
                    })}
                </ul>
              )
            ) : (
              <SidebarSubNav
                mode={currentMode}
                size="sm"
                onNavigate={() => {
                  onClose();
                  closeInline();
                }}
              />
            )}
          </motion.div>
        ) : (
          <motion.div
            key="scrollable-spacer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 min-h-0"
          />
        )}
      </AnimatePresence>

      {/* FOOTER — user pill (cartoon sticker) */}
      <div className="shrink-0 p-2" style={{ borderTop: "1px solid var(--overlay-white-06)" }}>
        {!currentUserId ? null : (
          <AnimatePresence mode="wait" initial={false}>
            {isCollapsed ? (
              <motion.div
                key="footer-user-collapsed"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col items-center gap-1.5"
              >
                <button
                  onClick={() => navigateSmoothly("/settings")}
                  style={{
                    background: "var(--overlay-white-04)",
                    border: "1px solid var(--overlay-white-12)",
                    color: TEXT,
                  }}
                  className="w-11 h-11 rounded-2xl grid place-items-center text-[12px] font-semibold overflow-hidden transition-all duration-300 hover:bg-[var(--overlay-white-08)]"
                  title={displayName}
                >
                  {displayAvatar ? (
                    <img loading="lazy" decoding="async" src={displayAvatar} alt="" className="w-11 h-11 rounded-2xl object-cover" />
                  ) : (
                    initial
                  )}
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="user-footer"
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center gap-1.5 p-1.5 rounded-2xl"
                style={{
                  background: "var(--overlay-white-03)",
                  border: "1px solid var(--overlay-white-08)",
                  boxShadow: "inset 0 1px 0 var(--overlay-white-04), 0 6px 18px -12px var(--overlay-black-55)",
                }}
              >
                <button
                  onClick={() => navigateSmoothly("/settings")}
                  className="group flex-1 min-w-0 flex items-center gap-3 px-2 py-1.5 rounded-xl text-left transition-colors hover:bg-[var(--overlay-white-04)]"
                  title="Account settings"
                >
                  {displayAvatar ? (
                    <img loading="lazy" decoding="async"
                      src={displayAvatar}
                      alt=""
                      className="w-9 h-9 rounded-xl object-cover shrink-0"
                      style={{ border: "1px solid var(--overlay-white-10)" }}
                    />
                  ) : (
                    <div
                      className="w-9 h-9 rounded-xl grid place-items-center text-[13px] shrink-0"
                      style={{
                        background: "linear-gradient(135deg, var(--overlay-white-14), var(--overlay-white-05))",
                        color: "var(--overlay-white-100)",
                        border: "1px solid var(--overlay-white-10)",
                        fontWeight: 700,
                      }}
                    >
                      {initial}
                    </div>
                  )}
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <span
                      className="text-[13.5px] truncate leading-none tracking-tight"
                      style={{ color: "var(--overlay-white-95)", fontWeight: 600 }}
                    >
                      {displayName}
                    </span>
                    <span
                      className="text-[11px] truncate leading-none"
                      style={{ color: "hsl(var(--sidebar-foreground) / 0.62)", fontWeight: 500, letterSpacing: "0.01em" }}
                    >
                      Manage account
                    </span>
                  </div>
                </button>

                <button
                  onClick={() => navigateSmoothly("/pricing")}
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(120, 231, 178, 0.90), rgba(74, 222, 128, 0.86))",
                    color: "#052e16",
                    border: "1px solid rgba(120, 231, 178, 0.55)",
                    boxShadow:
                      "inset 0 1px 0 var(--overlay-white-45), 0 0 20px -4px rgba(120,231,178,0.45)",
                    fontWeight: 700,
                  }}
                  className="shrink-0 flex items-center gap-1.5 h-8 pl-2.5 pr-3.5 rounded-full text-[12px] whitespace-nowrap transition-all duration-200 hover:brightness-110 hover:shadow-[inset_0_1px_0_var(--overlay-white-45),0_0_24px_-4px_rgba(120,231,178,0.55)] active:scale-95"
                  title="Upgrade plan"
                >
                  <span>Upgrade</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );

  // MOBILE — restore previous design (pre-redesign), unchanged for phones
  const mobileContent = (
    <div
      data-app-sidebar-panel="true"
      className="flex flex-col h-full text-foreground relative overflow-hidden"
      style={panelGlassStyle}
      data-section={sectionAccent.name}
    >
      <div
        className="relative shrink-0 px-4 pb-2 flex items-center gap-2"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + var(--pwa-extra-top, 0px) + 1rem)" }}
      >
        <BrandLogo
          alt=""
          width={22}
          height={22}
          className="h-[22px] w-[22px] shrink-0"
          loading="eager"
          decoding="async"
        />
        <BrandWord
          className="text-[19px] tracking-tight truncate"
          style={{ fontWeight: 900, letterSpacing: "-0.02em" }}
        >
          Megsy
        </BrandWord>
      </div>

      <div
        onScroll={(e) => setMobileScrolled((e.currentTarget as HTMLDivElement).scrollTop > 6)}
        className="relative flex-1 overflow-y-auto px-3 pt-1 pb-32 min-h-0 [scrollbar-width:thin]"
      >
        <div className="space-y-1 mb-3">
          {primaryNav.map(({ label, Icon, path, match }) => {
            const active = match(currentAppPath);
            return (
              <button
                key={label}
                onClick={() => navigateSmoothly(path)}
                onMouseEnter={() => prefetchRoute(path)}
                onFocus={() => prefetchRoute(path)}
                style={{ color: TEXT, backgroundColor: "transparent", border: "none", fontWeight: active ? 800 : 700 }}
                className="w-full h-11 px-2 flex items-center gap-3 rounded-none transition-all active:scale-95"
              >
                <Icon size={19} strokeWidth={2.2} />
                <span className="text-[14.5px]" style={{ fontWeight: active ? 800 : 700 }}>
                  {label}
                </span>
              </button>
            );
          })}

          {/* More button — hides once expanded, revealing moreNav items in its place */}
          <AnimatePresence initial={false} mode="wait">
            {!moreOpen ? (
              <motion.button
                key="more-btn"
                onClick={() => setMoreOpen(true)}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 44 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                style={{ color: TEXT, backgroundColor: "transparent", border: "none", fontWeight: 700 }}
                className="w-full px-2 flex items-center gap-3 rounded-none overflow-hidden active:scale-95"
                aria-expanded={moreOpen}
              >
                <ChevronDown size={19} strokeWidth={2.2} />
                <span className="text-[14.5px]" style={{ fontWeight: 700 }}>
                  {uiT("more") || "More"}
                </span>
              </motion.button>
            ) : (
              <motion.div
                key="more-items"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden flex flex-col gap-1"
              >
                {moreNav.map(({ label, Icon, path, match }, i) => {
                  const active = match(currentAppPath);
                  return (
                    <motion.button
                      key={label}
                      onClick={() => navigateSmoothly(path)}
                      onMouseEnter={() => prefetchRoute(path)}
                      onFocus={() => prefetchRoute(path)}
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: 0.04 + i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                      style={{ color: TEXT, backgroundColor: "transparent", border: "none", fontWeight: active ? 800 : 700 }}
                      className="w-full h-11 px-2 flex items-center gap-3 rounded-none transition-all active:scale-95"
                    >
                      <Icon size={19} strokeWidth={2.2} />
                      <span className="text-[14.5px]" style={{ fontWeight: active ? 800 : 700 }}>
                        {label}
                      </span>
                    </motion.button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          {currentAppPath.startsWith("/media") && (
            <button
              onClick={() => navigateSmoothly("/gallery")}
              onMouseEnter={() => prefetchRoute("/gallery")}
              style={{ color: TEXT, backgroundColor: "transparent", border: "none" }}
              className="w-full h-11 px-2 flex items-center gap-3 rounded-none transition-all active:scale-95"
            >
              <Cloud className="w-5 h-5" strokeWidth={2.2} />
              <span className="text-[14.5px]" style={{ fontWeight: 700 }}>
                Cloud
              </span>
            </button>
          )}
        </div>

        {showRecent ? (
          conversations.length === 0 ? (
            <EmptyState
              compact
              title="No conversations yet"
              description="Start a new chat and it will show up here."
            />
          ) : (
            <ul className="space-y-1">
              {flatConversations.map((conv) => {
                  const onChatPage = stripZonePrefix(location.pathname) === "/chat";
                  const isActive = activeConversationId === conv.id;
                  return (
                    <li key={conv.id}>
                      <div style={{ contentVisibility: "auto", containIntrinsicSize: "auto 48px" }}>
                      <button
                        onClick={() => {
                          onClose();
                          if (onChatPage) onSelectConversation?.(conv.id);
                          else
                            navigateSmoothly("/chat", {
                              state: { loadConversationId: conv.id },
                            });
                        }}
                        style={{
                          borderColor: isActive ? "hsl(var(--primary) / 0.25)" : "transparent",
                        }}
                        aria-label={conv.title || "Untitled"}
                        title={conv.title || "Untitled"}
                        className={`w-full text-start px-3 py-2.5 rounded-xl text-[14.5px] truncate transition-colors border ${
                          isActive
                            ? "bg-primary/10 text-foreground"
                            : "text-foreground/85 hover:bg-foreground/[0.05] hover:text-foreground"
                        }`}
                      >
                        <span className="truncate font-medium">{conv.title || "Untitled"}</span>
                      </button>
                      </div>
                    </li>
                  );
                })}
            </ul>
          )
        ) : (
          <SidebarSubNav mode={currentMode} size="md" onNavigate={onClose} />
        )}
      </div>

      <div
        data-scrolled={mobileScrolled ? "true" : "false"}
        data-mobile-sidebar-footer-dock={mobileScrolled ? "true" : "false"}
        className="absolute bottom-0 left-0 right-0 z-20 flex items-center pointer-events-none"
        style={{
          padding: mobileScrolled
            ? `0 10px calc(env(safe-area-inset-bottom, 0px) + 10px) 10px`
            : `0 18px calc(env(safe-area-inset-bottom, 0px) + 16px) 18px`,
          gap: mobileScrolled ? "0px" : "10px",
          transition:
            "padding 420ms cubic-bezier(0.22, 1, 0.36, 1), gap 420ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {/* Dock surface: transparent at rest, single white card when scrolled */}
        <div
          className="pointer-events-auto flex min-w-0 flex-1 items-center"
          style={{
            height: mobileScrolled ? "52px" : "42px",
            paddingLeft: mobileScrolled ? "6px" : "0px",
            paddingRight: mobileScrolled ? "6px" : "0px",
            borderRadius: mobileScrolled ? "20px" : "9999px",
            background: mobileScrolled ? "#ffffff" : "transparent",
            boxShadow: mobileScrolled
              ? "0 -8px 40px rgba(0,0,0,0.35), 0 2px 0 rgba(0,0,0,0.02) inset"
              : "none",
            transition:
              "height 420ms cubic-bezier(0.22, 1, 0.36, 1), padding 420ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 420ms cubic-bezier(0.22, 1, 0.36, 1), background-color 420ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 420ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          <div
            data-mobile-sidebar-footer-action="primary"
            className={
              activeUserId
                ? "theme-fixed mobile-sidebar-footer-pill flex min-w-0 items-center h-10 pl-1 pr-1 rounded-full flex-[1_1_auto] max-w-[calc(100%-52px)]"
                : "flex min-w-0 flex-1 items-center"
            }
          >
            <button
              type="button"
              data-mobile-sidebar-footer-action="primary"
              data-sunset={!activeUserId ? "true" : undefined}
              onClick={() => navigateSmoothly(activeUserId ? "/settings" : "/auth")}
              className={
                activeUserId
                  ? "theme-fixed mobile-sidebar-footer-action flex min-w-0 items-center gap-2 h-11 pl-1 pr-2 rounded-full text-left transition-transform active:scale-95 w-full"
                  : "btn-sunset flex w-full items-center justify-center h-11 px-5 rounded-2xl transition-transform active:scale-95 mb-2"
              }
              title={activeUserId ? "Settings" : "Sign in"}
            >

              {activeUserId && (
                <div className="shrink-0">
                  {displayAvatar ? (
                    <img loading="lazy" decoding="async"
                      src={displayAvatar}
                      alt=""
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="theme-fixed mobile-sidebar-footer-avatar-fallback grid h-8 w-8 place-items-center rounded-full text-[12px] font-semibold">
                      {initial}
                    </div>
                  )}
                </div>
              )}
              <span className={activeUserId ? "min-w-0 flex-1 truncate text-[12.5px] font-semibold leading-none theme-fixed mobile-sidebar-footer-text" : "truncate text-[14px] font-semibold leading-none text-white"}>
                {activeUserId ? displayName || "User" : "Sign in"}
              </span>

            </button>
            {activeUserId && (
              <>
                <span aria-hidden className="theme-fixed mobile-sidebar-footer-divider h-4 w-px shrink-0" />
                <button
                  type="button"
                  onClick={() => navigateSmoothly("/pricing")}
                  className="theme-fixed mobile-sidebar-footer-action flex items-center justify-center shrink-0 h-11 w-11 rounded-full transition-transform active:scale-95"
                  title="Get Pro"
                  aria-label="Get Pro"
                >
                  <MegsyStar size={15} static className="mobile-sidebar-footer-icon" />
                </button>
              </>
            )}
          </div>

          {!!activeUserId && (
            <button
              data-mobile-sidebar-footer-action="new"
              onClick={handleNewChat}
              className="theme-fixed mobile-sidebar-footer-pill mobile-sidebar-footer-text grid place-items-center active:scale-90 shrink-0"
              style={{
                height: mobileScrolled ? "40px" : "40px",
                width: mobileScrolled ? "40px" : "40px",
                borderRadius: mobileScrolled ? "14px" : "9999px",
                marginLeft: mobileScrolled ? "6px" : "10px",
              }}
              title={isBuildMode ? "New project" : "New chat"}
              aria-label="New chat"
            >
              <Plus className="h-[20px] w-[20px]" strokeWidth={2.2} />
            </button>
          )}
        </div>
      </div>


    </div>
  );

  if (inline) return innerContent;

  // Claude-style underlay: always mounted below the chat surface, no overlay,
  // no slide animation. Parent shifts the chat right to reveal it.
  if (underlay) {
    return (
      <aside
        aria-hidden={!open}
        {...(!open ? ({ inert: true } as any) : {})}
        data-chat-sidebar-underlay="true"
        data-mobile-sidebar-open={open ? "true" : "false"}
        style={{
          ["--section-accent" as any]: sectionAccent.hsl,
          backgroundColor: PAGE_BG,
          width: "min(86vw, 320px)",
          left: isMobileRightSide ? "auto" : 0,
          right: isMobileRightSide ? 0 : "auto",
        }}
        className="md:hidden fixed top-0 bottom-0 z-[1] flex flex-col overflow-hidden"
      >
        {mobileContent}
      </aside>
    );
  }


  const isTransparentSurface =
    typeof window !== "undefined" &&
    (stripZonePrefix(window.location.pathname).startsWith("/chat") ||
      stripZonePrefix(window.location.pathname).startsWith("/settings/referrals"));

  return (
    <AnimatePresence>
      {open && (
        <>
          {!isTransparentSurface && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: [0.32, 0.72, 0, 1] }}
              className="fixed inset-0 z-popover bg-background/55 cursor-pointer"
              onClick={onClose}
              onTouchStart={onClose}
            />
          )}
          {isTransparentSurface && (
            <div
              className="fixed inset-0 z-popover"
              onClick={onClose}
              onTouchStart={onClose}
              style={{ background: "transparent" }}
            />
          )}
          <motion.aside
            initial={{ x: isMobileRightSide ? "100%" : "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: isMobileRightSide ? "100%" : "-100%" }}
            transition={{ duration: 0.16, ease: [0.32, 0.72, 0, 1] }}


            drag="x"
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0.04, right: 0 }}
            dragMomentum={false}
            onDragEnd={(_, info) => {
              const shouldClose = isMobileRightSide
                ? info.offset.x > 80 || info.velocity.x > 400
                : info.offset.x < -80 || info.velocity.x < -400;
              if (shouldClose) onClose();
            }}
            style={{
              ["--section-accent" as any]: sectionAccent.hsl,
              backgroundColor: PAGE_BG,
              willChange: "transform",
              touchAction: "pan-y",
              width: "288px",
              left: isMobileRightSide ? "auto" : 0,
              right: isMobileRightSide ? 0 : "auto",
            }}
            className={`fixed top-0 bottom-0 z-[91] flex flex-col overflow-hidden ${
              isMobileRightSide ? "border-l" : "border-r"
            } border-foreground/10 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.45)]`}
            onClick={(e) => e.stopPropagation()}
          >
            {mobileContent}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};

export default memo(AppSidebar);
