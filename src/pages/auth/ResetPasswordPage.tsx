/** @doc Request a password reset link via email. */
import { forceDarkTheme } from "@/lib/theme";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { m as motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff, Check } from "lucide-react";

import { sanitizeErrorMessage } from "@/lib/sanitizeError";
const ResetPasswordPage = () => {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [clipboardMenu, setClipboardMenu] = useState<{
    x: number;
    y: number;
    input: HTMLInputElement;
  } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => forceDarkTheme(), []);


  const openClipboardMenu = (input: HTMLInputElement, x: number, y: number) => {
    input.focus();
    setClipboardMenu({ x, y, input });
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };

  const handleReset = async () => {
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      toast.success("Password updated successfully!");
      setTimeout(() => navigate("/chat"), 2000);
    } catch (e: any) {
      toast.error(sanitizeErrorMessage(e, "Failed to update password"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (!pasted) return;
    e.preventDefault();
    e.stopPropagation();
    const input = e.currentTarget;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const nextValue = `${input.value.slice(0, start)}${pasted}${input.value.slice(end)}`;
    setPassword(nextValue);
    requestAnimationFrame(() => {
      const cursor = start + pasted.length;
      input.setSelectionRange(cursor, cursor);
    });
  };

  const handleClipboardPaste = async () => {
    if (!clipboardMenu) return;
    const pasted = await navigator.clipboard?.readText().catch(() => "");
    if (!pasted) {
      setClipboardMenu(null);
      return;
    }
    const input = clipboardMenu.input;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const nextValue = `${input.value.slice(0, start)}${pasted}${input.value.slice(end)}`;
    setPassword(nextValue);
    requestAnimationFrame(() =>
      input.setSelectionRange(start + pasted.length, start + pasted.length),
    );
    setClipboardMenu(null);
  };

  const handleClipboardCopy = async () => {
    const input = clipboardMenu?.input;
    if (!input) return;
    const value =
      input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? input.value.length) ||
      input.value;
    await navigator.clipboard?.writeText(value).catch(() => undefined);
    setClipboardMenu(null);
  };

  const Spinner = () => (
    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
  );

  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 -z-10 bg-[#0a0a0b]">
        <div className="absolute -top-1/3 left-1/2 -translate-x-1/2 w-[120vw] h-[80vh] max-w-[1200px] rounded-full bg-primary/[0.06] blur-[160px]" />
      </div>

      <div className="relative z-10 w-full px-6 py-6 max-w-[480px] mx-auto">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
          className="font-display text-xl font-black uppercase tracking-tight text-foreground"
        >
          MEGSY
        </a>
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center px-6 pb-16 pt-4 min-h-[calc(100vh-88px)]">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[400px]"
        >
          {done ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-full border border-foreground/15 flex items-center justify-center mx-auto mb-6">
                <Check className="w-5 h-5 text-foreground" strokeWidth={2.25} />
              </div>
              <h1 className="text-[22px] leading-[1.25] font-medium tracking-tight text-foreground">
                All set
              </h1>
              <p className="mt-2 text-[13px] text-foreground/50">Password updated. Redirecting…</p>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h1 className="text-[22px] leading-[1.25] font-medium tracking-tight text-foreground">
                  Choose a new password
                </h1>
                <p className="mt-2 text-[13px] text-foreground/50 leading-relaxed">
                  At least 8 characters.
                </p>
              </div>

              <div className="space-y-6">
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="New password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onPaste={handlePasswordPaste}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      openClipboardMenu(e.currentTarget, e.clientX, e.clientY);
                    }}
                    onPointerDown={(e) => {
                      if (e.pointerType !== "touch") return;
                      const input = e.currentTarget;
                      longPressTimerRef.current = window.setTimeout(
                        () => openClipboardMenu(input, e.clientX, e.clientY),
                        450,
                      );
                    }}
                    onPointerUp={clearLongPressTimer}
                    onPointerCancel={clearLongPressTimer}
                    onKeyDown={(e) => e.key === "Enter" && handleReset()}
                    autoFocus
                    autoComplete="new-password"
                    className="w-full bg-transparent border-0 border-b border-foreground/15 rounded-none px-0 py-3 pr-10 text-[15px] text-foreground placeholder:text-foreground/65 outline-none focus:border-foreground/70 transition-colors duration-200"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 text-foreground/65 hover:text-foreground/80 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  onClick={handleReset}
                  disabled={isSubmitting || password.length < 8}
                  className="w-full py-3 rounded-full bg-foreground text-background text-[14px] font-medium hover:bg-foreground/90 active:scale-[0.99] transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none">
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Spinner />
                      Updating…
                    </span>
                  ) : (
                    "Update password"
                  )}
                </button>
              </div>
              {clipboardMenu && (
                <div
                  className="fixed z-toast flex overflow-hidden rounded-xl border border-foreground/15 bg-popover/95 text-popover-foreground shadow-2xl backdrop-blur-xl"
                  style={{
                    left: `min(${clipboardMenu.x}px, calc(100vw - 168px))`,
                    top: `max(12px, ${clipboardMenu.y - 52}px)`,
                  }}
                >
                  <button
                    type="button"
                    onClick={handleClipboardCopy}
                    className="px-4 py-2.5 text-[13px] font-medium hover:bg-foreground/10"
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={handleClipboardPaste}
                    className="border-l border-foreground/10 px-4 py-2.5 text-[13px] font-medium hover:bg-foreground/10"
                  >
                    Paste
                  </button>
                </div>
              )}
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
