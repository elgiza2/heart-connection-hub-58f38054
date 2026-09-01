/** @doc Language settings — English or Egyptian colloquial Arabic. Both ship inside the app bundle, so switching is instant. */
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import DesktopSettingsLayout from "@/components/settings/DesktopSettingsLayout";
import ProfileGlassShell from "@/components/profile/ProfileGlassShell";
import {
  AVAILABLE_LANGS,
  setUserLang,
  translateExactText,
  useUserLang,
  type AuthLang,
} from "@/lib/authI18n";

// Cartoony flag illustrations — twemoji SVGs rendered from regional-indicator codepoints.
const LANG_COUNTRY: Record<string, string> = { en: "gb", "ar-eg": "eg" };

function countryToTwemoji(cc: string): string {
  const a = cc.trim().toLowerCase();
  if (a.length !== 2) return "1f3f3"; // white flag fallback
  const cp = (c: string) => (0x1f1e6 + (c.charCodeAt(0) - 97)).toString(16);
  return `${cp(a[0])}-${cp(a[1])}`;
}
const flagUrl = (code: string) => {
  const cc = LANG_COUNTRY[code] ?? "";
  const cp = cc ? countryToTwemoji(cc) : "1f3f3";
  return `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${cp}.svg`;
};

function CartoonFlag({ code, size = 32 }: { code: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="grid place-items-center shrink-0 rounded-full overflow-hidden"
      style={{
        width: size,
        height: size,
        background: "var(--overlay-white-06)",
        border: "1px solid var(--overlay-white-10)",
        boxShadow: "0 3px 10px rgba(0,0,0,0.25)",
      }}
    >
      <img
        decoding="async"
        src={flagUrl(code)}
        alt=""
        loading="lazy"
        className="w-full h-full"
        style={{ objectFit: "cover", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}
      />
    </span>
  );
}

export default function LanguagePage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const lang = useUserLang();
  const tx = (s: string) => translateExactText(s, lang);

  const pick = async (code: AuthLang) => {
    await setUserLang(code);
    toast.success(tx("Language updated"));
  };

  const Intro = !isMobile && (
    <header className="mb-8">
      <h1 className="text-[28px] font-semibold tracking-tight">{tx("Language")}</h1>
    </header>
  );

  const Content = (
    <section className="mt-6 pb-4">
      <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] overflow-hidden divide-y divide-foreground/[0.06]">
        {AVAILABLE_LANGS.map((l) => (
          <LangRow key={l.code} lang={l} active={lang === l.code} onPick={pick} />
        ))}
      </div>
    </section>
  );

  if (isMobile) {
    return (
      <ProfileGlassShell
        title={tx("Language")}
        subtitle={tx("Pick how Megsy talks to you.")}
        onBack={() => navigate("/settings")}
      >
        {Content}
      </ProfileGlassShell>
    );
  }
  return (
    <DesktopSettingsLayout>
      <div className="mx-auto w-full max-w-2xl px-4 md:px-0">
        {Intro}
        {Content}
      </div>
    </DesktopSettingsLayout>
  );
}

function LangRow({
  lang,
  active,
  onPick,
}: {
  lang: { code: string; label: string; native: string };
  active: boolean;
  onPick: (code: AuthLang) => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.985 }}
      onClick={() => onPick(lang.code as AuthLang)}
      className={`w-full text-left flex items-center gap-3 px-4 py-3 transition-colors ${
        active ? "bg-foreground/[0.05]" : "hover:bg-foreground/[0.03]"
      }`}
    >
      <CartoonFlag code={lang.code} size={28} />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium truncate">{lang.native}</p>
        <p className="text-[11.5px] text-foreground/50 truncate">{lang.label}</p>
      </div>
      {active && <Check className="w-4 h-4 text-foreground/80 shrink-0" />}
    </motion.button>
  );
}
