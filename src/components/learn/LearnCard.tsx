import { useEffect, useMemo, useRef, useState } from "react";
import { m as motion, AnimatePresence } from "framer-motion";
import { ArrowUp, Check, ChevronRight, Lightbulb, Sparkles, X } from "lucide-react";
import type { LearnCardData } from "@/lib/learnCardParser";
import { detectLearnLocale, getLearnStrings, type LearnLocale } from "@/lib/learnCardI18n";
import { recordAnswer, hapticFeedback, setStudyTopic, getStudyState } from "@/lib/studyProgress";
import { logItem, logMistake, hashCardKey, noteTopicVisit } from "@/lib/learnMemory";

// Stable key per rendered card — used to dedupe answers across React
// re-renders and stream resumes, and to key mistakes/items in memory.
function cardKey(card: any): string {
  const raw =
    (card && (card.id || card.uid || card.key)) ||
    JSON.stringify({
      t: card?.type,
      q: card?.question || card?.title || card?.problem || card?.front,
      o: card?.options,
      c: card?.correct,
    });
  return hashCardKey(String(raw));
}

// Resolve topic for memory logging: prefer card.topic, else the
// session's tracked topic. Empty string when unknown.
function cardTopic(card: any): string {
  const t = card?.topic || card?.subject || getStudyState().topic || "";
  return String(t || "").trim();
}

function compactLearnText(value: unknown): string {
  if (Array.isArray(value)) return value.map(compactLearnText).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(compactLearnText).join(" ");
  return String(value ?? "").toLowerCase();
}

function escapeLearnField(value: unknown): string {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, "'").replace(/\s+/g, " ").trim();
}

function isUngradedSetupChoice(card: any): boolean {
  // 1) Explicit signals from the tutor.
  const explicit = compactLearnText([
    card?.mode,
    card?.purpose,
    card?.intent,
    card?.category,
    card?.role,
    card?.grading,
  ]);
  if (/\b(ungraded|preference|preferences|config|configuration|setup|exam_setup|survey|choice|depth|time_budget|goal|goals|interest|interests|starting_point|start_with|onboarding|topic_pick|topic_select)\b/.test(explicit)) {
    return true;
  }
  if (card?.graded === false || card?.ungraded === true || card?.isGraded === false) return true;

  const question = compactLearnText([card?.question, card?.title, card?.topic]);
  const options = compactLearnText(card?.options);
  const both = `${question} ${options}`;

  // 2) Strong preference / opinion / starting-point phrasing → ungraded on its own.
  const strongPreference =
    /(what do you (want|like|prefer|wanna)|where (do|would) you (want|like) to (start|begin)|(do|would) you (want|like|prefer) to (start|begin)|start(ing)? (with|from|point)|begin (with|from)|which (topic|area|part|section|subject|skill|track|path|module|lesson) (first|do you|would you|to start)|which (would|do) you (prefer|like)|pick a (topic|goal|path|track|starting)|your (goal|goals|interest|interests|level|background|experience))/i.test(question) ||
    /(بم(اذا)? (تحب|تريد|تفضل|عاوز|عايز)|من فين (تحب|تريد|تبدأ|نبدأ)|(تحب|تريد|تفضل|عاوز|عايز|هل تريد|هل تحب) (تبدأ|نبدأ|ابدأ|البدء)|ابدأ (من|بـ|ب)|نبدأ (من|بـ|ب)|(أي|اي) (موضوع|جزء|مجال|مسار|درس|مهارة) (نبدأ|تبدأ|أول|اول|الأول)|هدفك|أهدافك|اهدافك|مستواك|خلفيتك|اهتمامك|اهتماماتك)/i.test(question);
  if (strongPreference) return true;

  // 3) Legacy heuristic: soft preference AND learning-setup vocabulary.
  const asksPreference =
    /(prefer|preference|would you like|do you want|choose|select|pick|configure|set up|setup|how long|how deep|depth|time budget|duration|difficulty)/i.test(question) ||
    /(تفضل|تفضّل|تحب|عايز|عايزة|تريد|اختر|اختار|اختاري|نختار|حدد|تحديد|إعداد|اعداد|مدة|المدة|وقت|الوقت|زمن|عمق|عميق|سريع|عادي|مستوى|الصعوبة)/i.test(question);
  const looksLikeLearningSetup =
    /(exam|quiz|test|mock|practice|lesson|session|study|training|drill|revision|review|minutes?|mins?|quick|regular|focused|deep|easy|medium|hard|beginner|intermediate|advanced)/i.test(both) ||
    /(امتحان|اختبار|تدريب|مراجعة|درس|تعليم|دراسة|أسئلة|دقيقة|دقائق|سريع|عادي|مركز|مركّز|عميق|سهل|متوسط|صعب|مبتدئ|متقدم)/i.test(both);
  if (asksPreference && looksLikeLearningSetup) return true;

  // 4) Options look like topic names / high-level areas (short noun-phrases,
  //    no numbers/units, no true/false) → treat as an ungraded topic pick.
  const opts: string[] = Array.isArray(card?.options) ? card.options : [];
  if (asksPreference && opts.length >= 2 && opts.length <= 6) {
    const allTopicLike = opts.every((o) => {
      const s = String(o || "").trim();
      if (!s) return false;
      if (s.length > 40) return false;
      if (/\d/.test(s)) return false;
      if (/^(true|false|yes|no|صح|خطأ|نعم|لا)$/i.test(s)) return false;
      return true;
    });
    if (allTopicLike) return true;
  }

  return false;
}

/* ============================================================
 * Learn Mode — refined card system
 *
 * Design goals:
 *  - Feel like the calmest, most polished surface in the app.
 *  - Every quiz type shares one shell language (tone accent bar +
 *    label + optional right slot) so the mode reads as a system.
 *  - Micro-interactions reward correct answers (spring scale + a
 *    quiet sparkle) without being noisy or childish.
 *  - Keyboard first: MCQ answers via 1-9 / A-Z.
 *  - Fully RTL-safe: uses `start`/`end` and `ms/me` where possible.
 * ============================================================ */

let mermaidPromise: Promise<any> | null = null;
function loadMermaid(): Promise<any> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => {
      const mm: any = (m as any).default ?? m;
      mm.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "loose",
        fontFamily: "inherit",
      });
      return mm;
    });
  }
  return mermaidPromise;
}

function localeFromCard(card: any): LearnLocale {
  return detectLearnLocale(
    card?.question,
    card?.title,
    card?.problem,
    Array.isArray(card?.options) ? card.options.join(" ") : "",
    card?.explain,
    card?.topic,
  );
}

interface BaseProps {
  card: LearnCardData;
  onAnswer?: (text: string) => void;
}

type Tone = "emerald" | "blue" | "amber" | "rose" | "violet";

/* ───────────────────── tone system ───────────────────── */

const TONE = {
  emerald: {
    dot: "bg-emerald-500",
    bar: "from-emerald-500/0 via-emerald-500/70 to-emerald-500/0",
    ring: "ring-emerald-400/40",
    text: "text-emerald-700 dark:text-emerald-300",
    softBg: "bg-emerald-500/10",
    softBgHover: "hover:bg-emerald-500/15",
    softBorder: "border-emerald-400/50",
    solid: "bg-emerald-500 hover:bg-emerald-500/90 text-foreground",
    glow: "shadow-[0_0_0_1px_rgba(16,185,129,0.25),0_10px_30px_-12px_rgba(16,185,129,0.35)]",
  },
  blue: {
    dot: "bg-blue-500",
    bar: "from-blue-500/0 via-blue-500/70 to-blue-500/0",
    ring: "ring-blue-400/40",
    text: "text-blue-700 dark:text-blue-300",
    softBg: "bg-blue-500/10",
    softBgHover: "hover:bg-blue-500/15",
    softBorder: "border-blue-400/50",
    solid: "bg-blue-500 hover:bg-blue-500/90 text-foreground",
    glow: "shadow-[0_0_0_1px_rgba(59,130,246,0.25),0_10px_30px_-12px_rgba(59,130,246,0.35)]",
  },
  amber: {
    dot: "bg-amber-500",
    bar: "from-amber-500/0 via-amber-500/70 to-amber-500/0",
    ring: "ring-amber-400/40",
    text: "text-amber-700 dark:text-amber-300",
    softBg: "bg-amber-500/10",
    softBgHover: "hover:bg-amber-500/15",
    softBorder: "border-amber-400/50",
    solid: "bg-amber-500 hover:bg-amber-500/90 text-foreground",
    glow: "shadow-[0_0_0_1px_rgba(245,158,11,0.25),0_10px_30px_-12px_rgba(245,158,11,0.35)]",
  },
  rose: {
    dot: "bg-rose-500",
    bar: "from-rose-500/0 via-rose-500/70 to-rose-500/0",
    ring: "ring-rose-400/40",
    text: "text-rose-700 dark:text-rose-300",
    softBg: "bg-rose-500/10",
    softBgHover: "hover:bg-rose-500/15",
    softBorder: "border-rose-400/50",
    solid: "bg-rose-500 hover:bg-rose-500/90 text-foreground",
    glow: "shadow-[0_0_0_1px_rgba(244,63,94,0.25),0_10px_30px_-12px_rgba(244,63,94,0.35)]",
  },
  violet: {
    dot: "bg-violet-500",
    bar: "from-violet-500/0 via-violet-500/70 to-violet-500/0",
    ring: "ring-violet-400/40",
    text: "text-violet-700 dark:text-violet-300",
    softBg: "bg-violet-500/10",
    softBgHover: "hover:bg-violet-500/15",
    softBorder: "border-violet-400/50",
    solid: "bg-violet-500 hover:bg-violet-500/90 text-foreground",
    glow: "shadow-[0_0_0_1px_rgba(139,92,246,0.25),0_10px_30px_-12px_rgba(139,92,246,0.35)]",
  },
} as const;

