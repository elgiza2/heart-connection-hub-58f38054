import { useState } from "react";
import { m as motion } from "framer-motion";
import { HelpCircle, ArrowRight, X } from "lucide-react";

export type ClarifyQuestion = {
  id: string;
  text: string;
  options?: string[];
};

interface Props {
  questions: ClarifyQuestion[];
  onSubmit: (answers: Record<string, string>) => void;
  onSkip: () => void;
}

const ClarifyDialog = ({ questions, onSubmit, onSkip }: Props) => {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const setAnswer = (id: string, val: string) => setAnswers((p) => ({ ...p, [id]: val }));
  const allAnswered = questions.every((q) => (answers[q.id] || "").trim().length > 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-3 rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4 backdrop-blur-sm"
    >
      <div className="flex items-start gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-violet-500/15 flex items-center justify-center shrink-0">
          <HelpCircle className="w-4 h-4 text-violet-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground">A quick clarification</h3>
          <p className="text-xs text-muted-foreground">
            Help me focus the research and I'll deliver a sharper report.
          </p>
        </div>
        <button onClick={onSkip} className="p-1 rounded-md hover:bg-accent/40">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="space-y-3">
        {questions.map((q) => (
          <div key={q.id}>
            <p className="text-xs font-medium text-foreground/90 mb-1.5">{q.text}</p>
            {q.options && q.options.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {q.options.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setAnswer(q.id, opt)}
                    className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                      answers[q.id] === opt
                        ? "border-violet-400 bg-violet-500/20 text-violet-200"
                        : "border-border/40 bg-background/40 text-foreground/80 hover:border-violet-400/40"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <input
                type="text"
                value={answers[q.id] || ""}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                placeholder="Type your answer…"
                className="w-full rounded-lg bg-background/60 border border-border/40 px-3 py-1.5 text-xs focus:outline-none focus:border-violet-400"
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          onClick={onSkip}
          className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5"
        >
          Skip & let Megsy decide
        </button>
        <button
          disabled={!allAnswered}
          onClick={() => onSubmit(answers)}
          className="inline-flex items-center gap-1 rounded-lg bg-violet-500 hover:bg-violet-400 disabled:opacity-40 disabled:cursor-not-allowed text-foreground text-xs px-3 py-1.5 transition-colors"
        >
          Continue <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </motion.div>
  );
};

export default ClarifyDialog;
