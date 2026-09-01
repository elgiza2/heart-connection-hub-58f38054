// World-class docs clarify wizard.
//
// Renders the questionnaire that the docs agent sends back before generating
// a document (CV, cover letter, contract, invoice, business plan, …). It
// asks the user every essential field marked required + all optional
// personalization fields, with grouped progress, inline validation, and
// keyboard-friendly navigation. The final answers are submitted to the
// backend which then produces a print-ready HTML document.
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { DocsClarifyQuestion, DocsClarifyUi } from "@/lib/agent/docs/types";

interface Props {
  reason: string;
  questions: DocsClarifyQuestion[];
  ui?: DocsClarifyUi;
  onSubmit: (answers: Record<string, string>) => void;
  busy?: boolean;
}

function isEmpty(v: string | undefined | null): boolean {
  return !v || !String(v).trim();
}

function validate(q: DocsClarifyQuestion, value: string): string | null {
  if (isEmpty(value)) return q.required ? "This field is required" : null;
  const v = value.trim();
  if (q.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Enter a valid email";
  if (q.type === "url" && !/^https?:\/\/\S+$/i.test(v)) return "Enter a valid URL (https://…)";
  if (q.type === "number" && isNaN(Number(v))) return "Enter a valid number";
  if (q.maxLength && v.length > q.maxLength) return `Max ${q.maxLength} characters`;
  return null;
}

export default function DocsClarifyCard({ reason, questions, ui, onSubmit, busy }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, DocsClarifyQuestion[]>();
    for (const q of questions) {
      const key = q.group || "Details";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(q);
    }
    return Array.from(map.entries());
  }, [questions]);

  const totalRequired = questions.filter((q) => q.required).length;
  const filledRequired = questions.filter(
    (q) => q.required && !isEmpty(answers[q.id]),
  ).length;
  const progress = totalRequired > 0 ? filledRequired / totalRequired : 1;

  const setValue = (id: string, v: string) => {
    setAnswers((prev) => ({ ...prev, [id]: v }));
    if (errors[id]) setErrors((prev) => ({ ...prev, [id]: "" }));
  };

  const submitAll = () => {
    const errs: Record<string, string> = {};
    for (const q of questions) {
      const e = validate(q, answers[q.id] || "");
      if (e) errs[q.id] = e;
    }
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error(ui?.optionalHint || "Please fill the required fields");
      return;
    }
    setSubmitted(true);
    onSubmit(answers);
  };

  const skipAll = () => {
    setSubmitted(true);
    const skip: Record<string, string> = {};
    for (const q of questions) {
      skip[q.id] = answers[q.id] || (q.required ? "__skip__: use best defaults" : "");
    }
    onSubmit(skip);
  };

  if (submitted) {
    return (
      <div className="my-3 rounded-2xl border border-foreground/10 bg-neutral-900/60 p-4 text-sm text-neutral-300">
        {ui?.thinking || "Preparing your document…"}
      </div>
    );
  }

  return (
    <div className="my-3 rounded-2xl border border-foreground/10 bg-gradient-to-b from-neutral-900/80 to-neutral-950/80 p-4 md:p-5 shadow-xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wider text-amber-400/80">
            {ui?.phase || "Clarifying phase"}
          </div>
          <h3 className="mt-0.5 truncate text-base font-semibold text-neutral-100">
            {ui?.title || "Before I start your document"}
          </h3>
        </div>
        <div className="shrink-0 text-xs text-neutral-400">
          {filledRequired}/{totalRequired}
        </div>
      </div>

      <div className="mb-4 h-1 w-full overflow-hidden rounded-full bg-foreground/5">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-[width] duration-300"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      {reason ? (
        <p className="mb-4 text-sm leading-relaxed text-neutral-300">{reason}</p>
      ) : null}

      <div className="space-y-5">
        {groups.map(([group, qs]) => (
          <fieldset key={group} className="space-y-3">
            <legend className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              {group}
            </legend>
            {qs.map((q) => (
              <QuestionField
                key={q.id}
                q={q}
                value={answers[q.id] || ""}
                error={errors[q.id]}
                onChange={(v) => setValue(q.id, v)}
              />
            ))}
          </fieldset>
        ))}
      </div>

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={skipAll}
          disabled={busy}
          className="rounded-full px-4 py-2 text-sm text-neutral-400 transition hover:text-neutral-200 disabled:opacity-50"
        >
          {ui?.finishEarly || "Skip and use best defaults"}
        </button>
        <button
          type="button"
          onClick={submitAll}
          disabled={busy}
          className="rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-2.5 text-sm font-semibold text-neutral-900 shadow-lg shadow-orange-500/20 transition hover:from-amber-300 hover:to-orange-400 disabled:opacity-50"
        >
          {ui?.startDesign || "Generate document"}
        </button>
      </div>
    </div>
  );
}

function QuestionField({
  q,
  value,
  error,
  onChange,
}: {
  q: DocsClarifyQuestion;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const baseInput =
    "w-full rounded-lg border bg-neutral-950/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none transition focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/20";
  const borderCls = error ? "border-red-500/60" : "border-foreground/10";

  return (
    <label className="block">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-sm font-medium text-neutral-200">{q.label}</span>
        {q.required ? (
          <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-300">
            Required
          </span>
        ) : (
          <span className="rounded bg-foreground/5 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400">
            Optional
          </span>
        )}
      </div>
      {q.help ? <p className="mb-1.5 text-xs text-neutral-400">{q.help}</p> : null}

      {q.type === "long_text" ? (
        <textarea
          rows={4}
          value={value}
          maxLength={q.maxLength}
          placeholder={q.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`${baseInput} ${borderCls} resize-y`}
        />
      ) : q.type === "choice" && q.options?.length ? (
        <div className="flex flex-wrap gap-2">
          {q.options.map((opt) => (
            <button
              type="button"
              key={opt}
              onClick={() => onChange(opt)}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                value === opt
                  ? "border-amber-400/60 bg-amber-400/10 text-amber-200"
                  : "border-foreground/10 bg-foreground/5 text-neutral-300 hover:border-foreground/20"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : q.type === "multi_choice" && q.options?.length ? (
        <div className="flex flex-wrap gap-2">
          {q.options.map((opt) => {
            const selected = value.split("|").filter(Boolean);
            const isOn = selected.includes(opt);
            return (
              <button
                type="button"
                key={opt}
                onClick={() => {
                  const next = isOn
                    ? selected.filter((x) => x !== opt)
                    : [...selected, opt];
                  onChange(next.join("|"));
                }}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  isOn
                    ? "border-amber-400/60 bg-amber-400/10 text-amber-200"
                    : "border-foreground/10 bg-foreground/5 text-neutral-300 hover:border-foreground/20"
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      ) : (
        <input
          type={
            q.type === "email"
              ? "email"
              : q.type === "url"
                ? "url"
                : q.type === "number"
                  ? "number"
                  : q.type === "date"
                    ? "date"
                    : q.type === "phone"
                      ? "tel"
                      : "text"
          }
          value={value}
          maxLength={q.maxLength}
          placeholder={q.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`${baseInput} ${borderCls}`}
        />
      )}

      {error ? <p className="mt-1 text-xs text-red-400">{error}</p> : null}
    </label>
  );
}
