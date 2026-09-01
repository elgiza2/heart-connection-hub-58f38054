import { useState, useEffect, useRef } from "react";
import { m as motion, AnimatePresence } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import FancyButton from "@/components/branding/FancyButton";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePrefetchRoute } from "@/hooks/usePrefetchRoute";
import { translateExactText, useUserLang } from "@/lib/authI18n";
import { BrandWord } from "@/components/brand/BrandLogo";

/* ── Mega-menu data ── */
interface SubItem {
  label: string;
  desc: string;
  href: string;
}
interface MenuColumn {
  title: string;
  items: SubItem[];
}
interface NavDropdown {
  label: string;
  columns: MenuColumn[];
  featured?: { title: string; desc?: string; cta: string; href: string };
}
interface NavLink {
  label: string;
  href: string;
  external?: boolean;
}
type NavItem = NavDropdown | NavLink;
const isDropdown = (item: NavItem): item is NavDropdown => "columns" in item;

const navItems: NavItem[] = [
  {
    label: "Create",
    columns: [
      {
        title: "AI Creation",
        items: [
          { label: "AI Chat", desc: "Chat with 80+ models including Megsy Pro", href: "/ai-chat" },
          {
            label: "AI Image Generator",
            desc: "Create stunning visuals instantly",
            href: "/l/ai-image-generator-unlimited",
          },
          {
            label: "AI Video Generator",
            desc: "Generate cinematic videos with AI",
            href: "/l/ai-video-generator",
          },
        ],
      },
      {
        title: "Studios",
        items: [
          { label: "Cinema Studio", desc: "Long-form cinematic video creation", href: "/l/ai-video-generator" },
          { label: "Image Studio", desc: "Full AI image editing suite", href: "/l/ai-image-editor" },
          { label: "Megsy Build", desc: "Ship full-stack apps with AI", href: "/l/build-ai-apps" },
        ],
      },
    ],
    featured: {
      title: "Powered by\nMegsy Pro",
      desc: "Experience our most advanced AI model — built in-house.",
      cta: "Discover Megsy",
      href: "/megsy-model",
    },
  },
  {
    label: "Products",
    columns: [
      {
        title: "Image Tools",
        items: [
          { label: "Image Studio", desc: "Full image editing suite", href: "/l/ai-image-editor" },
          {
            label: "Background Remover",
            desc: "Erase or replace backgrounds",
            href: "/solutions/ai-background-remover",
          },
          { label: "Magic Erase", desc: "Remove unwanted objects", href: "/l/ai-image-editor" },
          {
            label: "Inpainting",
            desc: "Fill missing areas with AI",
            href: "/l/ai-image-editor",
          },
        ],
      },
      {
        title: "Portrait & Style",
        items: [
          {
            label: "Headshot Generator",
            desc: "Studio-quality headshots",
            href: "/l/ai-headshot-generator",
          },
          {
            label: "Portrait Studio",
            desc: "Face swap & portrait magic",
            href: "/l/ai-headshot-generator",
          },
          {
            label: "Retouching",
            desc: "Pro-level photo retouching",
            href: "/l/ai-image-editor",
          },
          {
            label: "Logo Generator",
            desc: "Brand-ready logos with AI",
            href: "/l/ai-logo-generator",
          },
        ],
      },
      {
        title: "Video Tools",
        items: [
          { label: "Video Studio", desc: "AI-powered video editing", href: "/l/ai-video-generator" },
          { label: "Cinema Studio", desc: "Long-form cinematic video creation", href: "/l/ai-video-generator" },
          {
            label: "Thumbnail Generator",
            desc: "Click-worthy thumbnails",
            href: "/l/ai-thumbnail-generator",
          },
          {
            label: "AI Video Generator",
            desc: "Generate cinematic videos with AI",
            href: "/l/ai-video-generator",
          },
        ],
      },
    ],
    featured: {
      title: "Reach out to our team",
      desc: "Got a question about Megsy Pro? We're here to help.",
      cta: "Submit Request",
      href: "/contact",
    },
  },
  {
    label: "Company",
    columns: [
      {
        title: "Resources",
        items: [
          { label: "Pricing", desc: "Plans, credits & savings", href: "/pricing" },
          { label: "Enterprise", desc: "Megsy for large teams", href: "/enterprise" },
          { label: "Solutions", desc: "Discover every Megsy service", href: "/solutions" },
          { label: "Support", desc: "Get help from our AI assistant", href: "/support" },
        ],
      },
      {
        title: "Trust & Legal",
        items: [
          { label: "Trust Center", desc: "Security & compliance", href: "/trust" },
          { label: "Content Policy", desc: "What you can create", href: "/policies/content" },
          { label: "Privacy", desc: "How we handle your data", href: "/privacy" },
          { label: "Terms", desc: "Terms of service", href: "/terms" },
        ],
      },
    ],
  },
  { label: "Pricing", href: "/pricing" },
  { label: "Earn", href: "/settings/referrals" },
  { label: "Contact", href: "/contact" },
];

