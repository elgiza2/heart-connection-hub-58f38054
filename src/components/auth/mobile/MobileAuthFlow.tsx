/** @doc Mobile auth flow (email + password) — matches MobileAuthIntro visual language. */
import { m as motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Eye, EyeOff } from "lucide-react";
import { t as authT, useUserLang } from "@/lib/authI18n";

type Screen = "intro" | "email";

interface Props {
  screen: Screen;
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  isSubmitting: boolean;
  showPasswordField: boolean;
  onNextIntro: () => void;
  onStartCreating: () => void;
  onGoogle: () => void;
  onGitHub: () => void;
  onTelegram: () => void;
  onEmail: () => void;
  onBack: () => void;
  onSubmitEmail: () => void;
  onSubmitPassword: () => void;
  onForgotPassword: () => void;
  onSwitchToCreate: () => void;
}

const FONT_SERIF = '"ITC Garamond Std Narrow", "Playfair Display", Garamond, serif';
const FONT_SANS = 'Inter, -apple-system, "SF Pro Text", system-ui, sans-serif';

const TopBar = ({ onBack, showBack }: { onBack?: () => void; showBack?: boolean }) => (
  <div className="relative z-10 px-6 pt-8 flex items-center justify-between safe-top">
    {showBack ? (
      <button
        onClick={onBack}
        aria-label={authT("back")}
        className="mt-4 w-9 h-9 rounded-full grid place-items-center text-foreground/85 active:scale-95 transition-transform"
        style={{
          background: "var(--overlay-white-06)",
          border: "1px solid var(--overlay-white-12)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        <ArrowLeft className="w-4 h-4" strokeWidth={1.9} />
      </button>
    ) : (
      <div className="w-9 h-9" />
    )}
    <div className="w-9 h-9" />
  </div>
);

export default function MobileAuthFlow(p: Props) {
  useUserLang();

  return (
    <div
      className="relative min-h-[100dvh] w-full overflow-hidden text-foreground bg-background"
      style={{ fontFamily: FONT_SANS }}
    >
      {/* Subtle radial glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 60% at 50% 0%, rgba(120,140,220,0.10) 0%, rgba(2,4,12,0) 60%)",
        }}
      />

      <AnimatePresence mode="wait">
        {p.screen === "email" && (
          <motion.div
            key="email"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="relative z-10 flex flex-col min-h-[100dvh]"
          >
            <TopBar showBack onBack={p.onBack} />

            <div className="flex-1 flex flex-col justify-center px-6">
              <div className="w-full max-w-sm mx-auto mb-8 text-center">
                <h1
                  className="text-foreground"
                  style={{
                    fontFamily: FONT_SERIF,
                    fontWeight: 300,
                    fontSize: "38px",
                    lineHeight: "1.08",
                    letterSpacing: "0.2px",
                  }}
                >
                  {p.showPasswordField ? authT("passwordTitle") : authT("emailTitle")}
                </h1>
                <p
                  className="mt-3"
                  style={{
                    fontSize: "14px",
                    lineHeight: "22px",
                    color: "rgba(255,255,255,.62)",
                  }}
                >
                  {p.showPasswordField ? p.email : authT("emailSub")}
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (p.showPasswordField) p.onSubmitPassword();
                  else p.onSubmitEmail();
                }}
                className="space-y-3 w-full max-w-sm mx-auto"
              >
                {/* Email */}
                <div
                  className="rounded-2xl px-4 h-[52px] flex items-center"
                  style={{
                    background: "var(--overlay-white-05)",
                    border: "1px solid var(--overlay-white-12)",
                    backdropFilter: "blur(10px)",
                    WebkitBackdropFilter: "blur(10px)",
                  }}
                >
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder={authT("emailPlaceholder")}
                    value={p.email}
                    onChange={(e) => p.setEmail(e.target.value)}
                    disabled={p.showPasswordField}
                    className="auth-input-white w-full bg-transparent outline-none text-[15px] !text-foreground placeholder:!text-foreground/65 disabled:opacity-70"
                  />
                </div>

                <AnimatePresence>
                  {p.showPasswordField && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: "auto" }}
                      exit={{ opacity: 0, y: -6, height: 0 }}
                      transition={{ duration: 0.22 }}
                    >
                      <div
                        className="rounded-2xl px-4 h-[52px] flex items-center gap-2"
                        style={{
                          background: "var(--overlay-white-05)",
                          border: "1px solid var(--overlay-white-12)",
                          backdropFilter: "blur(10px)",
                          WebkitBackdropFilter: "blur(10px)",
                        }}
                      >
                        <input
                          type={p.showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          placeholder="••••••••••"
                          value={p.password}
                          onChange={(e) => p.setPassword(e.target.value)}
                          autoFocus
                          className="auth-input-white flex-1 bg-transparent outline-none text-[15px] !text-foreground placeholder:!text-foreground/65"
                        />
                        <button
                          type="button"
                          onClick={() => p.setShowPassword(!p.showPassword)}
                          className="text-foreground/50 hover:text-foreground/80 transition-colors"
                          aria-label="toggle password"
                        >
                          {p.showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <div className="flex justify-end mt-2 px-1">
                        <button
                          type="button"
                          onClick={p.onForgotPassword}
                          className="text-[12px] text-foreground/55 hover:text-foreground/85 underline underline-offset-4 decoration-foreground/20 transition-colors"
                        >
                          {authT("forgotPasswordQ")}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Primary button — white when filled, outlined when empty */}
                {(() => {
                  const hasEmail = !!p.email?.trim();
                  return (
                    <button
                      type="submit"
                      disabled={p.isSubmitting || !p.email}
                      className={`w-full h-[52px] rounded-full flex items-center justify-center gap-2 active:scale-[0.985] transition-colors duration-300 disabled:opacity-50 ${
                        hasEmail
                          ? "theme-fixed bg-white text-background border border-white"
                          : "bg-transparent text-foreground border border-foreground/30"
                      }`}
                      style={{ fontSize: "15px", fontWeight: 600, letterSpacing: "0.1px" }}
                    >
                      {p.isSubmitting ? (
                        <span className={`w-4 h-4 border-2 ${hasEmail ? "border-background" : "border-white"} border-t-transparent rounded-full animate-spin`} />
                      ) : (
                        <>
                          {p.showPasswordField ? authT("signIn") : authT("continue")}
                          <ArrowRight className="w-4 h-4" strokeWidth={2} />
                        </>
                      )}
                    </button>
                  );
                })()}

              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