/* ───────────────────── shared bits ───────────────────── */

const CardShell = ({
  children,
  tone = "emerald",
  label,
  rightSlot,
}: {
  children: React.ReactNode;
  tone?: Tone;
  label?: string;
  rightSlot?: React.ReactNode;
}) => {
  const t = TONE[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 280, damping: 26, mass: 0.7 }}
      className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-b from-card via-card to-card/90 p-5 space-y-4 shadow-[0_1px_0_var(--overlay-white-04)_inset,0_20px_50px_-30px_rgba(0,0,0,0.5)] backdrop-blur-xl"
    >
      {/* tone accent bar */}
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r ${t.bar}`} />
      {(label || rightSlot) && (
        <div className="flex items-center justify-between gap-3">
          {label && (
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${t.dot} shadow-[0_0_8px_currentColor] ${t.text}`} />
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground font-mono">
                {label}
              </span>
            </div>
          )}
          {rightSlot && <div className="flex items-center gap-2">{rightSlot}</div>}
        </div>
      )}
      {children}
    </motion.div>
  );
};

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-[5px] border border-border/60 bg-muted/60 text-[10px] font-mono font-semibold text-muted-foreground shadow-[0_1px_0_rgba(0,0,0,0.15)]">
    {children}
  </kbd>
);

const Sparkle = () => (
  <motion.span
    initial={{ opacity: 0, scale: 0.4, rotate: -30 }}
    animate={{ opacity: [0, 1, 0], scale: [0.4, 1.2, 1], rotate: 0 }}
    transition={{ duration: 0.9, ease: "easeOut" }}
    className="pointer-events-none absolute -top-1 -end-1 text-emerald-400"
    aria-hidden
  >
    <Sparkles className="w-3.5 h-3.5" />
  </motion.span>
);

