import { m as motion } from "framer-motion";

interface Member {
  id: string;
  name?: string | null;
  avatar?: string | null;
}

interface MentionDropdownProps {
  members: Member[];
  query: string;
  onlineUsers: Set<string>;
  colorForUser: (userId?: string | null) => { bg: string; text?: string } | null | undefined;
  insertMention: (name: string) => void;
}

export const MentionDropdown = ({
  members,
  query,
  onlineUsers,
  colorForUser,
  insertMention,
}: MentionDropdownProps) => {
  const matches = members.filter((m) => (m.name || "").toLowerCase().includes(query.toLowerCase()));
  if (matches.length === 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      className="absolute bottom-full left-0 right-0 mb-2 mx-3 rounded-xl border border-border bg-popover overflow-hidden z-30"
    >
      {matches.slice(0, 5).map((m) => {
        const c = colorForUser(m.id);
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => insertMention(m.name || "Member")}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent text-left transition-colors"
          >
            {m.avatar ? (
              <img loading="lazy" decoding="async" src={m.avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
            ) : (
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-foreground"
                style={{ background: c?.bg || "hsl(var(--accent))" }}
              >
                {(m.name || "?")[0]?.toUpperCase()}
              </div>
            )}
            <span className="text-sm flex-1 truncate">{m.name || "Member"}</span>
            {onlineUsers.has(m.id) && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
          </button>
        );
      })}
    </motion.div>
  );
};

export default MentionDropdown;