const LandingNavbar = () => {
  const lang = useUserLang();
  const tx = (text: string) => translateExactText(text, lang);
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const [user, setUser] = useState<{
    avatarUrl: string | null;
    displayName: string;
    email: string;
  } | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetch = usePrefetchRoute();

  // Auth state listener
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const u = session.user;
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("id", u.id)
          .single();
        setUser({
          avatarUrl: profile?.avatar_url || u.user_metadata?.avatar_url || null,
          displayName:
            profile?.display_name || u.user_metadata?.full_name || u.email?.split("@")[0] || "U",
          email: u.email || "",
        });
      } else {
        setUser(null);
      }
    });

    // Initial check
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const u = session.user;
        supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("id", u.id)
          .single()
          .then(({ data: profile }) => {
            setUser({
              avatarUrl: profile?.avatar_url || u.user_metadata?.avatar_url || null,
              displayName:
                profile?.display_name ||
                u.user_metadata?.full_name ||
                u.email?.split("@")[0] ||
                "U",
              email: u.email || "",
            });
          });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleNav = (href: string) => {
    setMobileOpen(false);
    setOpenDropdown(null);
    setPinned(false);
    const scrollToHash = (hash: string) => {
      const target = document.querySelector(hash);
      if (!target) return;
      const top = target.getBoundingClientRect().top + window.scrollY - 76;
      const lenis = (
        window as unknown as {
          __lenis?: {
            scrollTo: (
              target: number,
              options?: { duration?: number; easing?: (t: number) => number },
            ) => void;
          };
        }
      ).__lenis;
      if (lenis) {
        lenis.scrollTo(top, { duration: 1.15, easing: (t) => 1 - Math.pow(1 - t, 4) });
        return;
      }
      window.scrollTo({ top, left: 0, behavior: "smooth" });
    };

    if (href.startsWith("http")) {
      window.open(href, "_blank");
    } else if (href.startsWith("/#")) {
      const hash = href.replace("/", "");
      if (location.pathname === "/") {
        scrollToHash(hash);
      } else {
        navigate("/");
        setTimeout(() => scrollToHash(hash), 300);
      }
    } else {
      navigate(href);
    }
  };

  const handleMouseEnter = (label: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (!pinned) setOpenDropdown(label);
  };

  const handleMouseLeave = () => {
    if (!pinned) {
      timeoutRef.current = setTimeout(() => setOpenDropdown(null), 200);
    }
  };

  const handleClick = (label: string) => {
    if (openDropdown === label && pinned) {
      setOpenDropdown(null);
      setPinned(false);
    } else {
      setOpenDropdown(label);
      setPinned(true);
    }
  };

  const initial = user?.displayName?.charAt(0)?.toUpperCase() || "U";

  return (
    <motion.nav
      initial={{ y: -80 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.55, ease: "easeOut" }}
      className="fixed inset-x-0 top-3 z-50 px-3 md:px-6"
    >
      <div
        className="mx-auto flex h-16 max-w-7xl items-center justify-between rounded-full px-4 md:px-6 transition-all duration-300"
        style={{
          background: scrolled ? "rgba(15,15,18,0.78)" : "rgba(15,15,18,0.55)",
          backdropFilter: "blur(16px) saturate(160%)",
          WebkitBackdropFilter: "blur(16px) saturate(160%)",
          border: "1px solid var(--overlay-white-14)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.25), 0 18px 50px var(--overlay-black-35)",
        }}
      >
        {/* Logo */}
        <a
          id="nav-logo"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
          className="font-display text-3xl font-black uppercase tracking-tight text-foreground"
        >
          <BrandWord>MEGSY</BrandWord>
        </a>

        {/* ── Desktop Nav ── */}
        <div className="hidden items-center gap-1 md:flex">
          {navItems.map((item) =>
            isDropdown(item) ? (
              <div
                key={item.label}
                className="relative"
                onMouseEnter={() => handleMouseEnter(item.label)}
                onMouseLeave={handleMouseLeave}
              >
                <button
                  onClick={() => handleClick(item.label)}
                  className="flex items-center gap-1 rounded-lg px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:text-foreground"
                >
                  {tx(item.label)}
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${openDropdown === item.label ? "rotate-180" : ""}`}
                  />
                </button>

                <AnimatePresence>
                  {openDropdown === item.label && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{ duration: 0.2 }}
                      className="fixed left-0 right-0 top-[64px] flex justify-center z-50 px-6 pointer-events-none"
                    >
                      <div
                        className="w-full max-w-[1000px] rounded-3xl p-8 pointer-events-auto"
                        style={{
                          background: "rgba(8,8,10,0.96)",
                          backdropFilter: "blur(16px) saturate(160%)",
                          WebkitBackdropFilter: "blur(16px) saturate(160%)",
                          border: "1px solid var(--overlay-white-08)",
                          boxShadow:
                            "0 25px 60px rgba(0,0,0,0.6), inset 0 1px 0 var(--overlay-white-08)",
                        }}
                      >
                        <div className="flex gap-10">
                          {item.featured && (
                            <div className="group w-[280px] shrink-0 rounded-2xl border border-foreground/10 flex flex-col items-start relative overflow-hidden">
                              <img loading="lazy" decoding="async"
                                src={
                                  item.label === "Products"
                                    ? "/route-assets/showcase/img-2.webp"
                                    : "/route-assets/showcase/img-1.webp"
                                }
                                alt=""
                                className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-105 group-hover:opacity-80 transition-all duration-500"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
                              <div className="relative z-10 p-6 flex flex-col h-full w-full mt-auto">
                                <h3 className="text-xl font-bold text-foreground mb-2 whitespace-pre-line">
                                  {tx(item.featured.title)}
                                </h3>
                                {item.featured.desc && (
                                  <p className="text-sm text-foreground/70 mb-6">
                                    {tx(item.featured.desc)}
                                  </p>
                                )}
                                <button
                                  onClick={() => handleNav(item.featured!.href)}
                                  className="mt-auto rounded-xl bg-foreground/10 backdrop-blur-md text-foreground px-5 py-3 text-sm font-semibold hover:bg-foreground/20 transition-all w-full border border-foreground/20"
                                >
                                  {tx(item.featured.cta)}
                                </button>
                              </div>
                            </div>
                          )}

                          <div
                            className="flex-1 grid gap-8"
                            style={{
                              gridTemplateColumns: `repeat(${item.columns.length}, minmax(0, 1fr))`,
                            }}
                          >
                            {item.columns.map((col) => (
                              <div key={col.title}>
                                <h4 className="mb-5 text-[11px] font-bold uppercase tracking-[0.2em] text-foreground">
                                  {tx(col.title)}
                                </h4>
                                <div className="space-y-5">
                                  {col.items.map((sub) => (
                                    <button
                                      key={sub.label}
                                      onClick={() => handleNav(sub.href)}
                                      className="group flex flex-col w-full text-left"
                                    >
                                      <span className="text-[15px] font-semibold text-foreground group-hover:text-primary transition-colors">
                                        {tx(sub.label)}
                                      </span>
                                      <span className="text-[13px] text-foreground group-hover:text-foreground transition-colors mt-1">
                                        {tx(sub.desc)}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <a
                key={item.label}
                href={item.href}
                onClick={(e) => {
                  e.preventDefault();
                  handleNav(item.href);
                }}
                className="rounded-lg px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:text-foreground"
              >
                {tx(item.label)}
              </a>
            ),
          )}
        </div>

        {/* Auth buttons / Avatar */}
        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <button
              onClick={() => navigate("/chat")}
              {...prefetch("/chat")}
              className="flex items-center gap-2.5 rounded-full border border-border px-2 py-1.5 transition-all hover:border-foreground/35"
            >
              {user.avatarUrl ? (
                <img loading="lazy" decoding="async" src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {initial}
                </div>
              )}
              <span className="pr-2 text-sm font-medium text-foreground">{user.displayName}</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => navigate("/auth")}
                {...prefetch("/auth")}
                className="group relative rounded-full p-[2px] overflow-hidden transition-transform hover:scale-[1.03]"
                style={{
                  background:
                    "conic-gradient(from var(--angle, 0deg), #c0c0c0, #ffffff, #8a8a8a, #ffffff, #c0c0c0)",
                  animation: "silver-spin 4s linear infinite",
                }}
              >
                <span className="relative block rounded-full bg-background px-5 py-2 text-sm font-medium text-foreground">
                  {tx("Log in")}
                </span>
              </button>
              <button
                onClick={() => navigate("/auth")}
                {...prefetch("/auth")}
                className="rounded-full bg-yellow-400 px-5 py-2.5 text-sm font-semibold text-background transition-all hover:scale-[1.03] hover:bg-yellow-300"
              >
                {tx("Start Creating")}
              </button>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center text-sm font-bold uppercase tracking-wider text-foreground md:hidden"
        >
          {mobileOpen ? tx("Close") : tx("Menu")}
        </button>
      </div>

      {/* ── Mobile Menu ── */}
      {mobileOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto mt-2 max-h-[80vh] max-w-7xl overflow-y-auto rounded-3xl px-6 py-5 md:hidden"
          style={{
            background: "rgba(20,20,22,0.92)",
            backdropFilter: "blur(14px) saturate(160%)",
            WebkitBackdropFilter: "blur(14px) saturate(160%)",
            border: "1px solid var(--overlay-white-12)",
            boxShadow: "inset 0 1px 0 var(--overlay-white-18), 0 18px 50px rgba(0,0,0,0.4)",
          }}
        >
          {navItems.map((item) =>
            isDropdown(item) ? (
              <div key={item.label}>
                <button
                  onClick={() =>
                    setMobileExpanded(mobileExpanded === item.label ? null : item.label)
                  }
                  className="flex w-full items-center justify-between py-3 text-base font-medium text-foreground/80 hover:text-foreground"
                >
                  {tx(item.label)}
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${mobileExpanded === item.label ? "rotate-180" : ""}`}
                  />
                </button>
                <AnimatePresence>
                  {mobileExpanded === item.label && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-4 pb-3 pl-2">
                        {item.columns.map((col) => (
                          <div key={col.title}>
                            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-foreground/65">
                              {tx(col.title)}
                            </h4>
                            {col.items.map((sub) => (
                              <button
                                key={sub.label}
                                onClick={() => handleNav(sub.href)}
                                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left"
                              >
                                <div>
                                  <span className="text-sm text-foreground/80">{tx(sub.label)}</span>
                                  <span className="block text-xs text-foreground/65">
                                    {tx(sub.desc)}
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <a
                key={item.label}
                href={item.href}
                onClick={(e) => {
                  e.preventDefault();
                  handleNav(item.href);
                }}
                className="block py-3 text-base font-medium text-foreground/80 hover:text-foreground"
              >
                {tx(item.label)}
              </a>
            ),
          )}
          <div className="mt-5 flex flex-col gap-3">
            {user ? (
              <button
                onClick={() => {
                  setMobileOpen(false);
                  navigate("/chat");
                }}
                {...prefetch("/chat")}
                className="flex items-center justify-center gap-2.5 rounded-lg border border-border py-2.5"
              >
                {user.avatarUrl ? (
                  <img loading="lazy" decoding="async" src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {initial}
                  </div>
                )}
                <span className="text-sm font-medium text-foreground">{tx("Go to Dashboard")}</span>
              </button>
            ) : (
              <>
                <button
                  onClick={() => navigate("/auth")}
                  {...prefetch("/auth")}
                  className="rounded-lg border border-border py-2.5 text-sm font-medium text-foreground"
                >
                  {tx("Log in")}
                </button>
                <FancyButton onClick={() => navigate("/auth")} {...prefetch("/auth")}>
                  {tx("Start Creating")}
                </FancyButton>
              </>
            )}
          </div>
        </motion.div>
      )}
    </motion.nav>
  );
};

export default LandingNavbar;
