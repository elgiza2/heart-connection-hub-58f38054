/** @doc Sign in / sign up — email, Google, Apple and MFA challenge entry. */
import { forceDarkTheme } from "@/lib/theme";
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { m as motion, AnimatePresence } from "framer-motion";
import AppleSignInButton from "@/components/auth/AppleSignInButton";
import { supabase } from "@/integrations/supabase/client";
import { invokeFunction } from "@/lib/supabaseFunction";
import { toast } from "sonner";
import { Eye, EyeOff, ArrowLeft, ArrowRight, Check, Play } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { setPayRegion, getPayRegionOrGuess, type PayRegion } from "@/lib/payRegion";
import SEOHead from "@/components/common/SEOHead";
import { useIsMobile } from "@/hooks/use-mobile";
import MobileAuthIntro from "@/components/mobile-showcase/MobileAuthIntro";
import MobileAuthFlow from "@/components/auth/mobile/MobileAuthFlow";
import MobileAuthExtras from "@/components/auth/mobile/MobileAuthExtras";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { usePrefetchOnIdle } from "@/hooks/usePrefetchOnIdle";

import { t as authT, tf as authTf, translateAuthError, useUserLang } from "@/lib/authI18n";
import { safeInternalPath } from "@/lib/security/safeRedirect";

import { getMfaRedirect } from "@/lib/mfa";
import { pathForZone } from "@/lib/zoneRouting";
import {
  emailSchema,
  passwordSchema,
  passwordLoginSchema,
  firstError,
} from "@/lib/validation/schemas";
import { useRateLimit } from "@/lib/guards/rateLimiter";

// Self-hosted compressed hero clip (see MobileAuthIntro) — the old 33MB CDN
// file was too large to ever start playing on real connections.
const AUTH_HERO_MP4 = "/route-assets/auth/auth-hero.mp4";
const AUTH_HERO_WEBM = "/route-assets/auth/auth-hero.webm";
const AUTH_HERO_POSTER = "/route-assets/auth/auth-hero-poster.jpg";
const AUTH_ASSET_BASE = "/route-assets/auth";

type Step =
  | "intro1"
  | "email"
  | "password"
  | "otp-signup"
  | "set-password"
  | "otp-2fa"
  | "forgot-password"
  | "otp-reset"
  | "reset-password";
type ClipboardField = { name: "email" | "password" | "newPassword" | "otp"; otpIndex?: number };
type ClipboardMenuState = { x: number; y: number; field: ClipboardField; input: HTMLInputElement };

