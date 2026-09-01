/** @doc Megsy Mail — iOS-style mail client: floating pill headers, soft cards, grouped list, reader & composer sheets. */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Bot,
  Check,
  Copy,
  CornerUpLeft,
  Forward,
  Inbox,
  Loader2,
  
  Paperclip,
  PanelLeft,
  PenLine,
  Plus,
  RefreshCw,
  Search as SearchIcon,
  Send,
  Trash2,
  Type as TypeIcon,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { isPinned, setPinned } from "@/lib/sidebarPins";
import DesktopSettingsLayout from "@/components/settings/DesktopSettingsLayout";
import ProfileGlassShell from "@/components/profile/ProfileGlassShell";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { translateExactText, useUserLang } from "@/lib/authI18n";
import {
  deleteForever,
  ensureMailbox,
  listMail,
  pollInbox,
  markRead,
  moveTo,
  sendMail,
  type MailFolder,
  type MailMessage,
  type Mailbox,
} from "@/lib/mail/mailClient";

const FOLDERS: { key: MailFolder; label: string }[] = [
  { key: "inbox", label: "Inbox" },
  { key: "sent", label: "Sent" },
  { key: "spam", label: "Spam" },
  { key: "trash", label: "Trash" },
];

interface Draft {
  to: string;
  subject: string;
  text: string;
}

function displayName(name: string | null | undefined, addr: string) {
  const n = (name || "").trim();
  if (n) return n;
  return (addr || "?").replace(/[<>]/g, "").split("@")[0];
}

function initials(name: string) {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "?";
  const b = parts.length > 1 ? parts[1][0] : "";
  return (a + b).toUpperCase();
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], sameYear ? { day: "numeric", month: "short" } : { year: "numeric", month: "short" });
}

/** Groups messages into Today / Yesterday / This week / Earlier buckets. */
function bucketOf(iso: string): "Today" | "Yesterday" | "This week" | "Earlier" {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const y = new Date(now.getTime() - 864e5);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  if (now.getTime() - d.getTime() < 7 * 864e5) return "This week";
  return "Earlier";
}

/* ── iOS 26 liquid-glass shared primitives ─────────────────────── */

/** Liquid-glass surface used by every header bar, action bar and dock. */
const glassBarCls =
  "border border-foreground/40 bg-card/60 shadow-[0_18px_44px_-14px_hsl(var(--foreground)/0.25),inset_0_1px_0_hsl(0_0%_100%/0.5)] backdrop-blur-2xl backdrop-saturate-150 dark:border-foreground/10";

/** Grouped content card — the single content surface used across all mail screens. */
const glassCardCls =
  "overflow-hidden rounded-[24px] border border-foreground/40 bg-card/70 shadow-[0_10px_30px_-18px_hsl(var(--foreground)/0.35),inset_0_1px_0_hsl(0_0%_100%/0.45)] backdrop-blur-xl dark:border-foreground/10";

/** Hairline separator inside grouped cards. */
const hairline = "h-px bg-foreground/[0.07]";

