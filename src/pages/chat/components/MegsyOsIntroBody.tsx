import { m as motion } from "framer-motion";
import type { ComponentType } from "react";

export interface MegsyOsIntroBodyProps {
  onClose: () => void;
  isProPlusPlan: () => boolean;
  navigate: (path: string) => void;
  handleModeChange: (mode: any) => void;
  icons: {
    ChevronLeft: ComponentType<any>;
    FileText: ComponentType<any>;
    Globe: ComponentType<any>;
    Layers: ComponentType<any>;
    Timer: ComponentType<any>;
    Users: ComponentType<any>;
    X: ComponentType<any>;
  };
}

/**
 * Megsy OS intro — unified with the app's dark token-based design system.
 * Uses semantic tokens (background/foreground/card/border/primary/muted) so
 * it matches the rest of the chat surface in both light and dark themes.
 */
export default function MegsyOsIntroBody({
  onClose,
  isProPlusPlan,
  navigate,
  handleModeChange,
  icons,
}: MegsyOsIntroBodyProps) {
  const { ChevronLeft, FileText, Globe, Layers, Timer, Users, X } = icons;

  const features = [
    {
      t: "A FULL AI TEAM",
      role: "The crew",
      d: "Strategist, researcher, writer, designer & developer working in parallel on every task.",
      icon: Users,
    },
    {
      t: "REAL BROWSER",
      role: "The hands",
      d: "Signs into sites, fills forms, clicks buttons and uses live tools on your behalf — not just chat.",
      icon: Globe,
    },
    {
      t: "APPS & WEBSITES",
      role: "The builder",
      d: "Builds full-stack apps, deploys them online and sends the live link straight back to chat.",
      icon: Layers,
    },
    {
      t: "STUDIO OUTPUT",
      role: "The studio",
      d: "Studio-grade images, reports, decks and full business strategies ready to send to clients.",
      icon: FileText,
    },
    {
      t: "RUNS 24/7",
      role: "The engine",
      d: "Works in the background — close the app and come back to finished tasks waiting for you.",
      icon: Timer,
    },
  ] as const;

  const handleStart = () => {
    if (!isProPlusPlan()) {
      onClose();
      navigate("/pricing");
      return;
    }
    try {
      localStorage.setItem("megsy_os_intro_seen", "1");
    } catch {}
    onClose();
    handleModeChange("operator");
  };

  return (
    <>
      {/* ─── Mobile bottom sheet ─── */}
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        className="md:hidden fixed inset-0 z-[81] bg-background flex flex-col"
      >
        {/* Header */}
        <div className="shrink-0 px-4 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-4 border-b border-border/60 bg-background/95 backdrop-blur-md flex items-center gap-3">
          <button
            onClick={() => onClose()}
            aria-label="Back"
            className="w-10 h-10 -ml-2 rounded-full flex items-center justify-center text-foreground/90 hover:bg-accent hover:text-accent-foreground active:scale-95 transition"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-[14px] font-semibold text-foreground">Back</span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="px-6 pt-6 pb-3">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/60 bg-card/60">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="text-[10.5px] font-bold tracking-[0.22em] uppercase text-muted-foreground">
                MEGSY · OS
              </span>
            </span>
            <h2 className="mt-4 text-[38px] leading-[0.95] tracking-tight text-foreground font-bold">
              What Megsy{" "}
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                OS
              </span>{" "}
              can do.
            </h2>
            <p className="text-muted-foreground text-[13.5px] leading-relaxed mt-3">
              Your autonomous AI computer — swipe to see everything it ships for you.
            </p>
          </div>

          <div className="flex gap-3 overflow-x-auto pl-6 pr-6 pt-2 pb-6 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {features.map(({ t, d, role, icon: Icon }) => (
              <div
                key={role}
                className="shrink-0 w-[260px] snap-center flex flex-col rounded-2xl overflow-hidden border border-border/60 bg-card/70 backdrop-blur-sm p-5 gap-3"
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.18em] uppercase border border-border/60 bg-background/60 text-muted-foreground">
                    {role}
                  </span>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center border border-border/60 bg-background/60 text-primary">
                    <Icon className="w-5 h-5" strokeWidth={2.2} />
                  </div>
                </div>
                <h3 className="text-[22px] leading-[1.05] tracking-tight uppercase font-bold text-foreground mt-1">
                  {t}
                </h3>
                <p className="text-[12.5px] leading-relaxed text-muted-foreground">{d}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] border-t border-border/60 bg-background/95 backdrop-blur-md grid grid-cols-2 gap-3">
          <button
            onClick={() => onClose()}
            className="py-3.5 rounded-full bg-card/60 text-foreground border border-border/60 font-semibold text-[14px] hover:bg-accent hover:text-accent-foreground active:scale-[0.98] transition-all"
          >
            Maybe later
          </button>
          <button
            onClick={handleStart}
            className="py-3.5 bg-primary text-primary-foreground font-bold text-[14px] rounded-full hover:opacity-90 active:scale-[0.98] transition-all"
          >
            {isProPlusPlan() ? "Start Now →" : "Upgrade to Pro →"}
          </button>
        </div>
      </motion.div>

      {/* ─── Desktop: Hero + Grid ─── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 12 }}
        transition={{ type: "spring", stiffness: 280, damping: 28 }}
        className="hidden md:flex fixed inset-0 z-[81] items-center justify-center p-6 pointer-events-none"
      >
        <div
          className="pointer-events-auto relative w-full max-w-[1100px] max-h-[92vh] overflow-y-auto rounded-3xl border border-border/60 bg-background/95 backdrop-blur-xl shadow-2xl text-foreground"
          dir="ltr"
        >
          <button
            onClick={() => onClose()}
            aria-label="Close"
            className="absolute top-5 right-5 z-10 w-9 h-9 rounded-full flex items-center justify-center border border-border/60 bg-card/60 text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <X className="w-4 h-4" strokeWidth={2.2} />
          </button>

          {/* Hero */}
          <div className="relative px-14 pt-14 pb-10 text-center">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/60 bg-card/60">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="text-[10.5px] font-bold tracking-[0.22em] uppercase text-muted-foreground">
                MEGSY · OS
              </span>
            </span>
            <h2 className="mt-5 text-[56px] leading-[0.98] tracking-tight font-bold text-foreground">
              What Megsy{" "}
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                OS
              </span>{" "}
              can do.
            </h2>
            <p className="mx-auto mt-4 max-w-[560px] text-[14.5px] leading-relaxed text-muted-foreground">
              Your autonomous AI computer — a full team that browses, builds, designs and ships
              finished work straight to your chat, 24/7.
            </p>
            <div className="mt-7 flex items-center justify-center gap-3">
              <button
                onClick={() => onClose()}
                className="px-6 py-3 rounded-full text-[13.5px] font-semibold border border-border/60 bg-card/60 text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                Maybe later
              </button>
              <button
                onClick={handleStart}
                className="px-7 py-3 rounded-full text-[13.5px] font-bold bg-primary text-primary-foreground hover:opacity-90 transition-all"
              >
                {isProPlusPlan() ? "Start Now →" : "Upgrade to Pro →"}
              </button>
            </div>
          </div>

          {/* Grid */}
          <div className="relative px-10 pb-12 grid grid-cols-3 gap-4">
            {features.map(({ t, d, role, icon: Icon }, i) => (
              <motion.div
                key={role}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.08 + i * 0.06,
                  duration: 0.45,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className={`group relative rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm p-5 flex flex-col gap-3 overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-border ${i === 0 ? "col-span-2" : ""} ${i === 4 ? "col-span-2" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.18em] uppercase border border-border/60 bg-background/60 text-muted-foreground">
                    {role}
                  </span>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center border border-border/60 bg-background/60 text-primary">
                    <Icon className="w-5 h-5" strokeWidth={2.2} />
                  </div>
                </div>
                <h3 className="uppercase mt-1 text-[24px] leading-[1.02] tracking-tight font-bold text-foreground">
                  {t}
                </h3>
                <p className="text-[13px] leading-relaxed text-muted-foreground">{d}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </>
  );
}
