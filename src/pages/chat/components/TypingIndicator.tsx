import { memo } from "react";
import { m as motion } from "framer-motion";

interface TypingUser {
  id: string;
  name?: string | null;
  avatar?: string | null;
}

interface ColorPair {
  bg: string;
  text?: string;
}

interface TypingIndicatorProps {
  typingUsers: TypingUser[];
  colorForUser: (userId?: string | null) => ColorPair | null | undefined;
}

const TypingIndicatorImpl = ({ typingUsers, colorForUser }: TypingIndicatorProps) => {
  if (typingUsers.length === 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground"
    >
      <div className="flex -space-x-1.5">
        {typingUsers.slice(0, 3).map((u) => {
          const c = colorForUser(u.id);
          return u.avatar ? (
            <img loading="lazy" decoding="async"
              key={u.id}
              src={u.avatar}
              alt=""
              className="w-5 h-5 rounded-full ring-2 ring-background object-cover"
            />
          ) : (
            <div
              key={u.id}
              className="w-5 h-5 rounded-full ring-2 ring-background flex items-center justify-center text-[9px] font-bold text-foreground"
              style={{ background: c?.bg || "hsl(var(--accent))" }}
            >
              {(u.name || "?")[0]?.toUpperCase()}
            </div>
          );
        })}
      </div>
      <div className="flex gap-1">
        {[0, 1, 2].map((idx) => (
          <motion.span
            key={idx}
            className="w-1.5 h-1.5 rounded-full bg-muted-foreground/70"
            animate={{ y: [0, -3, 0], opacity: [0.5, 1, 0.5] }}
            transition={{
              duration: 1.1,
              repeat: Infinity,
              ease: [0.45, 0, 0.55, 1],
              delay: idx * 0.14,
            }}
          />
        ))}
      </div>
      <span>
        {typingUsers.map((u) => u.name).join(", ")} {typingUsers.length === 1 ? "is" : "are"}{" "}
        typing…
      </span>
    </motion.div>
  );
};

// Only re-render when the typing users list identity or colorForUser fn changes.
export const TypingIndicator = memo(TypingIndicatorImpl, (prev, next) => {
  return (
    prev.typingUsers === next.typingUsers &&
    prev.colorForUser === next.colorForUser
  );
});

export default TypingIndicator;