/** Circular control that lives inside a glass bar. */
function RoundBtn({
  label,
  onClick,
  children,
  tone = "plain",
  disabled,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
  tone?: "plain" | "accent";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      // Settings pages force a 16px radius on buttons; keep these perfectly round.
      style={{ borderRadius: 9999 }}
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition-all active:scale-90 disabled:opacity-40 ${
        tone === "accent"
          ? "bg-primary text-primary-foreground shadow-[0_8px_20px_-6px_hsl(var(--primary)/0.6),inset_0_1px_0_hsl(0_0%_100%/0.35)]"
          : "bg-foreground/[0.06] text-foreground/70 hover:bg-foreground/[0.1] hover:text-foreground"
      }`}
    >
      <span className="contents">{children}</span>
    </button>
  );
}

/** Centered title inside a glass header bar. */
function HeaderTitle({ children }: { children: React.ReactNode }) {
  return (
    <span className="mx-auto flex min-w-0 max-w-full items-center justify-center gap-1.5 truncate px-1 text-[15px] font-semibold tracking-tight">
      {children}
    </span>
  );
}

/** iOS 26 liquid-glass navigation bar — one unified pill for every mail screen. */
function IosHeader({
  left,
  title,
  right,
}: {
  left: React.ReactNode;
  title: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0.25, duration: 0.5 }}
      className={`${glassBarCls} flex items-center gap-1.5 p-1.5`}
      style={{ borderRadius: 9999 }}
    >
      <div className="flex shrink-0 items-center gap-1.5">{left}</div>
      <div className="min-w-0 flex-1 text-center">{title}</div>
      <div className="flex shrink-0 items-center gap-1.5">{right}</div>
    </motion.div>
  );
}

/** Unified bottom glass action bar used by the reader and the composer. */
function IosActionBar({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0.25, duration: 0.5, delay: 0.05 }}
      className={`${glassBarCls} flex items-center gap-1.5 p-1.5`}
      style={{ borderRadius: 9999 }}
    >
      {children}
    </motion.div>
  );
}

/** Label + value row inside a grouped card (iOS inset list style). */
function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[48px] items-center gap-3 px-4">
      <span className="w-16 shrink-0 text-[13px] font-semibold text-foreground/45">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}


export default function MailPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const lang = useUserLang();
  const tx = useCallback((s: string) => translateExactText(s, lang), [lang]);

  const [box, setBox] = useState<Mailbox | null>(null);
  const [folder, setFolder] = useState<MailFolder>("inbox");
  const [items, setItems] = useState<MailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [open, setOpen] = useState<MailMessage | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pinned, setPinnedState] = useState(() => isPinned("mail"));

  useEffect(() => {
    let alive = true;
    ensureMailbox()
      .then((b) => alive && setBox(b))
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Paint the stored messages first, then fetch new mail in the background —
   * IMAP polling takes seconds and must never block the list from rendering.
   */
  const refresh = useCallback(async (f: MailFolder) => {
    setLoading(true);
    try {
      setItems(await listMail(f));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    if (f !== "inbox" && f !== "spam") return;
    setSyncing(true);
    try {
      await pollInbox();
      setItems(await listMail(f));
    } catch {
      /* background sync failures stay silent */
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (box) void refresh(folder);
  }, [box, folder, refresh]);

  const unread = useMemo(() => items.filter((m) => !m.is_read).length, [items]);

  const openMessage = async (m: MailMessage) => {
    setOpen(m);
    if (!m.is_read) {
      await markRead(m.id);
      setItems((prev) => prev.map((x) => (x.id === m.id ? { ...x, is_read: true } : x)));
    }
  };

  const act = async (m: MailMessage, target: MailFolder | "delete") => {
    if (target === "delete") await deleteForever(m.id);
    else await moveTo(m.id, target);
    setItems((prev) => prev.filter((x) => x.id !== m.id));
    setOpen(null);
    toast.success(tx(target === "delete" ? "Deleted" : "Moved"));
  };

  const reply = (m: MailMessage) => {
    setOpen(null);
    setDraft({
      to: m.from_address,
      subject: m.subject.toLowerCase().startsWith("re:") ? m.subject : `Re: ${m.subject}`,
      text: `\n\n---\n${m.from_address}:\n${m.body_text}`,
    });
  };

  const forward = (m: MailMessage) => {
    setOpen(null);
    setDraft({
      to: "",
      subject: m.subject.toLowerCase().startsWith("fwd:") ? m.subject : `Fwd: ${m.subject}`,
      text: `\n\n--- ${tx("Forwarded message")} ---\n${tx("From")}: ${m.from_address}\n\n${m.body_text}`,
    });
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((m) =>
      [m.subject, m.snippet, m.from_address, m.from_name, m.to_address]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [items, query]);

  const groups = useMemo(() => {
    const out: { label: string; rows: MailMessage[] }[] = [];
    for (const m of visible) {
      const b = bucketOf(m.created_at);
      const last = out[out.length - 1];
      if (last && last.label === b) last.rows.push(m);
      else out.push({ label: b, rows: [m] });
    }
    return out;
  }, [visible]);

  const copyAddress = () => {
    if (!box) return;
    void navigator.clipboard.writeText(box.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const folderLabel = FOLDERS.find((f) => f.key === folder)?.label ?? "Inbox";

  /* ── Header: folder title + quiet actions ── */
  const Header = (
    <motion.header
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="px-1"
    >
      <div className="flex items-center gap-3">
        <h2 className="min-w-0 flex-1 truncate text-[28px] font-semibold leading-tight tracking-tight">
          {tx(folderLabel)}
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          <RoundBtn
            label={tx(pinned ? "Remove from sidebar" : "Add to sidebar")}
            tone={pinned ? "accent" : "plain"}
            onClick={() => {
              setPinned("mail", !pinned);
              setPinnedState(!pinned);
              toast.success(tx(pinned ? "Removed from sidebar" : "Added to sidebar"));
            }}
          >
            {pinned ? <Check className="h-[18px] w-[18px]" /> : <PanelLeft className="h-[18px] w-[18px]" />}
          </RoundBtn>
          <RoundBtn label={tx("Refresh")} onClick={() => void refresh(folder)}>
            <RefreshCw className={`h-[18px] w-[18px] ${loading || syncing ? "animate-spin" : ""}`} />
          </RoundBtn>
          <RoundBtn label={tx("Search email")} onClick={() => setSearching((s) => !s)}>
            {searching ? <X className="h-[18px] w-[18px]" /> : <SearchIcon className="h-[18px] w-[18px]" />}
          </RoundBtn>
        </div>
      </div>
    </motion.header>
  );


  /* ── Address line (tap to copy) + optional search field ── */
  const Meta = (
    <div className="mt-3 space-y-2.5 px-1">
      <button
        type="button"
        onClick={copyAddress}
        aria-label={tx("Copy address")}
        className="group flex w-full min-w-0 items-center gap-2 rounded-2xl border border-foreground/[0.07] bg-foreground/[0.03] px-3.5 py-2.5 text-start transition-colors hover:bg-foreground/[0.05]"
        style={{ borderRadius: 16 }}
      >
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground/70" dir="ltr">
          {box?.address ?? "…"}
        </span>
        <span className="contents">
          {copied ? (
            <Check className="h-4 w-4 shrink-0 text-primary" />
          ) : (
            <Copy className="h-4 w-4 shrink-0 text-foreground/35" />
          )}
        </span>
      </button>


      {searching && (
        <div className="flex h-11 items-center gap-2.5 rounded-2xl border border-foreground/[0.07] bg-foreground/[0.03] px-3.5" style={{ borderRadius: 16 }}>
          <SearchIcon className="h-4 w-4 shrink-0 text-foreground/35" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tx("Search email")}
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-foreground/35"
          />
          {query && (
            <button type="button" aria-label={tx("Clear")} onClick={() => setQuery("")} className="shrink-0">
              <span className="contents">
                <X className="h-4 w-4 text-foreground/35" />
              </span>
            </button>
          )}
        </div>
      )}
    </div>

  );

  /* ── List: date-grouped rows on white cards ── */
  const List = (
    <div className="mt-4">
      {loading && (
        <div className={glassCardCls}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-foreground/[0.07]" />
              <span className="min-w-0 flex-1 space-y-2">
                <span className="block h-3 w-1/3 animate-pulse rounded-full bg-foreground/[0.07]" />
                <span className="block h-3 w-3/4 animate-pulse rounded-full bg-foreground/[0.05]" />
              </span>
            </div>
          ))}
        </div>
      )}

      {!loading && visible.length === 0 && (
        <div className="grid place-items-center gap-2 py-20 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-card text-foreground/35 shadow-[0_1px_3px_hsl(var(--foreground)/0.07)]">
            <span className="contents">
              <Inbox className="h-5 w-5" />
            </span>
          </span>
          <p className="text-[13.5px] text-foreground/45">{tx("No messages here")}</p>
        </div>
      )}

      {!loading &&
        groups.map((g) => (
          <section key={g.label} className="mb-4">
            <p className="mb-1.5 px-2 text-[13px] font-semibold text-foreground/45">{tx(g.label)}</p>
            <div className={glassCardCls}>
              {g.rows.map((m, i) => {
                const addr = folder === "sent" ? m.to_address : m.from_address;
                const who = displayName(folder === "sent" ? null : m.from_name, addr);
                return (
                  <button
                    key={m.id}
                    onClick={() => void openMessage(m)}
                    className={`flex w-full items-center gap-3 px-4 py-3.5 text-start transition-all hover:bg-foreground/[0.03] ${
                      m.is_read ? "opacity-55" : ""
                    }`}
                  >
                    <span
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-[12px] font-bold ${
                        m.is_read
                          ? "bg-foreground/[0.05] text-foreground/50"
                          : "bg-primary/10 text-primary"
                      }`}
                    >
                      {initials(who)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span
                          className={`min-w-0 flex-1 truncate text-[15px] ${
                            m.is_read ? "font-medium text-foreground/70" : "font-bold text-foreground"
                          }`}
                        >
                          {who}
                        </span>
                        {m.origin === "ai" && <Bot className="h-3.5 w-3.5 shrink-0 text-foreground/35" />}
                        <span
                          className={`shrink-0 text-[12px] tabular-nums ${
                            m.is_read ? "text-foreground/35" : "font-semibold text-primary"
                          }`}
                        >
                          {fmtDate(m.created_at)}
                        </span>
                      </span>
                      <span
                        className={`mt-0.5 block truncate text-[13.5px] ${
                          m.is_read ? "text-foreground/40" : "font-medium text-foreground/65"
                        }`}
                      >
                        {m.snippet || m.subject || tx("(no subject)")}
                      </span>
                    </span>
                    {i < 0 && null}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
    </div>
  );

  const Body = (
    <section className="pb-32">
      {Header}
      {Meta}
      {List}

      {/* iOS 26-style liquid glass tab dock + compose FAB — portalled so page
          transforms in the settings shell can't break `position: fixed`. */}
      {createPortal(
        <div
          className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
          style={{ bottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="pointer-events-auto flex items-center gap-2">
            <div
              className="relative flex items-center gap-1 border border-foreground/40 bg-card/55 p-1.5 shadow-[0_18px_44px_-12px_hsl(var(--foreground)/0.28),inset_0_1px_0_hsl(0_0%_100%/0.5)] backdrop-blur-2xl backdrop-saturate-150 dark:border-foreground/10"
              style={{ borderRadius: 9999 }}
            >
              {FOLDERS.map((f) => {
                const active = folder === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => setFolder(f.key)}
                    style={{ borderRadius: 9999 }}
                    className={`relative px-3.5 py-2 text-[12.5px] font-semibold transition-colors duration-200 ${
                      active ? "text-primary-foreground" : "text-foreground/55 hover:text-foreground/85"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="mail-dock-pill"
                        transition={{ type: "spring", bounce: 0.32, duration: 0.55 }}
                        className="absolute inset-0 rounded-full bg-primary shadow-[0_6px_18px_-4px_hsl(var(--primary)/0.55),inset_0_1px_0_hsl(0_0%_100%/0.35)]"
                      />
                    )}
                    <span className="relative z-10">{tx(f.label)}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              aria-label={tx("Compose")}
              onClick={() => setDraft({ to: "", subject: "", text: "" })}
              style={{ borderRadius: 9999 }}
              className="grid h-12 w-12 place-items-center border border-foreground/30 bg-primary/90 text-primary-foreground shadow-[0_14px_30px_-8px_hsl(var(--primary)/0.6),inset_0_1px_0_hsl(0_0%_100%/0.35)] backdrop-blur-xl transition-transform active:scale-90"
            >
              <span className="contents">
                <Plus className="h-5 w-5" />
              </span>
            </button>
          </div>
        </div>,
        document.body,
      )}

      {open && (
        <MessageView
          msg={open}
          tx={tx}
          onClose={() => setOpen(null)}
          onAct={act}
          onReply={reply}
          onForward={forward}
          folder={folder}
        />
      )}
      {draft && (
        <Composer
          tx={tx}
          from={box?.address ?? ""}
          draft={draft}
          onClose={() => setDraft(null)}
          onSent={() => {
            setDraft(null);
            void refresh(folder);
          }}
        />
      )}
    </section>
  );

  if (isMobile) {
    return (
      <ProfileGlassShell
        title={tx("Mail")}
        onBack={() => navigate("/settings")}
      >
        {Body}
      </ProfileGlassShell>
    );
  }
  return (
    <DesktopSettingsLayout>
      <div className="mx-auto w-full max-w-2xl px-4 md:px-0">
        <header className="mb-4 flex items-center gap-3">
          <RoundBtn label={tx("Back")} onClick={() => navigate("/settings")}>
            <ArrowLeft className="h-[18px] w-[18px] rtl:rotate-180" />
          </RoundBtn>
          <h1 className="min-w-0 flex-1 text-[24px] font-semibold leading-tight tracking-tight">{tx("Mail")}</h1>
        </header>
        {Body}
      </div>
    </DesktopSettingsLayout>
  );
}

function Sheet({
  children,
  onClose,
  full = false,
}: {
  children: React.ReactNode;
  onClose: () => void;
  /** Reader mode: fills the screen on mobile, a tall centered panel on desktop. */
  full?: boolean;
}) {
  // Rendered in a portal: settings pages apply global CSS that collapses
  // icon-bearing controls, and the overlay must escape that scope.
  return createPortal(
    <div
      className={`fixed inset-0 z-50 grid bg-black/40 backdrop-blur-[3px] sm:place-items-center sm:p-6 ${
        full ? "place-items-stretch" : "place-items-end"
      }`}
      onClick={onClose}
    >
      <div
        className={
          full
            ? "flex h-full w-full flex-col overflow-hidden bg-background sm:h-[92vh] sm:max-w-3xl sm:rounded-[28px] sm:shadow-2xl"
            : "flex max-h-[95vh] w-full flex-col overflow-hidden rounded-t-[30px] bg-muted shadow-2xl sm:max-w-2xl sm:rounded-[30px]"
        }
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}


/** HTML bodies render inside a sandboxed iframe so remote markup can never touch the app. */
function HtmlBody({ html }: { html: string }) {
  const [height, setHeight] = useState(240);
  const frameId = useMemo(() => `mail-${Math.random().toString(36).slice(2)}`, []);

  // Remote scripts are stripped; the frame is origin-less and only reports its height.
  const safe = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/ on[a-z]+=("[^"]*"|'[^']*')/gi, "");
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>
    body{margin:0;padding:0;font:15px/1.75 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;color:#111;background:#fff;word-break:break-word}
    img{max-width:100%;height:auto}table{max-width:100%}
  </style></head><body>${safe}<script>
    (function(){var s=function(){parent.postMessage({t:"mail-h",id:${JSON.stringify(frameId)},h:document.documentElement.scrollHeight},"*")};
    s();window.addEventListener("load",s);[100,500,1200,2500].forEach(function(d){setTimeout(s,d)});
    if(window.ResizeObserver)new ResizeObserver(s).observe(document.body);})();
  <\/script></body></html>`;

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { t?: string; id?: string; h?: number } | null;
      if (!d || d.t !== "mail-h" || d.id !== frameId || !d.h) return;
      setHeight(Math.min(Math.max(d.h + 16, 120), 6000));
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [frameId]);

  return (
    <iframe
      title="message"
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
      style={{ height }}
      className="w-full rounded-xl bg-white"
    />
  );
}

function MessageView({
  msg,
  tx,
  onClose,
  onAct,
  onReply,
  onForward,
  folder,
}: {
  msg: MailMessage;
  tx: (s: string) => string;
  onClose: () => void;
  onAct: (m: MailMessage, target: MailFolder | "delete") => void;
  onReply: (m: MailMessage) => void;
  onForward: (m: MailMessage) => void;
  folder: MailFolder;
}) {

  const who = displayName(msg.from_name, msg.from_address);

  return (
    <Sheet full onClose={onClose}>
      {/* Top bar — back to the folder, single destructive action */}
      <div
        className="flex items-center gap-1 border-b border-foreground/[0.06] px-2 py-2"
        style={{ paddingTop: "max(8px, env(safe-area-inset-top, 0px))" }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{ borderRadius: 9999 }}
          className="inline-flex h-9 items-center gap-1 rounded-full px-2 text-[14px] font-medium text-primary transition-colors hover:bg-primary/[0.08] active:scale-95"
        >
          <span className="contents">
            <ArrowLeft className="h-[18px] w-[18px] rtl:rotate-180" />
          </span>
          {tx(FOLDERS.find((f) => f.key === folder)?.label ?? "Inbox")}
        </button>
        <span className="flex-1" />
        <button
          type="button"
          aria-label={tx(folder === "trash" ? "Delete forever" : "Move to trash")}
          onClick={() => onAct(msg, folder === "trash" ? "delete" : "trash")}
          style={{ borderRadius: 9999 }}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-foreground/55 transition-colors hover:bg-destructive/10 hover:text-destructive active:scale-90"
        >
          <span className="contents">
            <Trash2 className="h-[18px] w-[18px]" />
          </span>
        </button>
      </div>

      {/* Reading column */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <article className="mx-auto w-full max-w-[680px] px-5 pb-10 pt-7 sm:px-8">
          <h2 className="text-[26px] font-semibold leading-[1.22] tracking-[-0.02em] sm:text-[30px]">
            {msg.subject || tx("(no subject)")}
          </h2>

          <div className="mt-5 flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-[13px] font-bold text-primary">
              {initials(who)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold leading-tight">{who}</span>
              <span className="mt-0.5 block truncate text-[12.5px] text-foreground/45" dir="ltr">
                {msg.from_address}
              </span>
            </span>
            <span className="shrink-0 text-[12px] tabular-nums text-foreground/40">
              {fmtDate(msg.created_at)}
            </span>
          </div>

          <div className="my-6 h-px bg-foreground/[0.06]" />

          {msg.body_html ? (
            <HtmlBody html={msg.body_html} />
          ) : (
            <p className="whitespace-pre-wrap text-[16px] leading-[1.85] text-foreground/85">{msg.body_text}</p>
          )}

        </article>
      </div>

      {/* Footer actions */}
      <div
        className="border-t border-foreground/[0.06] px-4 py-3"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="mx-auto flex w-full max-w-[680px] items-center gap-2">
          <button
            type="button"
            onClick={() => onReply(msg)}
            style={{ borderRadius: 9999 }}
            className="inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-semibold text-primary-foreground transition-transform active:scale-[0.97]"
          >
            <span className="contents">
              <CornerUpLeft className="h-[17px] w-[17px] rtl:rotate-180" />
            </span>
            {tx("Reply")}
          </button>
          <RoundBtn label={tx("Forward")} onClick={() => onForward(msg)}>
            <Forward className="h-[17px] w-[17px] rtl:rotate-180" />
          </RoundBtn>
          <RoundBtn
            label={tx(folder === "spam" ? "Not spam" : "Mark as spam")}
            onClick={() => onAct(msg, folder === "spam" ? "inbox" : "spam")}
          >
            <Inbox className="h-[17px] w-[17px]" />
          </RoundBtn>
        </div>
      </div>
    </Sheet>
  );
}


function Composer({
  tx,
  from,
  draft,
  onClose,
  onSent,
}: {
  tx: (s: string) => string;
  from: string;
  draft: Draft;
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState(draft.to);
  const [subject, setSubject] = useState(draft.subject);
  const [text, setText] = useState(draft.text);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await sendMail({ to, subject, text });
      toast.success(
        res.status === "queued"
          ? tx("Queued — external delivery starts once the domain is connected")
          : tx("Message sent"),
      );
      onSent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose}>
      <div className="px-3 pt-3">
        <IosHeader
          left={
            <RoundBtn label={tx("Close")} onClick={onClose}>
              <ArrowLeft className="h-[18px] w-[18px] rtl:rotate-180" />
            </RoundBtn>
          }
          title={
            <HeaderTitle>
              <span className="truncate">{tx("Compose")}</span>
            </HeaderTitle>
          }
          right={
            <RoundBtn label={tx("Attach")}>
              <Paperclip className="h-[18px] w-[18px]" />
            </RoundBtn>
          }
        />
      </div>

      {/* One grouped card: From → To → Subject → body (iOS inset list) */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
        <div className={glassCardCls}>
          <FieldRow label={tx("From")}>
            <span className="block truncate text-[14px] text-foreground/45" dir="ltr">
              {from}
            </span>
          </FieldRow>
          <div className={hairline} />
          <FieldRow label={tx("To")}>
            <Input
              dir="ltr"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="name@example.com"
              className="h-11 w-full border-0 bg-transparent px-0 text-[14px] shadow-none focus-visible:ring-0"
            />
          </FieldRow>
          <div className={hairline} />
          <FieldRow label={tx("Subject")}>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-11 w-full border-0 bg-transparent px-0 text-[14px] shadow-none focus-visible:ring-0"
            />
          </FieldRow>
          <div className={hairline} />
          <Textarea
            rows={12}
            placeholder={tx("Write your message…")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[260px] w-full resize-none border-0 bg-transparent px-5 py-4 text-[15px] leading-[1.75] shadow-none focus-visible:ring-0"
          />
        </div>
      </div>

      {/* Unified glass action bar: format tools + send */}
      <div className="px-3 pb-4 pt-1">
        <IosActionBar>
          <RoundBtn label={tx("Attach")}>
            <Paperclip className="h-[17px] w-[17px]" />
          </RoundBtn>
          <RoundBtn label={tx("Format")}>
            <TypeIcon className="h-[17px] w-[17px]" />
          </RoundBtn>
          <RoundBtn label={tx("Signature")}>
            <PenLine className="h-[17px] w-[17px]" />
          </RoundBtn>
          <button
            type="button"
            disabled={busy || !to.trim()}
            onClick={() => void submit()}
            style={{ borderRadius: 9999 }}
            className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-semibold text-primary-foreground shadow-[0_8px_20px_-6px_hsl(var(--primary)/0.6),inset_0_1px_0_hsl(0_0%_100%/0.35)] transition-transform active:scale-[0.97] disabled:opacity-40"
          >
            <span className="contents">
              {busy ? <Loader2 className="h-[17px] w-[17px] animate-spin" /> : <Send className="h-[17px] w-[17px] rtl:rotate-180" />}
            </span>
            {tx("Send")}
          </button>
        </IosActionBar>
      </div>

    </Sheet>
  );
}
