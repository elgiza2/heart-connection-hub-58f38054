import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface TypingAnimationProps {
  children: string;
  duration?: number;
  delay?: number;
  showCursor?: boolean;
  className?: string;
}

export function TypingAnimation({
  children,
  duration = 60,
  delay = 0,
  showCursor = true,
  className,
}: TypingAnimationProps) {
  const [displayed, setDisplayed] = useState("");
  const [started, setStarted] = useState(false);

  // Reset when source text changes
  useEffect(() => {
    setDisplayed("");
    setStarted(false);
    const t = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(t);
  }, [children, delay]);

  useEffect(() => {
    if (!started) return;
    let i = 0;
    const id = setInterval(() => {
      if (i < children.length) {
        setDisplayed(children.slice(0, i + 1));
        i++;
      } else {
        clearInterval(id);
      }
    }, duration);
    return () => clearInterval(id);
  }, [started, children, duration]);

  return (
    <span className={cn("inline-block whitespace-pre", className)}>
      {displayed}
      {showCursor && (
        <span className="inline-block w-[1px] h-[1em] align-[-2px] ml-[1px] bg-current animate-pulse" />
      )}
    </span>
  );
}

export default TypingAnimation;
