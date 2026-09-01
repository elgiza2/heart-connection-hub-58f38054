import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl";

const groups: { title: string; items: { keys: string[]; label: string }[] }[] = [
  {
    title: "General",
    items: [
      { keys: [mod, "K"], label: "Open command palette" },
      { keys: ["?"], label: "Show keyboard shortcuts" },
      { keys: ["Esc"], label: "Close dialog / palette" },
    ],
  },
  {
    title: "Chat",
    items: [
      { keys: ["Enter"], label: "Send message" },
      { keys: ["Shift", "Enter"], label: "New line" },
      { keys: ["Swipe ←"], label: "Regenerate (mobile)" },
      { keys: ["Swipe →"], label: "Branch conversation (mobile)" },
    ],
  },
  {
    title: "Research",
    items: [
      { keys: [mod, "C"], label: "Copy report as Markdown" },
      { keys: [mod, "P"], label: "Print / Save as PDF" },
    ],
  },
];

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="inline-flex min-w-6 items-center justify-center rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] font-mono font-semibold text-foreground shadow-sm">
    {children}
  </kbd>
);

const ShortcutsHelp = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isTyping) return;
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onEvent = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("megsy:open-shortcuts", onEvent as EventListener);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("megsy:open-shortcuts", onEvent as EventListener);
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {g.title}
              </div>
              <ul className="space-y-2">
                {g.items.map((it, i) => (
                  <li key={i} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-foreground">{it.label}</span>
                    <span className="flex items-center gap-1">
                      {it.keys.map((k, j) => (
                        <Kbd key={j}>{k}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShortcutsHelp;
