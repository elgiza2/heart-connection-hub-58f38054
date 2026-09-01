import { useState, useEffect } from "react";
import { m as motion } from "framer-motion";

interface FlowStep {
  title: string;
  description: string;
  actions?: string[];
}

interface FlowCardProps {
  steps: FlowStep[];
  onAction: (action: string, stepTitle: string) => void;
}

const CARD_COLORS = [
  "flow-card-purple",
  "flow-card-blue",
  "flow-card-green",
  "flow-card-amber",
  "flow-card-teal",
];

const TypewriterText = ({ text, delay = 0 }: { text: string; delay?: number }) => {
  const [displayed, setDisplayed] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const startTimer = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(startTimer);
  }, [delay]);

  useEffect(() => {
    if (!started) return;
    let i = 0;
    setDisplayed("");
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i++;
      } else {
        clearInterval(interval);
      }
    }, 18);
    return () => clearInterval(interval);
  }, [started, text]);

  return <>{started ? displayed : ""}</>;
};

const FlowCard = ({ steps, onAction }: FlowCardProps) => {
  return (
    <div className="space-y-0">
      {steps.map((step, i) => {
        const colorClass = CARD_COLORS[i % CARD_COLORS.length];
        return (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center shrink-0 w-6">
              <div className="w-3 h-3 rounded-full border-2 border-primary bg-background shrink-0 mt-4" />
              {i < steps.length - 1 && <div className="w-0.5 flex-1 bg-border min-h-[24px]" />}
            </div>

            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.12 }}
              onClick={() => onAction(step.title, step.title)}
              className={`flex-1 rounded-xl p-3.5 mb-2 cursor-pointer relative overflow-hidden ${colorClass} active:scale-[0.98] transition-transform`}
            >
              <div className="flow-points-wrapper">
                {Array.from({ length: 8 }).map((_, j) => (
                  <span key={j} className="flow-point" />
                ))}
              </div>
              <div className="relative z-10">
                <p className="text-sm font-medium text-foreground mb-1">
                  <TypewriterText text={step.title} delay={i * 200} />
                </p>
                <p className="text-xs text-foreground/70">
                  <TypewriterText text={step.description} delay={i * 200 + 150} />
                </p>
              </div>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
};

export default FlowCard;