const ResultBanner = ({
  right,
  labelRight,
  labelWrong,
}: {
  right: boolean;
  labelRight: string;
  labelWrong: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: -4 }}
    animate={{ opacity: 1, y: 0 }}
    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
      right
        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
        : "bg-rose-500/15 text-rose-700 dark:text-rose-300"
    }`}
  >
    {right ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
    {right ? labelRight : labelWrong}
  </motion.div>
);

const TeacherNoteInput = ({ onSend, locale }: { onSend: (text: string) => void; locale?: any }) => {
  const tt = getLearnStrings(locale || detectLearnLocale(""));
  const [val, setVal] = useState("");
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground transition-colors"
      >
        {tt.tell_teacher}
      </button>
    );
  }
  return (
    <div className="flex gap-1.5 w-full">
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && val.trim()) {
            onSend(val.trim());
            setVal("");
            setOpen(false);
          }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={tt.write_note_teacher}
        className="flex-1 px-3 py-2 rounded-xl border border-border/50 bg-background/60 text-xs text-foreground outline-none focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20 transition-all"
      />
      <button
        type="button"
        aria-label={tt.send}
        onClick={() => {
          if (val.trim()) {
            onSend(val.trim());
            setVal("");
            setOpen(false);
          }
        }}
        disabled={!val.trim()}
        className="shrink-0 w-9 h-9 rounded-xl bg-emerald-500 text-foreground grid place-items-center disabled:opacity-40 hover:bg-emerald-500/90 transition-colors"
      >
        <ArrowUp className="w-4 h-4" />
      </button>
    </div>
  );
};

/* ───────────────────── MCQ ───────────────────── */

const MCQCard = ({ card, onAnswer }: BaseProps) => {
  const loc = localeFromCard(card);
  const tt = getLearnStrings(loc);
  const [picked, setPicked] = useState<number | null>(null);
  const [hintLevel, setHintLevel] = useState<0 | 1 | 2>(0);
  const options = card.options || [];
  const ungradedSetupChoice = isUngradedSetupChoice(card);
  const rawCorrect = card.correct;
  const numericCorrect = typeof rawCorrect === "number" ? rawCorrect : Number(rawCorrect);
  // Only grade when the tutor actually supplied a valid, in-range correct index.
  // Falling back to 0 silently was marking correct picks as "wrong" whenever
  // `correct` was missing or malformed.
  const hasValidCorrect =
    Number.isFinite(numericCorrect) &&
    Number.isInteger(numericCorrect) &&
    numericCorrect >= 0 &&
    numericCorrect < options.length;
  const correct = hasValidCorrect ? numericCorrect : -1;
  const gradedMcq = !ungradedSetupChoice && hasValidCorrect;
  const isRight = gradedMcq && picked === correct;

  // Ladder of hints: level 1 = nudge (from card.hint or generic), level 2 =
  // eliminate one wrong option. Level 3 (reveal) is baked into "picked".
  // The hint text is either provided by the tutor via card.hint / card.hints[]
  // or synthesized from the correct option's first characters.
  const hint1 = useMemo(() => {
    if (typeof card.hint === "string" && card.hint.trim()) return card.hint.trim();
    if (Array.isArray(card.hints) && card.hints[0]) return String(card.hints[0]);
    const target = options[correct] ?? "";
    return target ? `${tt.hint_first_letter}: "${target.slice(0, 2)}…"` : tt.hint_generic;
  }, [card.hint, card.hints, options, correct, tt]);
  const eliminated = useMemo(() => {
    if (ungradedSetupChoice) return new Set<number>();
    if (hintLevel < 2) return new Set<number>();
    // Eliminate one wrong option (deterministic pick: first non-correct).
    const wrong = options
      .map((_: string, i: number) => i)
      .filter((i: number) => i !== correct);
    return new Set<number>(wrong.slice(0, 1));
  }, [hintLevel, options, correct, ungradedSetupChoice]);

  const submit = (i: number) => {
    if (picked !== null) return;
    if (eliminated.has(i)) return;
    setPicked(i);
    const chosenLetter = String.fromCharCode(65 + i);
    const correctLetter = gradedMcq ? String.fromCharCode(65 + (correct as number)) : "";
    const correctText = gradedMcq ? (options[correct as number] ?? "") : "";
    const wasRight = gradedMcq && i === correct;
    if (ungradedSetupChoice || !gradedMcq) {
      // Ungraded: either a setup/preference choice, or the tutor did not
      // supply a valid `correct` index. In both cases we must NOT mark the
      // pick as wrong — just forward the choice so the tutor can react.
      hapticFeedback("tap");
      const kind = ungradedSetupChoice ? "setup_choice" : "open_choice";
      const payload = `[LEARN_CHOICE] type=${kind} question="${escapeLearnField(card.question)}" chosen="${escapeLearnField(`${chosenLetter}) ${options[i]}`)}" topic="${escapeLearnField(cardTopic(card) || card.topic || card.subject || "")}"`;
      setTimeout(() => onAnswer?.(payload), 80);
      return;
    }
    // Feed the live-learner signal + haptic — this is what powers the
    // StudyHUD and the [LEARN_STATE] block sent to the tutor next turn.
    // hintLevel is folded in so XP is fairly taxed for each rung used.
    const nextState = recordAnswer({
      correct: wasRight,
      cardType: "mcq",
      hintLevel: hintLevel as 0 | 1 | 2,
    });
    hapticFeedback(wasRight ? "correct" : "wrong");
    // Durable memory: log the item (dedup by cardKey) and, on failure,
    // capture the exact misconception so the tutor can pre-empt it.
    const _cid = cardKey(card);
    const _topic = cardTopic(card);
    logItem({ cardId: _cid, topic: _topic, type: "mcq", correct: wasRight, hintLevel });
    if (!wasRight) {
      logMistake({
        cardId: _cid,
        topic: _topic,
        question: String(card.question || ""),
        chosen: `${chosenLetter}) ${options[i]}`,
        correct: `${correctLetter}) ${correctText}`,
      });
    }
    const hintTag = hintLevel > 0 ? ` hint_level=${hintLevel}` : "";
    const payload = wasRight
      ? `[LEARN_ANSWER] type=mcq result=correct chosen="${chosenLetter}) ${options[i]}"${hintTag}`
      : `[LEARN_ANSWER] type=mcq result=incorrect chosen="${chosenLetter}) ${options[i]}" correct="${correctLetter}) ${correctText}"${hintTag}`;
    setTimeout(() => onAnswer?.(payload), 120);
  };

  // Keyboard: 1..9 / A..Z to pick, H to advance hint ladder.
  useEffect(() => {
    if (picked !== null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Ignore when typing in an input/textarea elsewhere.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      const k = e.key.toUpperCase();
      if (!ungradedSetupChoice && k === "H") {
        e.preventDefault();
        setHintLevel((lv) => (lv < 2 ? ((lv + 1) as 0 | 1 | 2) : lv));
        hapticFeedback("tap");
        return;
      }
      let idx = -1;
      if (/^[1-9]$/.test(k)) idx = parseInt(k, 10) - 1;
      else if (/^[A-Z]$/.test(k)) idx = k.charCodeAt(0) - 65;
      if (idx >= 0 && idx < options.length) {
        e.preventDefault();
        submit(idx);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picked, options.length, hintLevel, ungradedSetupChoice]);

  return (
    <CardShell
      tone="emerald"
      label={ungradedSetupChoice ? tt.choose : tt.question_choose}
      rightSlot={
        picked === null ? (
          <div className="flex items-center gap-2">
            {!ungradedSetupChoice && hintLevel < 2 && (
              <button
                type="button"
                onClick={() => {
                  setHintLevel((lv) => (lv < 2 ? ((lv + 1) as 0 | 1 | 2) : lv));
                  hapticFeedback("tap");
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-400/30 transition-colors"
                title={tt.hint_use}
              >
                <Lightbulb className="w-3 h-3" />
                {tt.hint_use}
              </button>
            )}
            <span className="text-[10px] text-muted-foreground">
              1 – {Math.min(options.length, 9)}
            </span>
          </div>
        ) : null
      }
    >

      <p className="text-[16px] font-semibold text-foreground leading-snug">{card.question}</p>

      {/* Hint ladder disclosure */}
      <AnimatePresence>
        {hintLevel >= 1 && picked === null && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-900 dark:text-amber-100"
          >
            <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
            <span className="leading-relaxed">
              {hint1}
              {hintLevel >= 2 && eliminated.size > 0 && (
                <span className="block mt-1 text-amber-800/80 dark:text-amber-200/80">
                  {tt.hint_eliminated}
                </span>
              )}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-2">
        {options.map((opt: string, i: number) => {
          const isPicked = picked === i;
          const revealed = picked !== null;
          const isCorrectOpt = i === correct;
          const isEliminated = eliminated.has(i);
          const letter = String.fromCharCode(65 + i);

          let cls =
            "border-border/60 bg-card/60 hover:border-emerald-300/60 hover:bg-emerald-500/[0.05] text-foreground/85";
          let chipCls =
            "bg-muted/60 text-muted-foreground group-hover:bg-emerald-500/15 group-hover:text-emerald-600 dark:group-hover:text-emerald-300";
          let icon: React.ReactNode = null;
          if (isEliminated && !revealed) {
            cls = "border-border/30 bg-card/30 text-muted-foreground opacity-40 line-through cursor-not-allowed";
            chipCls = "bg-muted/30 text-muted-foreground";
          }
          if (revealed && (ungradedSetupChoice || !gradedMcq)) {
            if (isPicked) {
              cls = "border-emerald-400/70 bg-emerald-500/[0.10] text-emerald-800 dark:text-emerald-100 " + TONE.emerald.glow;
              chipCls = "bg-emerald-500 text-foreground";
              icon = <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300" />;
            } else {
              cls = "border-border/40 bg-card/40 text-muted-foreground opacity-60";
              chipCls = "bg-muted/40 text-muted-foreground";
            }
          } else if (revealed) {
            if (isCorrectOpt) {
              cls =
                "border-emerald-400/70 bg-emerald-500/[0.10] text-emerald-800 dark:text-emerald-100 " +
                TONE.emerald.glow;
              chipCls = "bg-emerald-500 text-foreground";
              icon = <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300" />;
            } else if (isPicked) {
              cls = "border-rose-400/60 bg-rose-500/[0.10] text-rose-800 dark:text-rose-100";
              chipCls = "bg-rose-500 text-foreground";
              icon = <X className="w-3.5 h-3.5 text-rose-600 dark:text-rose-300" />;
            } else {
              cls = "border-border/40 bg-card/40 text-muted-foreground opacity-60";
              chipCls = "bg-muted/40 text-muted-foreground";
            }
          }
          return (
            <motion.button
              key={i}
              type="button"
              disabled={picked !== null || isEliminated}
              onClick={() => submit(i)}
              whileTap={{ scale: 0.985 }}
              animate={isPicked && isRight ? { scale: [1, 1.02, 1] } : {}}
              transition={{ duration: 0.35 }}
              className={`group relative w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-sm font-medium transition-all ${cls}`}
            >
              <span
                className={`relative w-7 h-7 rounded-xl flex items-center justify-center text-[11px] font-bold shrink-0 transition-all ${chipCls}`}
              >
                {letter}
                {revealed && isCorrectOpt && isPicked && <Sparkle />}
              </span>
              <span className="flex-1 text-start leading-snug">{opt}</span>
              {icon}
              {!revealed && !isEliminated && (
                <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <Kbd>{i + 1}</Kbd>
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
      <AnimatePresence>
        {picked !== null && !ungradedSetupChoice && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2.5"
          >
            <ResultBanner right={isRight} labelRight={tt.correct_answer} labelWrong={tt.wrong_try_again} />
            {card.explain && (
              <div className="text-xs text-muted-foreground leading-relaxed border-s-2 border-emerald-400/40 ps-3">
                {card.explain}
              </div>
            )}
            <div className="pt-0.5">
              <TeacherNoteInput locale={loc} onSend={(t) => onAnswer?.(t)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </CardShell>
  );
};



/* ───────────────────── Multi-select ───────────────────── */

const MultiCard = ({ card, onAnswer }: BaseProps) => {
  const loc = localeFromCard(card);
  const tt = getLearnStrings(loc);
  const [picks, setPicks] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const correctSet = useMemo(() => new Set<number>((card.correct as number[]) || []), [card.correct]);
  const allRight =
    submitted && picks.length === correctSet.size && picks.every((p) => correctSet.has(p));

  const toggle = (i: number) => {
    if (submitted) return;
    setPicks((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  };

  return (
    <CardShell
      tone="emerald"
      label={tt.select_all_correct}
      rightSlot={
        !submitted ? (
          <span className="text-[10px] font-mono text-muted-foreground">
            {picks.length} / {(card.options || []).length}
          </span>
        ) : null
      }
    >
      <p className="text-[15px] font-semibold text-foreground leading-snug">{card.question}</p>
      <div className="space-y-2">
        {(card.options || []).map((opt: string, i: number) => {
          const isPicked = picks.includes(i);
          const isCorrect = correctSet.has(i);
          let cls =
            "border-border/60 bg-card/60 hover:border-emerald-300/60 text-foreground/85";
          let box = "border-border/60 bg-background/60";
          if (submitted) {
            if (isCorrect) {
              cls = "border-emerald-400/70 bg-emerald-500/[0.10] text-emerald-800 dark:text-emerald-100";
              box = "bg-emerald-500 border-emerald-500 text-foreground";
            } else if (isPicked) {
              cls = "border-rose-400/60 bg-rose-500/[0.10] text-rose-800 dark:text-rose-100";
              box = "bg-rose-500 border-rose-500 text-foreground";
            }
          } else if (isPicked) {
            cls = "border-emerald-400/60 bg-emerald-500/[0.08] text-foreground";
            box = "bg-emerald-500 border-emerald-500 text-foreground";
          }
          return (
            <motion.button
              key={i}
              type="button"
              onClick={() => toggle(i)}
              disabled={submitted}
              whileTap={{ scale: 0.99 }}
              className={`w-full flex items-center gap-3 text-start px-4 py-3 rounded-2xl border text-sm transition-all ${cls}`}
            >
              <span className={`w-5 h-5 rounded-md border grid place-items-center shrink-0 transition-colors ${box}`}>
                {(isPicked || (submitted && isCorrect)) && <Check className="w-3.5 h-3.5" />}
              </span>
              <span className="flex-1">{opt}</span>
            </motion.button>
          );
        })}
      </div>
      {!submitted ? (
        <button
          type="button"
          disabled={picks.length === 0}
          onClick={() => {
            setSubmitted(true);
            const opts = card.options || [];
            const chosenText = picks.map((i) => `"${opts[i]}"`).join(", ");
            const correctText = Array.from(correctSet)
              .map((i) => `"${opts[i as number]}"`)
              .join(", ");
            const isAllRight =
              picks.length === correctSet.size && picks.every((p) => correctSet.has(p));
            recordAnswer({ correct: isAllRight, cardType: "multi" });
            hapticFeedback(isAllRight ? "correct" : "wrong");
            const _cid = cardKey(card);
            const _topic = cardTopic(card);
            logItem({ cardId: _cid, topic: _topic, type: "multi", correct: isAllRight });
            if (!isAllRight) {
              logMistake({
                cardId: _cid,
                topic: _topic,
                question: String(card.question || ""),
                chosen: chosenText,
                correct: correctText,
              });
            }
            const payload = isAllRight
              ? `[LEARN_ANSWER] type=multi result=correct chosen=[${chosenText}]`
              : `[LEARN_ANSWER] type=multi result=incorrect chosen=[${chosenText}] correct=[${correctText}]`;
            setTimeout(() => onAnswer?.(payload), 120);
          }}
          className="w-full py-2.5 rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-600 text-foreground text-sm font-semibold shadow-[0_8px_20px_-8px_rgba(16,185,129,0.5)] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {tt.confirm}
        </button>
      ) : (
        <div className="space-y-2">
          <ResultBanner right={allRight} labelRight={tt.all_correct} labelWrong={tt.not_all_correct} />
          {card.explain && (
            <div className="text-xs text-muted-foreground leading-relaxed border-s-2 border-emerald-400/40 ps-3">
              {card.explain}
            </div>
          )}
          <TeacherNoteInput locale={loc} onSend={(t) => onAnswer?.(t)} />
        </div>
      )}
    </CardShell>
  );
};

/* ───────────────────── True / False ───────────────────── */

const TrueFalseCard = ({ card, onAnswer }: BaseProps) => {
  const loc = localeFromCard(card);
  const tt = getLearnStrings(loc);
  const [picked, setPicked] = useState<boolean | null>(null);
  const isRight = picked === card.correct;

  const pick = (val: boolean, label: string) => {
    if (picked !== null) return;
    setPicked(val);
    const wasRight = val === card.correct;
    recordAnswer({ correct: wasRight, cardType: "truefalse" });
    hapticFeedback(wasRight ? "correct" : "wrong");
    const _cid = cardKey(card);
    const _topic = cardTopic(card);
    logItem({ cardId: _cid, topic: _topic, type: "truefalse", correct: wasRight });
    if (!wasRight) {
      logMistake({
        cardId: _cid,
        topic: _topic,
        question: String(card.question || ""),
        chosen: label,
        correct: card.correct ? tt.correct : tt.wrong,
      });
    }
    const payload = wasRight
      ? `[LEARN_ANSWER] type=truefalse result=correct chosen="${label}"`
      : `[LEARN_ANSWER] type=truefalse result=incorrect chosen="${label}" correct="${card.correct ? tt.correct : tt.wrong}"`;
    setTimeout(() => onAnswer?.(payload), 120);
  };

  return (
    <CardShell tone="emerald" label={tt.true_or_false}>
      <p className="text-[15px] font-semibold text-foreground leading-snug">{card.question}</p>
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { label: tt.correct, val: true, Icon: Check, tone: "emerald" as Tone },
          { label: tt.wrong, val: false, Icon: X, tone: "rose" as Tone },
        ].map((b) => {
          const sel = picked === b.val;
          const reveal = picked !== null;
          const isCorrect = card.correct === b.val;
          const t = TONE[b.tone];
          let cls = `border-border/60 bg-card/60 hover:${t.softBorder} hover:${t.softBg} text-foreground/85`;
          if (reveal) {
            if (isCorrect) cls = `${t.softBorder} bg-emerald-500/10 text-emerald-800 dark:text-emerald-100 ${TONE.emerald.glow}`;
            else if (sel) cls = "border-rose-400/60 bg-rose-500/10 text-rose-800 dark:text-rose-100";
            else cls = "border-border/40 bg-card/40 text-muted-foreground opacity-60";
          } else if (sel) {
            cls = `${t.softBorder} ${t.softBg} text-foreground`;
          }
          return (
            <motion.button
              key={b.label}
              type="button"
              disabled={picked !== null}
              onClick={() => pick(b.val, b.label)}
              whileTap={{ scale: 0.97 }}
              className={`relative py-4 rounded-2xl border text-sm font-semibold flex items-center justify-center gap-2 transition-all ${cls}`}
            >
              <b.Icon className="w-4 h-4" />
              {b.label}
            </motion.button>
          );
        })}
      </div>
      <AnimatePresence>
        {picked !== null && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
            <ResultBanner right={isRight} labelRight={tt.correct} labelWrong={tt.wrong} />
            {card.explain && (
              <div className="text-xs text-muted-foreground leading-relaxed border-s-2 border-emerald-400/40 ps-3">
                {card.explain}
              </div>
            )}
            <TeacherNoteInput locale={loc} onSend={(t) => onAnswer?.(t)} />
          </motion.div>
        )}
      </AnimatePresence>
    </CardShell>
  );
};

/* ───────────────────── Explain (free text) ───────────────────── */

const ExplainCard = ({ card, onAnswer }: BaseProps) => {
  const loc = localeFromCard(card);
  const tt = getLearnStrings(loc);
  const [val, setVal] = useState("");
  const [sent, setSent] = useState(false);
  const MAX = 600;
  return (
    <CardShell
      tone="blue"
      rightSlot={
        !sent ? (
          <span className={`text-[10px] font-mono ${val.length > MAX ? "text-rose-500" : "text-muted-foreground"}`}>
            {val.length}/{MAX}
          </span>
        ) : null
      }
    >
      <p className="text-[15px] font-semibold text-foreground leading-snug">{card.question}</p>
      {!sent ? (
        <>
          <textarea
            value={val}
            onChange={(e) => setVal(e.target.value.slice(0, MAX))}
            placeholder={tt.write_answer}
            rows={4}
            className="w-full px-3.5 py-2.5 rounded-2xl border border-border/60 bg-background/60 text-sm outline-none focus:border-blue-400/60 focus:ring-2 focus:ring-blue-400/20 resize-none leading-relaxed transition-all"
          />
          <button
            type="button"
            disabled={!val.trim()}
            onClick={() => {
              setSent(true);
              onAnswer?.(tt.my_answer_prefix(val.trim()));
            }}
            className="w-full py-2.5 rounded-2xl bg-gradient-to-b from-blue-500 to-blue-600 text-foreground text-sm font-semibold shadow-[0_8px_20px_-8px_rgba(59,130,246,0.5)] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {tt.submit_grading}
          </button>
        </>
      ) : (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5 text-blue-500" />
          {tt.sent_grading}
        </div>
      )}
    </CardShell>
  );
};

/* ───────────────────── Fill in the blank ───────────────────── */

const FillCard = ({ card, onAnswer }: BaseProps) => {
  const loc = localeFromCard(card);
  const tt = getLearnStrings(loc);
  const [val, setVal] = useState("");
  const [sent, setSent] = useState(false);
  const answer = String(card.answer || "").trim();
  const isRight = sent && val.trim().toLowerCase() === answer.toLowerCase();

  const submit = () => {
    if (!val.trim() || sent) return;
    setSent(true);
    const entered = val.trim();
    const wasRight = entered.toLowerCase() === answer.toLowerCase();
    const payload = wasRight
      ? `[LEARN_ANSWER] type=fill result=correct entered="${entered}"`
      : `[LEARN_ANSWER] type=fill result=incorrect entered="${entered}" correct="${answer}"`;
    setTimeout(() => onAnswer?.(payload), 120);
  };

  return (
    <CardShell tone="emerald" label={tt.fill_blank}>
      <p className="text-[15px] font-medium text-foreground whitespace-pre-wrap leading-relaxed">
        {card.question}
      </p>
      <div className="flex gap-2">
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          disabled={sent}
          placeholder={card.placeholder || tt.your_answer}
          className={`flex-1 px-3.5 py-2.5 rounded-2xl border bg-background/60 text-sm outline-none transition-all ${
            sent
              ? isRight
                ? "border-emerald-400/70 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100 font-semibold"
                : "border-rose-400/60 bg-rose-500/10 text-rose-800 dark:text-rose-100 font-semibold line-through"
              : "border-border/60 focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20"
          }`}
        />
        {!sent && (
          <button
            type="button"
            disabled={!val.trim()}
            onClick={submit}
            className="px-5 rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-600 text-foreground text-sm font-semibold shadow-[0_8px_20px_-8px_rgba(16,185,129,0.5)] hover:brightness-110 disabled:opacity-40 transition-all"
          >
            {tt.confirm}
          </button>
        )}
      </div>
      <AnimatePresence>
        {sent && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
            <ResultBanner
              right={isRight}
              labelRight={tt.correct_with_answer(answer)}
              labelWrong={tt.correct_answer_is(answer)}
            />
            {card.explain && (
              <div className="text-xs text-muted-foreground leading-relaxed border-s-2 border-emerald-400/40 ps-3">
                {card.explain}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </CardShell>
  );
};

/* ───────────────────── Match (column A → B) ───────────────────── */

const MatchCard = ({ card, onAnswer }: BaseProps) => {
  const loc = localeFromCard(card);
  const tt = getLearnStrings(loc);
  const pairs = card.pairs || [];
  const [shuffledB] = useState<string[]>(() => {
    const arr = pairs.map((p: any) => p.b);
    return arr.sort(() => Math.random() - 0.5);
  });
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [done, setDone] = useState(false);

  return (
    <CardShell
      tone="violet"
      label={tt.match_columns}
      rightSlot={
        !done ? (
          <span className="text-[10px] font-mono text-muted-foreground">
            {Object.keys(picks).length} / {pairs.length}
          </span>
        ) : null
      }
    >
      <div className="space-y-2">
        {pairs.map((p: any, i: number) => {
          const chosen = picks[i];
          const state = done ? (chosen === p.b ? "right" : "wrong") : chosen ? "picked" : "idle";
          const cls =
            state === "right"
              ? "border-emerald-400/60 bg-emerald-500/10"
              : state === "wrong"
                ? "border-rose-400/60 bg-rose-500/10"
                : state === "picked"
                  ? "border-violet-400/60 bg-violet-500/10"
                  : "border-border/50 bg-background/60";
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="flex-1 px-3 py-2.5 rounded-xl bg-card/70 border border-border/50 text-sm font-medium">
                {p.a}
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground rtl:rotate-180" />
              <select
                disabled={done}
                value={chosen || ""}
                onChange={(e) => setPicks({ ...picks, [i]: e.target.value })}
                className={`flex-1 px-3 py-2.5 rounded-xl border text-sm outline-none transition-colors ${cls}`}
              >
                <option value="">{tt.choose}</option>
                {shuffledB.map((b: string, j: number) => (
                  <option key={j} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
      {!done ? (
        <button
          type="button"
          disabled={Object.keys(picks).length !== pairs.length}
          onClick={() => {
            setDone(true);
            const results = pairs
              .map((p: any, i: number) => {
                const chosen = picks[i] || "?";
                const ok = chosen === p.b;
                return `"${p.a}" → "${chosen}"${ok ? " ✓" : ` ✗ (correct: "${p.b}")`}`;
              })
              .join("; ");
            const allRight = pairs.every((p: any, i: number) => picks[i] === p.b);
            const payload = `[LEARN_ANSWER] type=match result=${allRight ? "correct" : "incorrect"} pairs=[${results}]`;
            setTimeout(() => onAnswer?.(payload), 120);
          }}
          className="w-full py-2.5 rounded-2xl bg-gradient-to-b from-violet-500 to-violet-600 text-foreground text-sm font-semibold shadow-[0_8px_20px_-8px_rgba(139,92,246,0.5)] hover:brightness-110 disabled:opacity-40 transition-all"
        >
          {tt.confirm}
        </button>
      ) : (
        <TeacherNoteInput locale={loc} onSend={(t) => onAnswer?.(t)} />
      )}
    </CardShell>
  );
};

/* ───────────────────── Check-in (emoji mood) ───────────────────── */

const CHECKIN_EMOJIS = ["🚀", "🐢", "💡", "☕"];

const CheckinCard = ({ card, onAnswer }: BaseProps) => {
  const loc = localeFromCard(card);
  const tt = getLearnStrings(loc);
  const opts = card.options || [tt.opt_continue, tt.opt_slow_down, tt.opt_another_example, tt.opt_take_break];
  return (
    <CardShell tone="amber" label={tt.checkin_label}>
      <p className="text-[15px] font-semibold text-foreground leading-snug">
        {card.question || tt.checkin_default_q}
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {opts.map((o: string, i: number) => (
          <motion.button
            key={i}
            type="button"
            whileTap={{ scale: 0.97 }}
            whileHover={{ y: -1 }}
            onClick={() => onAnswer?.(o)}
            className="flex flex-col items-center justify-center gap-1.5 px-4 py-4 rounded-2xl border border-border/60 bg-card/60 text-sm font-medium text-foreground/85 hover:border-amber-300/60 hover:bg-amber-500/[0.06] hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
          >
            <span className="text-xl leading-none" aria-hidden>
              {CHECKIN_EMOJIS[i % CHECKIN_EMOJIS.length]}
            </span>
            <span className="text-[13px] leading-tight text-center">{o}</span>
          </motion.button>
        ))}
      </div>
      <TeacherNoteInput locale={loc} onSend={(t) => onAnswer?.(t)} />
    </CardShell>
  );
};

/* ───────────────────── Mermaid diagram ───────────────────── */

const MermaidCard = ({ card }: BaseProps) => {
  const tt = getLearnStrings(localeFromCard(card));
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const id = useRef(`m-${Math.random().toString(36).slice(2, 9)}`);

  useEffect(() => {
    let cancelled = false;
    const code = String(card.code || "").trim();
    if (!code || !ref.current) return;
    loadMermaid()
      .then((mm) => mm.render(id.current, code))
      .then(({ svg }: { svg: string }) => {
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(String((e as any)?.message || e));
      });
    return () => {
      cancelled = true;
    };
  }, [card.code]);

  return (
    <CardShell tone="violet" label={tt.visual_explanation}>
      {card.title && <p className="text-sm font-semibold text-foreground">{card.title}</p>}
      <div
        ref={ref}
        className="overflow-x-auto rounded-xl bg-background/40 border border-border/40 p-3 [&_svg]:max-w-full [&_svg]:h-auto"
      />
      {err && (
        <div className="text-xs text-rose-700 dark:text-rose-300">
          {tt.cannot_draw}: {err}
        </div>
      )}
    </CardShell>
  );
};

/* ───────────────────── Roadmap ───────────────────── */

const RoadmapCard = ({ card, onAnswer }: BaseProps) => {
  const tt = getLearnStrings(localeFromCard(card));
  const stages = card.stages || [];
  return (
    <CardShell tone="blue" label={tt.learning_map}>
      {card.title && <p className="text-[15px] font-semibold text-foreground">{card.title}</p>}
      <div className="relative space-y-2">
        {/* timeline spine */}
        <div className="absolute start-3 top-4 bottom-4 w-px bg-gradient-to-b from-blue-400/40 via-blue-400/20 to-transparent" />
        {stages.map((s: any, i: number) => (
          <div
            key={i}
            className="relative rounded-2xl border border-border/50 bg-card/60 p-3.5 ps-10 space-y-1.5"
          >
            <span className="absolute start-[3px] top-[14px] w-6 h-6 rounded-full bg-blue-500 text-foreground text-[11px] font-bold flex items-center justify-center shadow-[0_0_0_3px_hsl(var(--card))]">
              {i + 1}
            </span>
            <div className="text-sm font-semibold text-foreground">{s.title}</div>
            {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
            {s.resources && s.resources.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {s.resources.map((r: string, k: number) => (
                  <span
                    key={k}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-400/20"
                  >
                    {r}
                  </span>
                ))}
              </div>
            )}
            {s.project && (
              <div className="text-[11px] text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> {s.project}
              </div>
            )}
            <button
              type="button"
              onClick={() => onAnswer?.(tt.start_with_stage(s.title))}
              className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-200 transition-colors"
            >
              {tt.start_stage} →
            </button>
          </div>
        ))}
      </div>
    </CardShell>
  );
};

/* ───────────────────── Exam setup ───────────────────── */

const ExamSetupCard = ({ card, onAnswer }: BaseProps) => {
  const tt = getLearnStrings(localeFromCard(card));
  const [topic, setTopic] = useState(card.suggestedTopic || "");
  const [count, setCount] = useState(10);
  const [duration, setDuration] = useState(15);
  const [difficulty, setDifficulty] = useState(tt.diff_intermediate);
  const [types, setTypes] = useState<string[]>([tt.type_mcq]);

  const allTypes = [tt.type_mcq, tt.type_tf, tt.type_fill, tt.type_justify];
  const toggleType = (t: string) =>
    setTypes((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));

  const submit = () => {
    onAnswer?.(tt.prepare_exam({ topic, count, duration, difficulty, types: types.join(", ") }));
  };

  return (
    <CardShell tone="rose" label={tt.setup_exam}>
      <div className="space-y-3">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={tt.topic_placeholder}
          className="w-full px-3.5 py-2.5 rounded-2xl border border-border/60 bg-background/60 text-sm outline-none focus:border-rose-400/60 focus:ring-2 focus:ring-rose-400/20 transition-all"
        />
        <div className="grid grid-cols-2 gap-2.5">
          <label className="text-xs text-muted-foreground space-y-1.5">
            {tt.num_questions}
            <input
              type="number"
              min={3}
              max={30}
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value) || 10)}
              className="w-full px-3 py-2 rounded-xl border border-border/50 bg-background/60 text-sm font-semibold outline-none focus:border-rose-400/60"
            />
          </label>
          <label className="text-xs text-muted-foreground space-y-1.5">
            {tt.duration_minutes}
            <input
              type="number"
              min={1}
              max={120}
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value) || 15)}
              className="w-full px-3 py-2 rounded-xl border border-border/50 bg-background/60 text-sm font-semibold outline-none focus:border-rose-400/60"
            />
          </label>
        </div>
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {tt.difficulty}
          </div>
          <div className="flex gap-1.5 p-1 rounded-2xl bg-muted/40 border border-border/40">
            {[tt.diff_easy, tt.diff_intermediate, tt.diff_hard].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDifficulty(d)}
                className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  difficulty === d
                    ? "bg-card text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.15)]"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {tt.question_types}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allTypes.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all ${
                  types.includes(t)
                    ? "bg-rose-500/15 text-rose-700 dark:text-rose-200 border-rose-400/50"
                    : "bg-background/60 border-border/50 text-muted-foreground hover:border-rose-400/30"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={!topic.trim() || types.length === 0}
          className="w-full py-2.5 rounded-2xl bg-gradient-to-b from-rose-500 to-rose-600 text-foreground text-sm font-semibold shadow-[0_8px_20px_-8px_rgba(244,63,94,0.5)] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {tt.start_exam}
        </button>
      </div>
    </CardShell>
  );
};

/* ───────────────────── Exam runner ───────────────────── */

const CircularTimer = ({ remaining, total }: { remaining: number; total: number }) => {
  const pct = total > 0 ? remaining / total : 0;
  const R = 14;
  const C = 2 * Math.PI * R;
  const off = C * (1 - pct);
  const min = String(Math.floor(remaining / 60)).padStart(2, "0");
  const sec = String(remaining % 60).padStart(2, "0");
  const urgent = remaining < 30 && remaining > 0;
  return (
    <div className="relative w-9 h-9">
      <svg viewBox="0 0 36 36" className={`w-9 h-9 -rotate-90 ${urgent ? "animate-pulse" : ""}`}>
        <circle cx="18" cy="18" r={R} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="3" />
        <circle
          cx="18"
          cy="18"
          r={R}
          fill="none"
          stroke={urgent ? "#f43f5e" : "#f43f5e"}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 1s linear" }}
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center text-[9px] font-mono font-bold tabular-nums ${
          urgent ? "text-rose-600 dark:text-rose-300" : "text-foreground"
        }`}
      >
        {min}:{sec}
      </span>
    </div>
  );
};