const AuthPage = () => {
  // Subscribe to language changes so the whole page re-translates live.
  const uiLang = useUserLang();
  void uiLang;
  // While the user fills the sign-in form, quietly prefetch /chat and /library
  // so the first authenticated navigation is instant.
  usePrefetchOnIdle(["/chat", "/library"], 2000);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  // Chosen on the welcome screen; fall back to auto-detection on direct /auth.
  const [region] = useState<PayRegion>(() => getPayRegionOrGuess());
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [otpValues, setOtpValues] = useState(["", "", "", "", "", ""]);
  const [verifiedResetCode, setVerifiedResetCode] = useState("");
  const isMobile = useIsMobile();
  const [step, setStep] = useState<Step>(() =>
    typeof window !== "undefined" && window.innerWidth < 768 ? "intro1" : "email",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mobileError, setMobileError] = useState<string | null>(null);
  const mobileIntroSteps: Step[] = ["intro1", "email", "password"];
  const isMobileIntroStep = (s: Step) => isMobile && mobileIntroSteps.includes(s);

  // Auth errors are shown inline (next to the form) on every viewport — a
  // toast alone disappears before the user can react to it.
  const notifyMobileIntroError = (msg: string) => {
    setMobileError(msg);
    if (!isMobileIntroStep(step)) toast.error(msg);
  };

  const clearMobileError = () => setMobileError(null);
  const setEmailClear = (v: string) => { setEmail(v); clearMobileError(); };
  const setPasswordClear = (v: string) => { setPassword(v); clearMobileError(); };

  useEffect(() => {
    clearMobileError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  const [countdown, setCountdown] = useState(0);
  const [userExists, setUserExists] = useState(false);
  const [has2FA, setHas2FA] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [mobileImgIndex, setMobileImgIndex] = useState(0);
  const mobileImages = [
    `${AUTH_ASSET_BASE}/mobile-1.webp`,
    `${AUTH_ASSET_BASE}/mobile-2.webp`,
    `${AUTH_ASSET_BASE}/mobile-3.webp`,
  ];
  useEffect(() => {
    const id = setInterval(() => setMobileImgIndex((i) => (i + 1) % 3), 4500);
    return () => clearInterval(id);
  }, []);
  const [clipboardMenu, setClipboardMenu] = useState<ClipboardMenuState | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const clipboardMenuRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(window.location.search);
  // SECURITY: only accept same-origin relative paths as post-auth redirect.
  // Absolute URLs, protocol-relative URLs and non-http schemes are stripped
  // so `?redirect=https://evil.com` can no longer phish OAuth tokens.
  const redirectUrl = safeInternalPath(searchParams.get("redirect"));

  const invokeAuth = (body: Record<string, unknown>) =>
    invokeFunction("openrouter-media", { body: { kind: "auth", ...body } });

  // Referral code — auto-fill from ?ref= query or from localStorage (captured at /ref/:code)
  const [referralCode, setReferralCode] = useState<string>(() => {
    try {
      const fromQuery = searchParams.get("ref");
      if (fromQuery) return fromQuery.trim().toUpperCase().slice(0, 64);
      const raw = localStorage.getItem("megsy_referral_code");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.code && typeof parsed.code === "string") {
          return parsed.code.trim().toUpperCase().slice(0, 64);
        }
      }
    } catch {}
    return "";
  });
  const [showReferralField, setShowReferralField] = useState<boolean>(!!referralCode);

  useEffect(() => forceDarkTheme(), []);


  useEffect(() => {
    const closeMenu = (event: PointerEvent) => {
      if (clipboardMenuRef.current?.contains(event.target as Node)) return;
      setClipboardMenu(null);
    };
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, []);

  const startCountdown = () => {
    setCountdown(60);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Client-side rate limits: protect users (and the backend) from spamming
  // the same action — accidentally or otherwise.
  const checkEmailLimit = useRateLimit(5, 30_000);
  const passwordLoginLimit = useRateLimit(8, 60_000);

  const handleCheckEmail = async () => {
    if (isSubmitting) return;
    clearMobileError();
    const parsed = emailSchema.safeParse(email);
    const err = firstError(parsed);
    if (err || !parsed.success) {
      notifyMobileIntroError(err ?? authT("invalidEmail"));
      return;
    }
    const normalizedEmail = parsed.data.toLowerCase();
    const gate = checkEmailLimit();
    if (!gate.allow) {
      notifyMobileIntroError(`Too many attempts. Try again in ${Math.ceil(gate.resetMs / 1000)}s.`);
      return;
    }
    setIsSubmitting(true);

    try {
      const { data, error } = await invokeAuth({ action: "check-email", email: normalizedEmail });
      if (error) throw error;
      if (data.exists) {
        setUserExists(true);
        setHas2FA(data.two_factor_enabled);
        setStep("password");
      } else {
        setUserExists(false);
        await sendOTP(normalizedEmail, true);
        setStep("otp-signup");
      }
    } catch (e: any) {
      const msg = String(e?.message || "");
      const isNetwork = /failed to (send|fetch)|network|load failed|networkerror|internal_error|non-2xx|status code 5\d\d|edge function returned 5\d\d/i.test(msg);
      if (isNetwork) {
        // Preview proxy can block account lookup. Try sending the OTP — if it
        // succeeds we treat this as a new-account flow. If it also fails, fall
        // back to the password screen so existing users can still sign in.
        try {
          await sendOTP(normalizedEmail, true);
          setUserExists(false);
          setHas2FA(false);
          setStep("otp-signup");
        } catch {
          setUserExists(true);
          setHas2FA(false);
          setStep("password");
          toast.message(authT("continueWithPassword"), {
            description:
              "Preview proxy blocked account lookup. Existing users can sign in here; works fully on the published site.",
          });
        }
      } else {
        notifyMobileIntroError(translateAuthError(e, "couldNotCheckEmail"));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const sendOTP = async (targetEmail?: string, _allowCreate = false) => {
    const normalizedEmail = (targetEmail || email).trim().toLowerCase();
    setIsSubmitting(true);
    try {
      const { data, error } = await invokeAuth({ action: "send-otp", email: normalizedEmail });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Failed to send code");
      toast.success(authT("otpSent"));
      startCountdown();
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (e: any) {
      toast.error(translateAuthError(e, "couldNotSendCode"));
      throw e;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordLogin = async () => {
    if (isSubmitting) return;
    clearMobileError();
    const pwParsed = passwordLoginSchema.safeParse(password);
    const pwErr = firstError(pwParsed);
    if (pwErr || !pwParsed.success) {
      notifyMobileIntroError(pwErr ?? "Enter your password");
      return;
    }
    const gate = passwordLoginLimit();
    if (!gate.allow) {
      notifyMobileIntroError(`Too many sign-in attempts. Wait ${Math.ceil(gate.resetMs / 1000)}s.`);
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) throw error;
      const mfa = await getMfaRedirect(redirectUrl || pathForZone("/chat", window.location.pathname));
      if (mfa) {
        navigate(mfa);
        return;
      }
      if (redirectUrl) window.location.href = redirectUrl;
      else navigate(pathForZone("/chat", window.location.pathname));
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (/failed to (send|fetch)|network|load failed|networkerror/i.test(msg)) {
        if (isMobileIntroStep(step)) {
          setMobileError(authT("previewProxyBlocked"));
        } else {
          toast.error(authT("previewProxyBlocked"), {
            action: {
              label: "Open",
              onClick: () => {
                window.location.href = "https://cherish-nexus.lovable.app/auth";
              },
            },
          });
        }
      } else if (/invalid login|invalid credentials|user not found/i.test(msg)) {
        if (userExists) {
          notifyMobileIntroError(authT("wrongPassword"));
        } else {
          const noAccountMsg = authT("noAccountFound");
          if (isMobileIntroStep(step)) setMobileError(noAccountMsg);
          else toast.message(noAccountMsg);
          try {
            await sendOTP(undefined, true);
            setStep("otp-signup");
          } catch {
            notifyMobileIntroError(translateAuthError(e, "loginFailed"));
          }
        }
      } else {
        notifyMobileIntroError(translateAuthError(e, "loginFailed"));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newValues = [...otpValues];
    newValues[index] = value.slice(-1);
    setOtpValues(newValues);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
    if (newValues.every((v) => v !== "") && newValues.join("").length === 6)
      handleVerifyOTP(newValues.join(""));
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otpValues[index] && index > 0)
      inputRefs.current[index - 1]?.focus();
  };

  const handleTextPaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    update: (value: string) => void,
  ) => {
    const pasted = e.clipboardData.getData("text");
    if (!pasted) return;
    e.preventDefault();
    e.stopPropagation();
    const input = e.currentTarget;
    const supportsSelection = !["email", "number"].includes(input.type);
    const start = supportsSelection
      ? (input.selectionStart ?? input.value.length)
      : input.value.length;
    const end = supportsSelection ? (input.selectionEnd ?? input.value.length) : input.value.length;
    const nextValue = `${input.value.slice(0, start)}${pasted}${input.value.slice(end)}`;
    update(nextValue);
    requestAnimationFrame(() => {
      if (!supportsSelection) return;
      const cursor = start + pasted.length;
      try {
        input.setSelectionRange(cursor, cursor);
      } catch {}
    });
  };

  const replaceTextSelection = (
    input: HTMLInputElement,
    pasted: string,
    update: (value: string) => void,
  ) => {
    const supportsSelection = !["email", "number"].includes(input.type);
    const start = supportsSelection
      ? (input.selectionStart ?? input.value.length)
      : input.value.length;
    const end = supportsSelection ? (input.selectionEnd ?? input.value.length) : input.value.length;
    const nextValue = `${input.value.slice(0, start)}${pasted}${input.value.slice(end)}`;
    update(nextValue);
    requestAnimationFrame(() => {
      const cursor = start + pasted.length;
      input.focus();
      if (!supportsSelection) return;
      try {
        input.setSelectionRange(cursor, cursor);
      } catch {}
    });
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };

  const openClipboardMenu = (
    input: HTMLInputElement,
    field: ClipboardField,
    x: number,
    y: number,
  ) => {
    input.focus();
    setClipboardMenu({ x, y, field, input });
  };

  const clipboardProps = (field: ClipboardField) => ({
    onContextMenu: (e: React.MouseEvent<HTMLInputElement>) => {
      e.preventDefault();
      openClipboardMenu(e.currentTarget, field, e.clientX, e.clientY);
    },
    onPointerDown: (e: React.PointerEvent<HTMLInputElement>) => {
      if (e.pointerType !== "touch") return;
      const input = e.currentTarget;
      longPressTimerRef.current = window.setTimeout(
        () => openClipboardMenu(input, field, e.clientX, e.clientY),
        450,
      );
    },
    onPointerUp: clearLongPressTimer,
    onPointerCancel: clearLongPressTimer,
  });

  const handleClipboardPaste = async () => {
    if (!clipboardMenu) return;
    const pasted = await navigator.clipboard?.readText().catch(() => "");
    if (!pasted) {
      setClipboardMenu(null);
      return;
    }
    if (clipboardMenu.field.name === "email")
      replaceTextSelection(clipboardMenu.input, pasted, setEmail);
    if (clipboardMenu.field.name === "password")
      replaceTextSelection(clipboardMenu.input, pasted, setPassword);
    if (clipboardMenu.field.name === "newPassword")
      replaceTextSelection(clipboardMenu.input, pasted, setNewPassword);
    if (clipboardMenu.field.name === "otp")
      handleOtpTextPaste(pasted, clipboardMenu.field.otpIndex ?? 0);
    setClipboardMenu(null);
  };

  const handleClipboardCopy = async () => {
    const input = clipboardMenu?.input;
    if (!input) return;
    const supportsSelection = !["email", "number"].includes(input.type);
    const value = supportsSelection
      ? input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? input.value.length) ||
        input.value
      : input.value;
    await navigator.clipboard?.writeText(value).catch(() => undefined);
    setClipboardMenu(null);
  };

  const handleOtpTextPaste = (text: string, startIndex: number) => {
    const pasted = text.replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const newValues = [...otpValues];
    pasted.split("").forEach((digit, offset) => {
      const targetIndex = startIndex + offset;
      if (targetIndex < newValues.length) newValues[targetIndex] = digit;
    });
    setOtpValues(newValues);
    const nextEmptyIndex = newValues.findIndex((digit) => !digit);
    if (newValues.every(Boolean)) handleVerifyOTP(newValues.join(""));
    else inputRefs.current[nextEmptyIndex === -1 ? 5 : nextEmptyIndex]?.focus();
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>, startIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    handleOtpTextPaste(e.clipboardData.getData("text"), startIndex);
  };

  const handleVerifyOTP = async (code: string) => {
    setIsSubmitting(true);
    try {
      const { data, error } = await invokeAuth({
        action: "verify-otp",
        email: email.trim().toLowerCase(),
        code,
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Invalid code");

      if (step === "otp-2fa") {
        if (redirectUrl) window.location.href = redirectUrl;
        else navigate(pathForZone("/chat", window.location.pathname));
      } else if (step === "otp-reset") {
        setVerifiedResetCode(code);
        setStep("reset-password");
      } else {
        setStep("set-password");
      }
    } catch (e: any) {
      toast.error(translateAuthError(e, "verificationFailed"));
      setOtpValues(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAccount = async () => {
    if (isSubmitting) return;
    const pwParsed = passwordSchema.safeParse(newPassword);
    const pwErr = firstError(pwParsed);
    if (pwErr || !pwParsed.success) {
      toast.error(pwErr ?? authT("passwordMinLength"));
      return;
    }
    setIsSubmitting(true);

    try {
      const cleanReferral = referralCode.trim().toUpperCase().slice(0, 64) || null;

      const normalizedEmail = email.trim().toLowerCase();
      setPayRegion(region);
      const { data, error } = await invokeAuth({
        action: "signup",
        email: normalizedEmail,
        password: newPassword,
      });
      if (error) throw new Error(error.message);

      // Account already exists (e.g. preview proxy skipped check-email and routed
      // an existing user into signup). Try signing them in instead; otherwise
      // bounce them back to the password screen with a friendly message.
      if (!data?.success && /already exists/i.test(String(data?.error || ""))) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: newPassword,
        });
        if (!signInErr) {
          const mfa = await getMfaRedirect(redirectUrl || pathForZone("/chat", window.location.pathname));
          if (mfa) {
            navigate(mfa);
            return;
          }
          if (redirectUrl) window.location.href = redirectUrl;
          else navigate(pathForZone("/chat", window.location.pathname));
          return;
        }
        setUserExists(true);
        setStep("password");
        setPassword("");
        toast.message(authT("emailExists"), {
          description: authT("emailExistsDesc"),
        });
        return;
      }

      if (!data?.success) throw new Error(data?.error || "Could not create account");

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: newPassword,
      });
      if (signInErr) throw signInErr;

      if (cleanReferral) {
        try {
          const { data: u } = await supabase.auth.getUser();
          if (u?.user?.id) {
            // Mark the click as converted
            const { data: lastClick } = await supabase
              .from("referral_clicks")
              .select("id")
              .eq("code", cleanReferral)
              .is("converted_user_id", null)
              .order("created_at", { ascending: false })
              .limit(1);
            if (lastClick && lastClick.length > 0) {
              await supabase
                .from("referral_clicks")
                .update({
                  converted_user_id: u.user.id,
                  converted_at: new Date().toISOString(),
                })
                .eq("id", lastClick[0].id);
            }

            // Claim the signup: creates referrals row + grants 15 free credits
            // (server-side validates email confirmation, blocks self/duplicate).
            const { data: claim } = await supabase.rpc("claim_referral_signup", {
              p_code: cleanReferral,
            });
            if ((claim as any)?.ok && (claim as any)?.credits_granted) {
              toast.success(authT("freeCreditsAdded"));
            }
          }
        } catch {}
      }

      try {
        localStorage.removeItem("megsy_referral_code");
      } catch {}
      toast.success(authT("accountCreated"));
      if (redirectUrl) window.location.href = redirectUrl;
      else navigate(pathForZone("/chat", window.location.pathname));
    } catch (e: any) {
      toast.error(translateAuthError(e, "couldNotCreate"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (isSubmitting) return;
    const pwParsed = passwordSchema.safeParse(newPassword);
    const pwErr = firstError(pwParsed);
    if (pwErr || !pwParsed.success) {
      toast.error(pwErr ?? authT("passwordMinLength"));
      return;
    }
    setIsSubmitting(true);

    try {
      void verifiedResetCode;
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error } = await invokeAuth({
        action: "update-password",
        email: normalizedEmail,
        password: newPassword,
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Failed to update password");

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: newPassword,
      });
      if (signInErr) throw signInErr;
      toast.success(authT("passwordUpdated"));
      navigate(pathForZone("/chat", window.location.pathname));
    } catch (e: any) {
      toast.error(translateAuthError(e, "passwordUpdateFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    try {
      await sendOTP(undefined, false);
      setStep("otp-reset");
    } catch {}
  };

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectUrl || window.location.origin + pathForZone("/chat", window.location.pathname) },
    });
  };
  const handleGitHubLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: redirectUrl || window.location.origin + pathForZone("/chat", window.location.pathname) },
    });
  };



  const resetFlow = () => {
    setStep("email");
    setPassword("");
    setNewPassword("");
    setOtpValues(["", "", "", "", "", ""]);
  };

  // Step meta — minimal, clean copy
  const stepMeta: Record<
    Step,
    { title: string; sub: string; index: number; total: number; label: string }
  > = {
    intro1: { title: "", sub: "", index: 1, total: 1, label: authT("getStarted") },
    email: {
      title: authT("emailTitle"),
      sub: authT("emailSub"),
      index: 1,
      total: 2,
      label: authT("signIn"),
    },
    password: { title: authT("passwordTitle"), sub: email, index: 2, total: 2, label: authT("signIn") },
    "otp-signup": {
      title: authT("verifyEmailTitle"),
      sub: authTf("otpSubTemplate", { email }),
      index: 2,
      total: 3,
      label: authT("createAccount"),
    },
    "set-password": {
      title: authT("setPasswordTitle"),
      sub: authT("atLeast8"),
      index: 3,
      total: 3,
      label: authT("createAccount"),
    },
    "otp-2fa": {
      title: authT("twoFATitle"),
      sub: authTf("otp2faSubTemplate", { email }),
      index: 2,
      total: 2,
      label: authT("signIn"),
    },
    "forgot-password": {
      title: authT("forgotTitle"),
      sub: authTf("forgotSubTemplate", { email }),
      index: 1,
      total: 3,
      label: authT("resetPassword"),
    },
    "otp-reset": {
      title: authT("verifyEmailTitle"),
      sub: authTf("otp2faSubTemplate", { email }),
      index: 2,
      total: 3,
      label: authT("resetPassword"),
    },
    "reset-password": {
      title: authT("chooseNewPasswordTitle"),
      sub: authT("atLeast8"),
      index: 3,
      total: 3,
      label: authT("resetPassword"),
    },
  };

  const isOtpStep = step === "otp-signup" || step === "otp-2fa" || step === "otp-reset";
  const showBack = step !== "email" || isMobile;
  const handleBack = () => {
    if (isMobile && step === "email") setStep("intro1");
    else resetFlow();
  };
  const meta = stepMeta[step];

  const Spinner = () => (
    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
  );

  // Borderless input — only a thin bottom rule, no fill
  const inputCls =
    "auth-input-white w-full bg-transparent border-0 border-b border-foreground/15 rounded-none px-0 py-3 text-[15px] text-start !text-foreground placeholder:!text-foreground/65 outline-none focus:border-foreground/70 transition-colors duration-200";

  // Primary CTA — white only after the related field has text.
  const btnCls = (hasValue: boolean) =>
    `w-full py-3 rounded-full border text-[14px] font-semibold active:scale-[0.97] transition-[transform,border-color,background-color,color,opacity] duration-[280ms] [transition-timing-function:cubic-bezier(0.34,1.35,0.64,1)] disabled:opacity-50 disabled:pointer-events-none will-change-transform ${
      hasValue
        ? "theme-fixed bg-white text-background border-white hover:bg-foreground/90"
        : "bg-transparent text-foreground border-foreground/30"
    }`;

  // Secondary — bare outline pill with iOS press
  const socialCls =
    "w-full flex items-center justify-center gap-2.5 py-3 rounded-full border border-foreground/15 bg-transparent text-foreground/90 text-[14px] font-medium hover:border-foreground/40 hover:bg-foreground/[0.03] active:scale-[0.97] transition-[transform,border-color,background-color] duration-[280ms] [transition-timing-function:cubic-bezier(0.34,1.35,0.64,1)] will-change-transform";

  // ─── Mobile intro — inline expandable email/password flow ──
  if (isMobile && (step === "intro1" || step === "email" || step === "password")) {
    const isExpanded = step === "email" || step === "password";
    return (
      <>
        <SEOHead
          title={authT("seoTitle")}
          description={authT("seoDesc")}
          path="/auth"
          noindex
        />
        <MobileAuthIntro
          onGoogle={handleGoogleLogin}
          onEmail={() => setStep("email")}
          onTelegram={undefined}
          expanded={isExpanded}
          showPasswordField={step === "password"}
          email={email}
          setEmail={setEmailClear}
          password={password}
          setPassword={setPasswordClear}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          isSubmitting={isSubmitting}
          onSubmitEmail={handleCheckEmail}
          onSubmitPassword={handlePasswordLogin}
          onForgotPassword={() => setStep("forgot-password")}
          error={mobileError}
        />
      </>
    );
  }

  // ─── Mobile: OTP / set-password / reset-password / forgot-password ─────
  if (
    isMobile &&
    (step === "otp-signup" ||
      step === "otp-2fa" ||
      step === "otp-reset" ||
      step === "set-password" ||
      step === "reset-password" ||
      step === "forgot-password")
  ) {
    return (
      <>
        <SEOHead
          title={authT("seoTitle")}
          description={authT("seoDesc")}
          path="/auth"
          noindex
        />
        <MobileAuthExtras
          screen={step}
          email={email}
          otpValues={otpValues}
          onOtpChange={handleOtpChange}
          onOtpKeyDown={handleOtpKeyDown}
          onOtpPaste={handleOtpPaste}
          newPassword={newPassword}
          setNewPassword={setNewPassword}
          showNewPassword={showNewPassword}
          setShowNewPassword={setShowNewPassword}
          isSubmitting={isSubmitting}
          countdown={countdown}
          onResendOtp={() => sendOTP(undefined, step === "otp-signup")}
          region={region}
          onSubmitSetPassword={handleCreateAccount}
          onSubmitResetPassword={handleResetPassword}
          onSubmitForgotPassword={handleForgotPassword}
          onBack={() => {
            setOtpValues(["", "", "", "", "", ""]);
            setNewPassword("");
            setStep("email");
          }}
        />
      </>
    );
  }

  // ─── Mobile email/password flow (over aurora bg) is handled below by adding
  //     a mobile back button that returns to intro1 ────────────────────────

  return (
    <>
      <SEOHead
        title={authT("seoTitle")}
        description={authT("seoDesc")}
        path="/auth"
        noindex
      />
      <div className="auth-desktop-split relative min-h-dvh w-full overflow-hidden bg-background text-foreground flex flex-col lg:flex-row">
        {/* Plain black backdrop */}
        <div className="absolute inset-0 -z-10 bg-background" />

        {/* Left half wrapper (desktop) / bottom panel (mobile) */}
        <div className="relative w-full lg:w-1/2 lg:min-h-dvh flex-1 flex flex-col">
          {/* Mobile rounded panel wrapping content */}
          <div className="relative z-10 flex flex-col flex-1 bg-background rounded-t-3xl -mt-5 lg:mt-0 lg:rounded-none lg:bg-transparent">
            {/* Top bar with back button */}
            <div className="relative z-10 w-full px-6 py-3 lg:py-6 flex items-center justify-end max-w-[480px] mx-auto">
              <AnimatePresence>
                {showBack && (
                  <motion.button
                    initial={{ opacity: 0, x: 4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 4 }}
                    onClick={handleBack}
                    className="flex items-center gap-1.5 text-[12px] text-foreground/55 hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    {authT("back")}
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 pb-4 sm:px-6 sm:pb-6 lg:pb-16 pt-2 lg:pt-4 lg:min-h-[calc(100dvh-88px)]">
              <div className="w-full max-w-[400px]">
                {/* Headline */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`hdr-${step}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.85 }}
                    className="mb-4 lg:mb-8"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <BrandLogo
                        alt="Megsy"
                        className="h-8 w-8"
                        style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}
                        loading="lazy"
                        decoding="async"
                      />
                      <h1 className="text-[22px] leading-[1.25] font-medium tracking-tight text-foreground">
                        {meta.title}
                      </h1>
                    </div>
                    <p className="mt-2 text-[13px] text-foreground/50 leading-relaxed break-words">
                      {meta.sub}
                    </p>
                  </motion.div>
                </AnimatePresence>

                {/* Inline error — persistent, screen-reader announced */}
                {mobileError ? (
                  <div
                    role="alert"
                    aria-live="assertive"
                    className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-[13px] leading-relaxed text-destructive"
                  >
                    {mobileError}
                  </div>
                ) : null}

                {/* Forms */}
                <AnimatePresence mode="wait">
                  {step === "email" && (
                    <motion.div
                      key="email"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ type: "spring", stiffness: 280, damping: 28, mass: 0.9 }}
                    >
                      <div className="space-y-5">
                        <input
                          type="email"
                          placeholder={authT("emailPlaceholder")}
                          value={email}
                          onChange={(e) => setEmailClear(e.target.value)}
                          onPaste={(e) => handleTextPaste(e, setEmail)}
                          {...clipboardProps({ name: "email" })}
                          onKeyDown={(e) => e.key === "Enter" && handleCheckEmail()}
                          autoFocus
                          autoComplete="email"
                          inputMode="email"
                          className={inputCls}
                        />

                        {/* Invite code — auto-shown when user lands via /ref/:code, editable */}
                        {showReferralField ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="text-[11px] text-foreground/55 uppercase tracking-[0.18em]">
                                {authT("inviteCode")}
                              </label>
                              <button
                                type="button"
                                onClick={() => {
                                  setReferralCode("");
                                  setShowReferralField(false);
                                }}
                                className="text-[11px] text-foreground/65 hover:text-foreground/80 transition-colors"
                              >
                                {authT("remove")}
                              </button>
                            </div>
                            <input
                              type="text"
                              placeholder="MEGSY-XXXXXX"
                              value={referralCode}
                              onChange={(e) =>
                                setReferralCode(e.target.value.toUpperCase().slice(0, 64))
                              }
                              autoComplete="off"
                              spellCheck={false}
                              className={`${inputCls} font-mono tracking-wider`}
                            />
                            {referralCode && (
                              <p className="text-[11px] text-foreground/65">
                                {authT("invitedByPrefix")}
                                <span className="text-foreground/75 font-mono">{referralCode}</span>
                                {authT("invitedBySuffix")}
                              </p>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setShowReferralField(true)}
                            className="text-[12px] text-foreground/55 hover:text-foreground transition-colors"
                          >
                            {authT("haveInviteCode")}
                          </button>
                        )}

                        <button
                          onClick={handleCheckEmail}
                          disabled={isSubmitting || !email.trim()}
                          className={btnCls(!!email.trim())}
                        >
                          {isSubmitting ? (
                            <span className="flex items-center justify-center gap-2">
                              <Spinner />
                              {authT("checking")}
                            </span>
                          ) : (
                            authT("continue")
                          )}
                        </button>
                      </div>

                      <div className="flex items-center gap-3 my-5">
                        <div className="flex-1 h-px bg-foreground/10" />
                        <span className="text-[10px] text-foreground/65 uppercase tracking-[0.25em]">
                          {authT("or")}
                        </span>
                        <div className="flex-1 h-px bg-foreground/10" />
                      </div>

                      <div className="space-y-2.5">
                        <button
                          onClick={handleGoogleLogin}
                          className={socialCls}
                        >
                          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24">
                            <path
                              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                              fill="#4285F4"
                            />
                            <path
                              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                              fill="#34A853"
                            />
                            <path
                              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                              fill="#FBBC05"
                            />
                            <path
                              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                              fill="#EA4335"
                            />
                          </svg>
                          {authT("continueWithGoogle")}
                        </button>
                        <button onClick={handleGitHubLogin} className={socialCls}>
                          <svg
                            className="w-[18px] h-[18px]"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                          </svg>
                           {authT("continueWithGitHub")}
                         </button>
                        <AppleSignInButton className={socialCls} />
                      </div>
                    </motion.div>
                  )}

                  {step === "password" && (
                    <motion.div
                      key="password"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ type: "spring", stiffness: 280, damping: 28, mass: 0.9 }}
                      className="space-y-5"
                    >
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          placeholder={authT("passwordPlaceholder")}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          onPaste={(e) => handleTextPaste(e, setPassword)}
                          {...clipboardProps({ name: "password" })}
                          onKeyDown={(e) => e.key === "Enter" && handlePasswordLogin()}
                          autoFocus
                          autoComplete="current-password"
                           className={`${inputCls} pe-10`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute end-0 top-1/2 -translate-y-1/2 text-foreground/65 hover:text-foreground/80 transition-colors"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <div className="flex items-center justify-end -mt-3">
                        <button
                          onClick={() => setStep("forgot-password")}
                          className="text-[12px] text-foreground/55 hover:text-foreground transition-colors"
                        >
                          {authT("forgotPasswordLink")}
                        </button>
                      </div>
                      <button
                        onClick={handlePasswordLogin}
                        disabled={isSubmitting || !password}
                          className={btnCls(!!password.trim())}
                      >
                        {isSubmitting ? (
                          <span className="flex items-center justify-center gap-2">
                            <Spinner />
                            {authT("signingIn")}
                          </span>
                        ) : (
                          authT("signIn")
                        )}
                      </button>
                    </motion.div>
                  )}

                  {isOtpStep && (
                    <motion.div
                      key={`otp-${step}`}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ type: "spring", stiffness: 280, damping: 28, mass: 0.9 }}
                      className="space-y-5"
                    >
                      <div className="flex justify-center">
                        <InputOTP
                          maxLength={6}
                          value={otpValues.join("")}
                          onChange={(val) => {
                            const digits = val.replace(/\D/g, "").slice(0, 6);
                            const next = ["", "", "", "", "", ""];
                            digits.split("").forEach((d, i) => {
                              next[i] = d;
                            });
                            setOtpValues(next);
                            if (digits.length === 6) handleVerifyOTP(digits);
                          }}
                          autoFocus
                          inputMode="numeric"
                          pattern="[0-9]*"
                          autoComplete="one-time-code"
                        >
                          <InputOTPGroup className="gap-2">
                            {[0, 1, 2, 3, 4, 5].map((i) => (
                              <InputOTPSlot
                                key={`otp-${step}-${i}`}
                                index={i}
                                className="w-11 h-12 sm:w-12 sm:h-14 text-2xl font-display font-bold text-foreground bg-transparent border-0 border-b-2 border-foreground/15 rounded-none first:rounded-none last:rounded-none focus-within:border-foreground/70 transition-colors"
                              />
                            ))}
                          </InputOTPGroup>
                        </InputOTP>
                      </div>

                      {isSubmitting && (
                        <p className="text-[12px] text-foreground/55 text-center flex items-center justify-center gap-2">
                          <Spinner /> {authT("verifying")}
                        </p>
                      )}
                      <div className="text-center">
                        {countdown > 0 ? (
                          <p className="text-[12px] text-foreground/65">{authTf("resendInSecondsTemplate", { n: countdown })}</p>
                        ) : (
                          <button
                            onClick={() => sendOTP()}
                            disabled={isSubmitting}
                            className="text-[12px] text-foreground/65 hover:text-foreground transition-colors disabled:opacity-40"
                          >
                            {authT("resendCode")}
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {step === "set-password" && (
                    <motion.div
                      key="set-password"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ type: "spring", stiffness: 280, damping: 28, mass: 0.9 }}
                      className="space-y-5"
                    >
                      <div className="relative">
                        <input
                          type={showNewPassword ? "text" : "password"}
                          placeholder={authT("passwordMinPlaceholder")}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          onPaste={(e) => handleTextPaste(e, setNewPassword)}
                          {...clipboardProps({ name: "newPassword" })}
                          onKeyDown={(e) => e.key === "Enter" && handleCreateAccount()}
                          autoFocus
                          autoComplete="new-password"
                          className={`${inputCls} pe-10`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute end-0 top-1/2 -translate-y-1/2 text-foreground/65 hover:text-foreground/80 transition-colors"
                        >
                          {showNewPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <button
                        onClick={handleCreateAccount}
                        disabled={isSubmitting || newPassword.length < 8}
                        className={btnCls(!!newPassword.trim())}
                      >
                        {isSubmitting ? (
                          <span className="flex items-center justify-center gap-2">
                            <Spinner />
                            {authT("creating")}
                          </span>
                        ) : (
                          authT("createAccount")
                        )}
                      </button>
                    </motion.div>
                  )}

                  {step === "reset-password" && (
                    <motion.div
                      key="reset-password"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ type: "spring", stiffness: 280, damping: 28, mass: 0.9 }}
                      className="space-y-5"
                    >
                      <div className="relative">
                        <input
                          type={showNewPassword ? "text" : "password"}
                          placeholder={authT("newPasswordMinPlaceholder")}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          onPaste={(e) => handleTextPaste(e, setNewPassword)}
                          {...clipboardProps({ name: "newPassword" })}
                          onKeyDown={(e) => e.key === "Enter" && handleResetPassword()}
                          autoFocus
                          autoComplete="new-password"
                          className={`${inputCls} pe-10`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute end-0 top-1/2 -translate-y-1/2 text-foreground/65 hover:text-foreground/80 transition-colors"
                        >
                          {showNewPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <button
                        onClick={handleResetPassword}
                        disabled={isSubmitting || newPassword.length < 8}
                        className={btnCls(!!newPassword.trim())}
                      >
                        {isSubmitting ? (
                          <span className="flex items-center justify-center gap-2">
                            <Spinner />
                            {authT("updating")}
                          </span>
                        ) : (
                          authT("updatePassword")
                        )}
                      </button>
                    </motion.div>
                  )}

                  {step === "forgot-password" && (
                    <motion.div
                      key="forgot"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ type: "spring", stiffness: 280, damping: 28, mass: 0.9 }}
                      className="space-y-5"
                    >
                      <button
                        onClick={handleForgotPassword}
                        disabled={isSubmitting}
                        className={btnCls(!!email.trim())}
                      >
                        {isSubmitting ? (
                          <span className="flex items-center justify-center gap-2">
                            <Spinner />
                            {authT("sending")}
                          </span>
                        ) : (
                          authT("sendResetCode")
                        )}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {clipboardMenu && (
                  <div
                    ref={clipboardMenuRef}
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
                      {authT("copy")}
                    </button>
                    <button
                      type="button"
                      onClick={handleClipboardPaste}
                      className="border-s border-foreground/10 px-4 py-2.5 text-[13px] font-medium hover:bg-foreground/10"
                    >
                      {authT("paste")}
                    </button>
                  </div>
                )}

                {/* Footer terms */}
                <p className="mt-4 lg:mt-12 text-[11px] text-foreground/65 leading-relaxed">
                  {authT("termsAgreePrefix")}
                  <a
                    href="https://terms.megsyai.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground/65 underline underline-offset-2 hover:text-foreground transition-colors"
                  >
                    {authT("termsLink")}
                  </a>
                  {authT("and")}
                  <a
                    href="https://privacy.megsyai.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground/65 underline underline-offset-2 hover:text-foreground transition-colors"
                  >
                    {authT("privacyLink")}
                  </a>
                  .
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right half — video background with image fallback (desktop only) */}
        <aside className="hidden lg:block lg:w-1/2 lg:min-h-dvh relative overflow-hidden">
          <img loading="lazy" decoding="async"
            src={`${AUTH_ASSET_BASE}/auth-mobile-fallback.webp`}
            alt=""
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${videoLoaded ? "opacity-0" : "opacity-100"}`}
          />
          <div
            className={`absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent transition-opacity duration-700 ${videoLoaded ? "opacity-0" : "opacity-100"}`}
          />
          {!isMobile && (
          <video
            poster={AUTH_HERO_POSTER}
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            onLoadedData={() => setVideoLoaded(true)}
            className="absolute inset-0 w-full h-full object-cover"
          >
            <source src={AUTH_HERO_WEBM} type="video/webm" />
            <source src={AUTH_HERO_MP4} type="video/mp4" />
          </video>
          )}
        </aside>
      </div>
    </>
  );
};

export default AuthPage;
