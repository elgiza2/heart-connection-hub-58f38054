import { createContext, useContext, useState, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { m as motion, AnimatePresence } from "framer-motion";

interface StepContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
}
const StepContext = createContext<StepContextValue | null>(null);

export function ChainOfThought({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <div className="absolute inset-y-1 start-[7px] w-px bg-border/60" aria-hidden />
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

export function ChainOfThoughtStep({
  children,
  defaultOpen = false,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <StepContext.Provider value={{ open, setOpen }}>
      <div className="relative ps-6">
        <span className="absolute start-[3px] top-[11px] w-2 h-2 rounded-full bg-foreground/40 ring-4 ring-background" />
        {children}
      </div>
    </StepContext.Provider>
  );
}

export function ChainOfThoughtTrigger({ children }: { children: ReactNode }) {
  const ctx = useContext(StepContext);
  if (!ctx) return null;
  return (
    <button
      type="button"
      onClick={() => ctx.setOpen(!ctx.open)}
      className="w-full flex items-center gap-2 py-1.5 text-[13px] font-medium text-foreground/90 hover:text-foreground transition text-start"
    >
      <span className="flex-1 truncate">{children}</span>
      <ChevronDown
        className={`w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0 ${ctx.open ? "" : "-rotate-90"}`}
      />
    </button>
  );
}

export function ChainOfThoughtContent({ children }: { children: ReactNode }) {
  const ctx = useContext(StepContext);
  if (!ctx) return null;
  return (
    <AnimatePresence initial={false}>
      {ctx.open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="overflow-hidden"
        >
          <div className="flex flex-col gap-1 pb-2 pt-0.5 text-[12.5px] text-muted-foreground leading-relaxed">
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ChainOfThoughtItem({ children }: { children: ReactNode }) {
  return <div className="relative">{children}</div>;
}
