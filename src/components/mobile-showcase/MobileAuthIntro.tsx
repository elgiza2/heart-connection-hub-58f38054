/** @doc Mobile /auth intro — Screen 1 showcase design with inline email/password expansion. */
import { m as motion, AnimatePresence } from "framer-motion";
import { AlertCircle, ArrowRight, Eye, EyeOff } from "lucide-react";
import { useBrandLogo } from "@/hooks/useBrandLogo";
import { t as authT, useUserLang } from "@/lib/authI18n";

// Self-hosted, compressed hero clip (663KB mp4 / 1MB webm instead of the old
// 33MB 3328x2492 CDN file that never finished loading on mobile networks).
const AUTH_HERO_MP4 = "/route-assets/auth/auth-hero.mp4";
const AUTH_HERO_WEBM = "/route-assets/auth/auth-hero.webm";
const AUTH_HERO_POSTER = "/route-assets/auth/auth-hero-poster.jpg";
interface Props {
  onGoogle: () => void;
  onEmail: () => void;
  onTelegram?: () => void;

  // Inline expansion (optional — when provided, email button expands inline)
  expanded?: boolean;
  showPasswordField?: boolean;
  email?: string;
  setEmail?: (v: string) => void;
  password?: string;
  setPassword?: (v: string) => void;
  showPassword?: boolean;
  setShowPassword?: (v: boolean) => void;
  isSubmitting?: boolean;
  onSubmitEmail?: () => void;
  onSubmitPassword?: () => void;
  onForgotPassword?: () => void;
  error?: string | null;
}

