import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import SkipToContent from "@/components/common/SkipToContent";
import UpgradeMomentHost from "@/components/billing/UpgradeMomentHost";



// Aurora Spectrum — per-section accent (HSL triplets so we can compose with hsl() / alpha).
// Chat purple · Images pink · Videos cyan · Megsy-OS green.
function sectionFor(pathname: string): { name: string; hsl: string } {
  if (pathname.startsWith("/media") || pathname.startsWith("/images"))
    return { name: "images", hsl: "338 100% 71%" };
  if (pathname.startsWith("/videos") || pathname.startsWith("/cinema"))
    return { name: "videos", hsl: "187 85% 53%" };
  if (
    pathname.startsWith("/megsy") ||
    pathname.startsWith("/agents") ||
    pathname.startsWith("/workspace")
  )
    return { name: "os", hsl: "158 64% 52%" };
  return { name: "chat", hsl: "252 92% 67%" };
}

interface AppLayoutProps {
  children: React.ReactNode;
  onSelectConversation?: (id: string) => void;
  onNewChat?: () => void;
  activeConversationId?: string | null;
}

const AppLayout = ({
  children,
}: AppLayoutProps) => {
  const { pathname } = useLocation();
  useEffect(() => {
    const s = sectionFor(pathname);
    const root = document.documentElement;
    root.dataset.section = s.name;
    root.style.setProperty("--section-accent", s.hsl);
  }, [pathname]);
  const isSettings =
    pathname.startsWith("/settings") ||
    pathname.startsWith("/usage") ||
    pathname.startsWith("/notifications") ||
    pathname.startsWith("/profile");
  useEffect(() => {
    const root = document.documentElement;
    if (isSettings) {
      root.classList.add("settings-page-active");
    } else {
      root.classList.remove("settings-page-active");
    }
    return () => { root.classList.remove("settings-page-active"); };
  }, [isSettings]);
  // Landing / marketing typography scope — Sora + Manrope on marketing routes only.
  useEffect(() => {
    const root = document.documentElement;
    const marketingPrefixes = [
      "/landing", "/pricing", "/enterprise", "/about", "/blog", "/contact",
      "/features", "/compare", "/comparison", "/docs", "/support", "/changelog",
      "/trust", "/privacy", "/terms", "/cookies", "/refund", "/dmca",
      "/ai-disclaimer", "/dpa", "/moderation", "/subprocessors", "/age-policy",
      "/accessibility", "/compliance", "/content-policy", "/affiliate",
      "/ai-chat", "/megsy", "/megay", "/models", "/model", "/referral",
      "/seo", "/industry", "/use-case", "/solutions", "/templates",
    ];
    const isLanding = pathname === "/" || marketingPrefixes.some((p) => pathname.startsWith(p));
    if (isLanding) root.setAttribute("data-typography", "landing");
    else root.removeAttribute("data-typography");
    return () => { root.removeAttribute("data-typography"); };
  }, [pathname]);
  return (
    <div className={cn("flex min-h-[100dvh] w-full flex-col", isSettings ? "bg-transparent" : "bg-background")}>
      <SkipToContent />
      <main id="main" className="flex-1 min-w-0 overflow-visible">{children}</main>
      <UpgradeMomentHost />
    </div>
  );

};

export default AppLayout;
