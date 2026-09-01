import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { m as motion, AnimatePresence } from "framer-motion";
import {
  Check,
  ChevronUp,
  X,
  Sparkles,
  MessageSquare,
  Image as ImageIcon,
  FileText,
  Users,
  Crown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "megsy_onboarding_checklist_v1";
const HIDE_KEY = "megsy_onboarding_checklist_hidden_v1";

type StepId = "chat" | "image" | "doc" | "invite" | "pro";

interface Step {
  id: StepId;
  label: string;
  icon: typeof Check;
  href: string;
}

const STEPS: Step[] = [
  { id: "chat", label: "First chat", icon: MessageSquare, href: "/chat" },
  { id: "image", label: "First image", icon: ImageIcon, href: "/image" },
  { id: "doc", label: "First document / slide", icon: FileText, href: "/slides" },
  { id: "invite", label: "Invite a friend", icon: Users, href: "/billing/referrals" },
  { id: "pro", label: "Activate Pro — 50% off", icon: Crown, href: "/pricing?promo=WELCOME50" },
];

type StepState = Record<StepId, boolean>;

const readState = (): StepState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* noop */
  }
  return { chat: false, image: false, doc: false, invite: false, pro: false };
};

export const markOnboardingStep = (id: StepId) => {
  try {
    const s = readState();
    if (s[id]) return;
    s[id] = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    window.dispatchEvent(new CustomEvent("megsy:onboarding-update"));
  } catch {
    /* noop */
  }
};

export default function OnboardingChecklist() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<StepState>(() => readState());

  useEffect(() => {
    try {
      setHidden(!!localStorage.getItem(HIDE_KEY));
    } catch {
      /* noop */
    }
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setAuthed(!!s));
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const refresh = () => setState(readState());
    window.addEventListener("megsy:onboarding-update", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("megsy:onboarding-update", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(HIDE_KEY, "1");
    } catch {
      /* noop */
    }
    setHidden(true);
  }, []);

  const done = STEPS.filter((s) => state[s.id]).length;
  const total = STEPS.length;
  const allDone = done === total;

  if (!authed || hidden || allDone) return null;

  const pct = Math.round((done / total) * 100);

  return (
    <div className="fixed bottom-4 right-4 z-toast hidden md:block">
      <AnimatePresence mode="wait">
        {open ? (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            className="w-80 rounded-2xl bg-background border border-border shadow-2xl overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-gradient-to-r from-primary/10 to-transparent">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <div className="text-sm font-bold">Get started with Megsy</div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  aria-label="Minimize"
                >
                  <ChevronUp className="w-3.5 h-3.5 rotate-180" />
                </button>
                <button
                  onClick={dismiss}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  aria-label="Dismiss"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="px-4 pt-3 pb-2">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] text-muted-foreground font-semibold">
                  {done} of {total} complete
                </div>
                <div className="text-[11px] text-primary font-bold">{pct}%</div>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="h-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>

            <ul className="px-2 py-2 space-y-0.5">
              {STEPS.map((s) => {
                const isDone = state[s.id];
                const Icon = s.icon;
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => {
                        navigate(s.href);
                        setOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-sm text-left transition-colors ${
                        isDone ? "opacity-60" : "hover:bg-muted/60"
                      }`}
                    >
                      <span
                        className={`shrink-0 w-5 h-5 rounded-full grid place-items-center border ${
                          isDone
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-border bg-background"
                        }`}
                      >
                        {isDone ? (
                          <Check className="w-3 h-3" strokeWidth={3} />
                        ) : (
                          <Icon className="w-3 h-3 text-muted-foreground" />
                        )}
                      </span>
                      <span className={`flex-1 ${isDone ? "line-through" : "font-medium"}`}>
                        {s.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        ) : (
          <motion.button
            key="pill"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/25 hover:scale-105 transition-transform font-semibold text-xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              Start — {done}/{total}
            </span>
            <span className="px-1.5 py-0.5 rounded-full bg-primary-foreground/20 text-[10px] font-black">
              {pct}%
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