export default function MobileAuthIntro({
  onGoogle,
  onEmail,
  onTelegram,
  expanded = false,
  showPasswordField = false,
  email = "",
  setEmail,
  password = "",
  setPassword,
  showPassword = false,
  setShowPassword,
  isSubmitting = false,
  onSubmitEmail,
  onSubmitPassword,
  onForgotPassword,
  error,
}: Props) {
  const lang = useUserLang();
  const isAr = lang === "ar-eg";
  const logo = useBrandLogo();
  const t = isAr
    ? {
        title1: "The AI platform",
        title2: "for everything you create",
        subtitle: "Chat, images, video, slides\nand complete projects in one place",
        google: "Continue with Google",
        email: "Continue with email",
        telegram: "Continue with Telegram",
        terms: "By continuing, you agree to the",
        termsLink: "Terms of Use",
        continue: "Continue",
        signIn: "Sign in",
        emailPlaceholder: "Email",
        passwordPlaceholder: "Password",
        forgot: "Forgot password?",
      }
    : {
        title1: "The AI stack for",
        title2: "everything you create",
        subtitle: "Chat, images, video, slides\nand full projects in one place",
        google: "Continue with Google",
        email: "Continue with email",
        telegram: "Continue with Telegram",
        terms: "By continuing, you agree to",
        termsLink: "Terms of Use",
        continue: "Continue",
        signIn: "Sign in",
        emailPlaceholder: "Email address",
        passwordPlaceholder: "Password",
        forgot: "Forgot password?",
      };

  const hasEmail = !!email?.trim();
  const hasPassword = !!password?.trim();
  const primaryReady = showPasswordField ? hasPassword : hasEmail;

  const handleEmailBtnClick = () => {
    if (!expanded) onEmail();
  };

  const submitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (showPasswordField) onSubmitPassword?.();
    else onSubmitEmail?.();
  };

  return (
    <div
      dir={"ltr"}
      className="relative min-h-[100dvh] w-full overflow-hidden bg-[#02040c] text-foreground"
      style={{ fontFamily: 'Inter, -apple-system, "SF Pro Text", system-ui, sans-serif', touchAction: "manipulation" }}
    >
      {/* Hero video — poster paints instantly, clip streams in behind it */}
      <video
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        poster={AUTH_HERO_POSTER}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: "center 48%", zIndex: 0 }}
      >
        <source src={AUTH_HERO_WEBM} type="video/webm" />
        <source src={AUTH_HERO_MP4} type="video/mp4" />
      </video>

      {/* Bottom fade overlay */}
      <div
        className="absolute inset-x-0 bottom-0 h-[54%] pointer-events-none"
        style={{
          zIndex: 1,
          background:
            "linear-gradient(to bottom, rgba(2,4,12,0) 0%, rgba(2,4,12,.35) 40%, rgba(2,4,12,.85) 78%, #02040c 100%)",
        }}
      />

      {/* Content pinned to bottom */}
      <div
        className="absolute inset-x-0 bottom-0 px-6 pb-10 pointer-events-auto"
        style={{ zIndex: 4, paddingBottom: "max(2.25rem, env(safe-area-inset-bottom, 0px))" }}
      >
        {/* Title */}
        <h1
          className="text-center text-foreground"
          style={{
            fontFamily: '"ITC Garamond Std Narrow", "Playfair Display", Garamond, serif',
            fontWeight: 300,
            fontSize: "42px",
            lineHeight: "1.08",
            letterSpacing: "0.2px",
            textShadow: "0 1px 2px rgba(0,0,0,.4)",
          }}
        >
          <span>{t.title1}</span>
          <br />
          <span style={{ fontStyle: "italic", fontWeight: 400 }}>
            {t.title2}
          </span>
        </h1>

        {/* Subtitle */}
        <p
          className="mt-4 text-center whitespace-pre-line text-foreground"
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: "14px",
            lineHeight: "22px",
          }}
        >
          {t.subtitle}
        </p>

        {/* Inline error notification */}
        <AnimatePresence>
          {error && (
            <motion.div
              key="mobile-auth-error"
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="mb-3 overflow-hidden"
            >
              <div className="flex items-center gap-2.5 rounded-xl border border-red-400/25 bg-red-500/10 px-3.5 py-3 backdrop-blur-md">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-300" />
                <p className="text-[13px] leading-[18px] text-foreground/90">{error}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* CTAs */}
        <form onSubmit={submitForm} noValidate className="mt-7 space-y-2.5">
          {/* Google button — collapses away when expanded */}
          <AnimatePresence initial={false}>
            {!expanded && (
              <motion.button
                key="google"
                type="button"
                onClick={onGoogle}
                initial={{ opacity: 0, height: 0, marginBottom: -10 }}
                animate={{ opacity: 1, height: 52, marginBottom: 0 }}
                exit={{ opacity: 0, height: 0, marginBottom: -10 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="theme-fixed w-full flex items-center justify-center gap-2.5 rounded-full bg-white text-background active:scale-[0.985] overflow-hidden"
                style={{ fontSize: "15px", fontWeight: 600, letterSpacing: "0.1px", touchAction: "manipulation" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                  <path fill="#EA4335" d="M12 5.04c1.94 0 3.66.67 5.02 1.98l3.72-3.72C18.42 1.19 15.44 0 12 0 7.32 0 3.26 2.7 1.28 6.62l4.36 3.38C6.66 7.06 9.14 5.04 12 5.04z"/>
                  <path fill="#4285F4" d="M23.54 12.28c0-.82-.08-1.62-.22-2.4H12v4.54h6.48c-.28 1.5-1.12 2.78-2.4 3.64l3.7 2.88c2.16-2 3.42-4.94 3.42-8.66z"/>
                  <path fill="#FBBC05" d="M5.64 14.42a7.1 7.1 0 010-4.84L1.28 6.2A11.98 11.98 0 000 12c0 1.94.46 3.78 1.28 5.4l4.36-2.98z"/>
                  <path fill="#34A853" d="M12 24c3.24 0 5.96-1.06 7.94-2.9l-3.7-2.88c-1.02.68-2.34 1.1-4.24 1.1-2.86 0-5.34-2.02-6.36-4.96L1.28 17.4C3.26 21.3 7.32 24 12 24z"/>
                </svg>
                <span>{t.google}</span>
              </motion.button>
            )}
          </AnimatePresence>

          {/* Email pill — morphs from button to input using shared layoutId */}
          <motion.div
            layout
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="w-full h-[52px] rounded-full overflow-hidden"
            style={{
              background: "var(--overlay-white-06)",
              border: "1px solid var(--overlay-white-14)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {!expanded ? (
                <motion.button
                  key="email-btn"
                  type="button"
                  onClick={handleEmailBtnClick}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="w-full h-full flex items-center justify-center gap-2 text-foreground active:scale-[0.985]"
                  style={{ fontSize: "15px", fontWeight: 500, letterSpacing: "0.1px", touchAction: "manipulation" }}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3" y="5" width="18" height="14" rx="2.5" />
                    <path d="M3.5 7.5l8.5 6 8.5-6" />
                  </svg>
                  <span>{t.email}</span>
                </motion.button>
              ) : (
                <motion.div
                  key="email-input"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22, ease: "easeOut", delay: 0.08 }}
                  className="w-full h-full px-5 flex items-center"
                >
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder={t.emailPlaceholder}
                    value={email}
                    onChange={(e) => setEmail?.(e.target.value)}
                    disabled={showPasswordField}
                    autoFocus
                    className="w-full bg-transparent outline-none text-[15px] text-foreground placeholder:text-foreground/65 disabled:opacity-70"
                    dir="ltr"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Password field — appears below email when needed */}
          <AnimatePresence initial={false}>
            {expanded && showPasswordField && (
              <motion.div
                key="password"
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: "auto", marginTop: 10 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                style={{ overflow: "hidden" }}
              >
                <div
                  className="rounded-full px-5 h-[52px] flex items-center gap-2"
                  style={{
                    background: "var(--overlay-white-06)",
                    border: "1px solid var(--overlay-white-14)",
                    backdropFilter: "blur(10px)",
                    WebkitBackdropFilter: "blur(10px)",
                  }}
                >
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder={t.passwordPlaceholder}
                    value={password}
                    onChange={(e) => setPassword?.(e.target.value)}
                    autoFocus
                    className="flex-1 bg-transparent outline-none text-[15px] text-foreground placeholder:text-foreground/65"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword?.(!showPassword)}
                    className="text-foreground/50 hover:text-foreground/80 transition-colors"
                    aria-label="toggle password"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex justify-end mt-2 px-1">
                  <button
                    type="button"
                    onClick={onForgotPassword}
                    className="text-[12px] text-foreground/60 hover:text-foreground/85 underline underline-offset-4 decoration-foreground/25 transition-colors"
                  >
                    {t.forgot}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Primary Continue / Sign in button — only when expanded */}
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.button
                key="primary"
                type="submit"
                disabled={isSubmitting || !primaryReady}
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: 52, marginTop: 10 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
                data-sunset={primaryReady ? "true" : undefined}
                className={`w-full flex items-center justify-center gap-2 active:scale-[0.985] transition-colors duration-300 disabled:opacity-50 overflow-hidden ${
                  primaryReady
                    ? "btn-sunset theme-fixed"
                    : "rounded-full bg-transparent text-foreground border border-foreground/30"
                }`}
                style={{ fontSize: "15px", fontWeight: 600, letterSpacing: "0.1px", touchAction: "manipulation" }}
              >
                {isSubmitting ? (
                  <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                ) : (
                  <>
                    {showPasswordField ? t.signIn : t.continue}
                    <ArrowRight className="w-4 h-4" strokeWidth={2} />
                  </>
                )}
              </motion.button>

            )}
          </AnimatePresence>

          {/* Tertiary — Telegram (only when collapsed) */}
          {!expanded && onTelegram && (
            <button
              type="button"
              onClick={onTelegram}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 transition"
              style={{ color: "rgba(255,255,255,0.55)", fontSize: "13px", fontWeight: 500, touchAction: "manipulation" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M9.78 15.27l-.4 4.02c.58 0 .83-.25 1.13-.55l2.71-2.59 5.62 4.11c1.03.57 1.77.27 2.04-.95l3.7-17.34h.01c.32-1.53-.55-2.13-1.55-1.76L1.36 9.36C-.13 9.94-.11 10.75 1.1 11.12l5.6 1.74 13-8.19c.61-.4 1.17-.18.71.22"/>
              </svg>
              <span>{t.telegram}</span>
            </button>
          )}
        </form>

        {/* Terms */}
        <p
          className="mt-5 text-center"
          style={{ fontSize: "11.5px", color: "rgba(255,255,255,.42)", letterSpacing: "0.1px" }}
        >
          {t.terms}{" "}
          <a href="/terms" style={{ color: "rgba(255,255,255,.78)" }} className="underline underline-offset-2 decoration-foreground/25">
            {t.termsLink}
          </a>
        </p>
      </div>

    </div>
  );
}