const ExamRunnerCard = ({ card, onAnswer }: BaseProps) => {
  const tt = getLearnStrings(localeFromCard(card));
  const questions = card.questions || [];
  const totalSec = (card.durationMin || 10) * 60;
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [done, setDone] = useState(false);
  const [remaining, setRemaining] = useState(totalSec);

  useEffect(() => {
    if (done) return;
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(t);
          setDone(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [done]);

  const finish = () => setDone(true);

  if (done) {
    const correct = questions.reduce(
      (acc: number, q: any, i: number) => acc + (answers[i] === q.correct ? 1 : 0),
      0,
    );
    const pct = questions.length ? Math.round((correct / questions.length) * 100) : 0;
    const grade = pct >= 85 ? "🏆" : pct >= 70 ? "🎉" : pct >= 50 ? "👍" : "💪";
    // score ring
    const R = 30;
    const C = 2 * Math.PI * R;
    return (
      <CardShell tone="rose" label={tt.exam_result}>
        <div className="flex items-center justify-center py-2">
          <div className="relative w-32 h-32">
            <svg viewBox="0 0 72 72" className="w-full h-full -rotate-90">
              <circle cx="36" cy="36" r={R} fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="5" />
              <motion.circle
                cx="36"
                cy="36"
                r={R}
                fill="none"
                stroke="#f43f5e"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={C}
                initial={{ strokeDashoffset: C }}
                animate={{ strokeDashoffset: C * (1 - pct / 100) }}
                transition={{ duration: 1.1, ease: "easeOut" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl leading-none" aria-hidden>{grade}</span>
              <span className="text-2xl font-bold text-rose-700 dark:text-rose-200 mt-1 tabular-nums">
                {pct}%
              </span>
            </div>
          </div>
        </div>
        <div className="text-center text-xs text-muted-foreground -mt-1">
          {tt.correct_of_total(correct, questions.length)}
        </div>
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {questions.map((q: any, i: number) => {
            const ok = answers[i] === q.correct;
            return (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span
                  className={`w-4 h-4 rounded-full grid place-items-center shrink-0 mt-0.5 ${
                    ok ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300" : "bg-rose-500/20 text-rose-600 dark:text-rose-300"
                  }`}
                >
                  {ok ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                </span>
                <span className="text-foreground/80 flex-1">{q.question}</span>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => onAnswer?.(tt.score_analysis(correct, questions.length))}
          className="w-full py-2.5 rounded-2xl bg-gradient-to-b from-rose-500 to-rose-600 text-foreground text-sm font-semibold shadow-[0_8px_20px_-8px_rgba(244,63,94,0.5)] hover:brightness-110 transition-all"
        >
          {tt.analyze_result}
        </button>
      </CardShell>
    );
  }

  const q = questions[idx];
  if (!q) return null;

  return (
    <CardShell
      tone="rose"
      label={tt.question_n_of_m(idx + 1, questions.length)}
      rightSlot={<CircularTimer remaining={remaining} total={totalSec} />}
    >
      {/* step dots */}
      <div className="flex items-center gap-1">
        {questions.map((_: any, i: number) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < idx
                ? "bg-rose-500/60"
                : i === idx
                  ? "bg-rose-500"
                  : answers[i] !== undefined
                    ? "bg-rose-400/40"
                    : "bg-muted/60"
            }`}
          />
        ))}
      </div>
      {card.topic && <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{card.topic}</div>}
      <motion.div
        key={idx}
        initial={{ opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25 }}
        className="space-y-3"
      >
        <p className="text-[15px] font-semibold text-foreground leading-snug">{q.question}</p>
        <div className="space-y-2">
          {(q.options || []).map((o: string, i: number) => {
            const picked = answers[idx] === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setAnswers({ ...answers, [idx]: i })}
                className={`w-full text-start px-4 py-2.5 rounded-2xl border text-sm transition-all flex items-center gap-3 ${
                  picked
                    ? "border-rose-400/60 bg-rose-500/10 text-foreground"
                    : "border-border/60 bg-card/60 hover:border-rose-400/40 text-foreground/85"
                }`}
              >
                <span
                  className={`w-6 h-6 rounded-lg text-[11px] font-bold grid place-items-center shrink-0 ${
                    picked ? "bg-rose-500 text-foreground" : "bg-muted/60 text-muted-foreground"
                  }`}
                >
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="flex-1">{o}</span>
              </button>
            );
          })}
        </div>
      </motion.div>
      <div className="flex gap-2">
        {idx > 0 && (
          <button
            type="button"
            onClick={() => setIdx(idx - 1)}
            className="flex-1 py-2 rounded-xl bg-background/60 border border-border/50 text-xs font-medium hover:bg-muted/50 transition-colors"
          >
            {tt.previous}
          </button>
        )}
        {idx < questions.length - 1 ? (
          <button
            type="button"
            onClick={() => setIdx(idx + 1)}
            disabled={answers[idx] === undefined}
            className="flex-1 py-2 rounded-xl bg-rose-500/20 text-rose-700 dark:text-rose-200 text-xs font-semibold hover:bg-rose-500/30 disabled:opacity-40 transition-colors"
          >
            {tt.next}
          </button>
        ) : (
          <button
            type="button"
            onClick={finish}
            className="flex-1 py-2 rounded-xl bg-gradient-to-b from-rose-500 to-rose-600 text-foreground text-xs font-semibold shadow-[0_6px_16px_-8px_rgba(244,63,94,0.5)] hover:brightness-110 transition-all"
          >
            {tt.finish_view_score}
          </button>
        )}
      </div>
    </CardShell>
  );
};

/* ───────────────────── Photo solve ───────────────────── */

const PhotoSolveCard = ({ card, onAnswer }: BaseProps) => {
  const tt = getLearnStrings(localeFromCard(card));
  return (
    <CardShell tone="blue" label={tt.step_by_step}>
      {card.problem && (
        <p className="text-[15px] font-semibold text-foreground leading-snug">{card.problem}</p>
      )}
      <ol className="space-y-2">
        {(card.steps || []).map((s: string, i: number) => (
          <li key={i} className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-300 text-[11px] font-bold grid place-items-center">
              {i + 1}
            </span>
            <span className="text-sm text-foreground/90 leading-relaxed flex-1">{s}</span>
          </li>
        ))}
      </ol>
      {card.answer && (
        <div className="rounded-2xl bg-gradient-to-b from-blue-500/10 to-blue-500/[0.03] border border-blue-400/30 px-4 py-3 text-sm font-semibold text-blue-800 dark:text-blue-100 flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          {tt.final_answer}: {card.answer}
        </div>
      )}
      {card.similar && card.similar.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {tt.try_similar}
          </div>
          {card.similar.map((q: string, i: number) => (
            <button
              key={i}
              type="button"
              onClick={() => onAnswer?.(tt.solve_for_me(q))}
              className="w-full text-start text-xs px-3 py-2.5 rounded-xl bg-background/60 border border-border/50 hover:border-blue-400/40 hover:bg-blue-500/[0.04] transition-colors flex items-center gap-2"
            >
              <span className="w-4 h-4 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 text-[10px] font-bold grid place-items-center shrink-0">
                {i + 1}
              </span>
              <span className="flex-1">{q}</span>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground rtl:rotate-180" />
            </button>
          ))}
        </div>
      )}
    </CardShell>
  );
};

/* ───────────────────── Onboarding ───────────────────── */

const OnboardingCard = ({ card, onAnswer }: BaseProps) => {
  const tt = getLearnStrings(localeFromCard(card));
  const [interests, setInterests] = useState("");
  const [level, setLevel] = useState("");
  return (
    <CardShell tone="emerald" label={tt.introduce_yourself}>
      <p className="text-[15px] font-semibold text-foreground leading-snug">
        {card.question || "So I can explain in a way that suits you:"}
      </p>
      <input
        value={interests}
        onChange={(e) => setInterests(e.target.value)}
        placeholder="Your hobbies (football, games, cooking...)"
        className="w-full px-3.5 py-2.5 rounded-2xl border border-border/60 bg-background/60 text-sm outline-none focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20 transition-all"
      />
      <div className="flex gap-1.5 p-1 rounded-2xl bg-muted/40 border border-border/40">
        {[tt.diff_easy, tt.diff_intermediate, tt.diff_hard].map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLevel(l)}
            className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-all ${
              level === l
                ? "bg-card text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.15)]"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={!interests.trim() || !level}
        onClick={() =>
          onAnswer?.(
            `My info: hobbies ${interests}, level ${level}. Use analogies from my interests in every explanation from now on.`,
          )
        }
        className="w-full py-2.5 rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-600 text-foreground text-sm font-semibold shadow-[0_8px_20px_-8px_rgba(16,185,129,0.5)] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        {tt.confirm} →
      </button>
    </CardShell>
  );
};

/* ───────────────────── Flashcard (spaced-repetition flip) ───────────────────── */

const FlashcardCard = ({ card, onAnswer }: BaseProps) => {
  const loc = localeFromCard(card);
  const tt = getLearnStrings(loc);
  const [flipped, setFlipped] = useState(false);
  const [rated, setRated] = useState<null | "knew" | "almost" | "didnt">(null);

  const rate = (r: "knew" | "almost" | "didnt") => {
    if (rated) return;
    setRated(r);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { (navigator as any).vibrate?.(r === "knew" ? 8 : 20); } catch {}
    }
    const payload = `[LEARN_ANSWER] type=flashcard front="${card.front || card.question || ""}" back="${card.back || card.answer || ""}" self_rating=${r}`;
    setTimeout(() => onAnswer?.(payload), 120);
  };

  return (
    <CardShell tone="violet" label={tt.flashcard_label}>
      <motion.button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        whileTap={{ scale: 0.98 }}
        className="relative w-full min-h-[140px] rounded-2xl border border-border/60 bg-gradient-to-b from-violet-500/[0.06] to-violet-500/[0.02] hover:from-violet-500/[0.10] hover:to-violet-500/[0.04] px-5 py-5 text-start transition-all"
        aria-label={tt.flashcard_flip}
      >
        <AnimatePresence mode="wait">
          {!flipped ? (
            <motion.div
              key="front"
              initial={{ opacity: 0, rotateY: -20 }}
              animate={{ opacity: 1, rotateY: 0 }}
              exit={{ opacity: 0, rotateY: 20 }}
              transition={{ duration: 0.25 }}
              className="space-y-2"
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-600 dark:text-violet-300 font-mono">
                {card.category || tt.flashcard_label}
              </div>
              <div className="text-[17px] font-semibold text-foreground leading-snug">
                {card.front || card.question}
              </div>
              <div className="pt-2 text-[11px] text-muted-foreground">{tt.flashcard_flip} ↻</div>
            </motion.div>
          ) : (
            <motion.div
              key="back"
              initial={{ opacity: 0, rotateY: -20 }}
              animate={{ opacity: 1, rotateY: 0 }}
              exit={{ opacity: 0, rotateY: 20 }}
              transition={{ duration: 0.25 }}
              className="space-y-2"
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300 font-mono">
                {tt.correct_answer}
              </div>
              <div className="text-[16px] text-foreground leading-relaxed">{card.back || card.answer}</div>
              {card.explain && (
                <div className="text-xs text-muted-foreground leading-relaxed border-s-2 border-violet-400/40 ps-3 mt-2">
                  {card.explain}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {flipped && !rated && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-3 gap-2"
          >
            <button
              type="button"
              onClick={() => rate("didnt")}
              className="min-h-11 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-xs font-semibold transition-colors"
            >
              {tt.flashcard_didnt}
            </button>
            <button
              type="button"
              onClick={() => rate("almost")}
              className="min-h-11 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-semibold transition-colors"
            >
              {tt.flashcard_almost}
            </button>
            <button
              type="button"
              onClick={() => rate("knew")}
              className="min-h-11 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-semibold transition-colors"
            >
              {tt.flashcard_knew}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </CardShell>
  );
};

/* ───────────────────── Ordering (put steps in order) ───────────────────── */

const OrderingCard = ({ card, onAnswer }: BaseProps) => {
  const loc = localeFromCard(card);
  const tt = getLearnStrings(loc);
  const steps: string[] = Array.isArray(card.steps) ? card.steps : [];
  const correctOrder: number[] = Array.isArray(card.correct)
    ? card.correct
    : steps.map((_, i) => i);
  // Shuffle initial order deterministically-ish so re-render is stable
  const initial = useMemo(() => {
    const a = steps.map((_, i) => i);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor((Math.sin(i + steps.length) + 1) * 5) % (i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    // Guard against already-sorted shuffle
    if (a.every((v, i) => v === correctOrder[i])) {
      [a[0], a[a.length - 1]] = [a[a.length - 1], a[0]];
    }
    return a;
  }, [steps.length]);
  const [order, setOrder] = useState<number[]>(initial);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const isRight = submitted && order.every((v, i) => v === correctOrder[i]);

  const onTap = (idx: number) => {
    if (submitted) return;
    if (selectedIdx === null) {
      setSelectedIdx(idx);
      return;
    }
    if (selectedIdx === idx) {
      setSelectedIdx(null);
      return;
    }
    setOrder((o) => {
      const n = [...o];
      [n[selectedIdx], n[idx]] = [n[idx], n[selectedIdx]];
      return n;
    });
    setSelectedIdx(null);
  };

  const submit = () => {
    setSubmitted(true);
    const asText = order.map((oi, i) => `${i + 1}. ${steps[oi]}`).join(" | ");
    const correctText = correctOrder.map((oi, i) => `${i + 1}. ${steps[oi]}`).join(" | ");
    const ok = order.every((v, i) => v === correctOrder[i]);
    const payload = ok
      ? `[LEARN_ANSWER] type=ordering result=correct order="${asText}"`
      : `[LEARN_ANSWER] type=ordering result=incorrect order="${asText}" correct="${correctText}"`;
    setTimeout(() => onAnswer?.(payload), 120);
  };

  return (
    <CardShell tone="blue" label={tt.ordering_label} rightSlot={!submitted ? <span className="text-[10px] text-muted-foreground">{tt.ordering_hint}</span> : null}>
      {card.question && (
        <p className="text-[15px] font-semibold text-foreground leading-snug">{card.question}</p>
      )}
      <ol className="space-y-2">
        {order.map((si, i) => {
          const isSel = selectedIdx === i;
          const isCorrectPos = submitted && si === correctOrder[i];
          const isWrongPos = submitted && si !== correctOrder[i];
          let cls = "border-border/60 bg-card/60 hover:border-blue-300/60";
          if (isSel) cls = "border-blue-400/70 bg-blue-500/[0.12] " + TONE.blue.glow;
          if (isCorrectPos) cls = "border-emerald-400/70 bg-emerald-500/[0.10]";
          if (isWrongPos) cls = "border-rose-400/60 bg-rose-500/[0.08]";
          return (
            <motion.li
              key={si}
              layout
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              <button
                type="button"
                disabled={submitted}
                onClick={() => onTap(i)}
                className={`w-full flex items-center gap-3 text-start px-4 py-3 rounded-2xl border text-sm transition-all ${cls}`}
              >
                <span className="w-7 h-7 rounded-xl bg-blue-500/15 text-blue-700 dark:text-blue-300 text-[11px] font-bold grid place-items-center shrink-0">
                  {i + 1}
                </span>
                <span className="flex-1">{steps[si]}</span>
                {submitted && isCorrectPos && <Check className="w-4 h-4 text-emerald-500" />}
                {submitted && isWrongPos && <X className="w-4 h-4 text-rose-500" />}
              </button>
            </motion.li>
          );
        })}
      </ol>
      {!submitted ? (
        <button
          type="button"
          onClick={submit}
          className="w-full py-2.5 rounded-2xl bg-gradient-to-b from-blue-500 to-blue-600 text-foreground text-sm font-semibold shadow-[0_8px_20px_-8px_rgba(59,130,246,0.5)] hover:brightness-110 transition-all"
        >
          {tt.ordering_check}
        </button>
      ) : (
        <div className="space-y-2">
          <ResultBanner
            right={isRight}
            labelRight={tt.ordering_all_right}
            labelWrong={tt.ordering_some_wrong}
          />
          {card.explain && (
            <div className="text-xs text-muted-foreground leading-relaxed border-s-2 border-blue-400/40 ps-3">
              {card.explain}
            </div>
          )}
        </div>
      )}
    </CardShell>
  );
};

/* ───────────────────── Summary write (Feynman) ───────────────────── */

const SummaryWriteCard = ({ card, onAnswer }: BaseProps) => {
  const loc = localeFromCard(card);
  const tt = getLearnStrings(loc);
  const [val, setVal] = useState("");
  const [sent, setSent] = useState(false);
  const min = Math.max(20, Number(card.minChars) || 60);
  const submit = () => {
    if (val.trim().length < 5 || sent) return;
    setSent(true);
    const payload = `[LEARN_ANSWER] type=summary_write topic="${card.topic || card.question || ""}" summary="${val.trim().replace(/"/g, "'")}"`;
    setTimeout(() => onAnswer?.(payload), 120);
  };
  const pct = Math.min(100, (val.length / min) * 100);
  return (
    <CardShell tone="violet" label={tt.summary_label}>
      <p className="text-[15px] font-semibold text-foreground leading-snug">
        {card.question || card.topic}
      </p>
      <div className="relative">
        <textarea
          value={val}
          onChange={(e) => setVal(e.target.value)}
          disabled={sent}
          rows={4}
          placeholder={tt.summary_placeholder}
          className="w-full px-4 py-3 rounded-2xl border border-border/60 bg-background/60 text-sm text-foreground outline-none focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/20 transition-all resize-none disabled:opacity-60"
        />
        <div className="mt-1.5 h-1 rounded-full bg-muted/60 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-violet-400 to-violet-600"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 25 }}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={val.trim().length < 5 || sent}
        className="w-full py-2.5 rounded-2xl bg-gradient-to-b from-violet-500 to-violet-600 text-foreground text-sm font-semibold shadow-[0_8px_20px_-8px_rgba(139,92,246,0.5)] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        {sent ? tt.sent_grading : tt.summary_submit}
      </button>
    </CardShell>
  );
};

/* ───────────────────── Scenario (branching) ───────────────────── */

const ScenarioCard = ({ card, onAnswer }: BaseProps) => {
  const loc = localeFromCard(card);
  const tt = getLearnStrings(loc);
  const [picked, setPicked] = useState<number | null>(null);
  const choices: Array<{ text: string; outcome?: string; correct?: boolean }> = Array.isArray(card.choices) ? card.choices : [];
  const pick = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    const c = choices[i];
    const payload = `[LEARN_ANSWER] type=scenario chosen="${c?.text ?? ""}" result=${c?.correct ? "correct" : "incorrect"}`;
    setTimeout(() => onAnswer?.(payload), 120);
  };
  const chosen = picked !== null ? choices[picked] : null;
  return (
    <CardShell tone="amber" label={tt.scenario_label}>
      {card.title && (
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-600 dark:text-amber-300 font-mono">
          {card.title}
        </div>
      )}
      {card.situation && (
        <p className="text-[15px] text-foreground leading-relaxed">{card.situation}</p>
      )}
      {card.question && (
        <p className="text-[15px] font-semibold text-foreground leading-snug">{card.question}</p>
      )}
      <div className="flex flex-col gap-2">
        {choices.map((c, i) => {
          const isPicked = picked === i;
          const revealed = picked !== null;
          let cls = "border-border/60 bg-card/60 hover:border-amber-300/60";
          if (revealed) {
            if (c.correct) cls = "border-emerald-400/70 bg-emerald-500/[0.10]";
            else if (isPicked) cls = "border-rose-400/60 bg-rose-500/[0.08]";
            else cls = "border-border/40 bg-card/40 opacity-60";
          }
          return (
            <motion.button
              key={i}
              type="button"
              disabled={picked !== null}
              onClick={() => pick(i)}
              whileTap={{ scale: 0.985 }}
              className={`text-start px-4 py-3 rounded-2xl border text-sm transition-all ${cls}`}
            >
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[11px] font-bold grid place-items-center shrink-0">
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="flex-1 font-medium text-foreground/90">{c.text}</span>
                {revealed && c.correct && <Check className="w-4 h-4 text-emerald-500" />}
                {revealed && isPicked && !c.correct && <X className="w-4 h-4 text-rose-500" />}
              </div>
            </motion.button>
          );
        })}
      </div>
      <AnimatePresence>
        {chosen && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2"
          >
            <ResultBanner
              right={!!chosen.correct}
              labelRight={tt.scenario_best_choice}
              labelWrong={tt.scenario_outcome}
            />
            {chosen.outcome && (
              <div className="rounded-2xl bg-amber-500/[0.08] border border-amber-400/30 px-4 py-3 text-sm text-foreground/90 leading-relaxed">
                {chosen.outcome}
              </div>
            )}
            {card.explain && (
              <div className="text-xs text-muted-foreground leading-relaxed border-s-2 border-amber-400/40 ps-3">
                {card.explain}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </CardShell>
  );
};

/* ───────────────────── Router ───────────────────── */


const LearnCard = ({
  card,
  onAnswer,
}: {
  card: LearnCardData;
  onAnswer?: (text: string) => void;
}) => {
  // Capture the current subject into the study HUD/prompt-state whenever
  // the tutor emits a topic-bearing card (checkin/onboarding/roadmap).
  // Best-effort — silent if `topic`/`title` are missing.
  useEffect(() => {
    const t =
      (card as any).topic ||
      (card as any).subject ||
      (card as any).title ||
      "";
    if (t) {
      setStudyTopic(String(t));
      noteTopicVisit(String(t));
    }
  }, [card]);

  switch (card.type) {
    case "mcq":
      return <MCQCard card={card} onAnswer={onAnswer} />;
    case "multi":
      return <MultiCard card={card} onAnswer={onAnswer} />;
    case "truefalse":
      return <TrueFalseCard card={card} onAnswer={onAnswer} />;
    case "explain":
      return <ExplainCard card={card} onAnswer={onAnswer} />;
    case "fill":
      return <FillCard card={card} onAnswer={onAnswer} />;
    case "match":
      return <MatchCard card={card} onAnswer={onAnswer} />;
    case "checkin":
      return <CheckinCard card={card} onAnswer={onAnswer} />;
    case "mermaid":
      return <MermaidCard card={card} onAnswer={onAnswer} />;
    case "roadmap":
      return <RoadmapCard card={card} onAnswer={onAnswer} />;
    case "exam_setup":
      return <ExamSetupCard card={card} onAnswer={onAnswer} />;
    case "exam_runner":
      return <ExamRunnerCard card={card} onAnswer={onAnswer} />;
    case "photo_solve":
      return <PhotoSolveCard card={card} onAnswer={onAnswer} />;
    case "onboarding":
      return <OnboardingCard card={card} onAnswer={onAnswer} />;
    case "flashcard":
      return <FlashcardCard card={card} onAnswer={onAnswer} />;
    case "ordering":
      return <OrderingCard card={card} onAnswer={onAnswer} />;
    case "summary_write":
      return <SummaryWriteCard card={card} onAnswer={onAnswer} />;
    case "scenario":
      return <ScenarioCard card={card} onAnswer={onAnswer} />;
    default:

      return (
        <CardShell tone="amber" label={getLearnStrings(localeFromCard(card)).card}>
          <pre className="text-xs text-muted-foreground overflow-x-auto">
            {JSON.stringify(card, null, 2)}
          </pre>
        </CardShell>
      );
  }
};

export default LearnCard;
