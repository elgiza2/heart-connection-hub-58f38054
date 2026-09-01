import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Applies `data-typography="landing"` on <html> for marketing / landing routes
 * so the dark-theme + Sora/Manrope overrides in landing-typography.css activate.
 * Mounted once inside <BrowserRouter> in App.tsx.
 */
const MARKETING_PREFIXES = [
  "/landing", "/pricing", "/enterprise", "/about", "/blog", "/contact",
  "/features", "/compare", "/comparison", "/docs", "/support", "/changelog",
  "/trust", "/privacy", "/terms", "/cookies", "/refund", "/dmca",
  "/ai-disclaimer", "/dpa", "/moderation", "/subprocessors", "/age-policy",
  "/accessibility", "/compliance", "/content-policy", "/affiliate",
  "/ai-chat", "/megsy", "/megay", "/models", "/model", "/referral",
  "/seo", "/industry", "/use-case", "/solutions", "/templates",
];

export default function MarketingTypographyScope() {
  const { pathname } = useLocation();
  useEffect(() => {
    const root = document.documentElement;
    const isLanding =
      pathname === "/" || MARKETING_PREFIXES.some((p) => pathname.startsWith(p));
    if (isLanding) root.setAttribute("data-typography", "landing");
    else root.removeAttribute("data-typography");
  }, [pathname]);
  return null;
}
