/** @doc Referral program — clean, minimal layout: invite, points, rewards. */
import {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
  useRef,
  Suspense,
  lazy,
} from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { QrCode, X, Download, Share2, Check, Copy } from "lucide-react";

const QRCodeSVG = lazy(() => import("qrcode.react").then((m) => ({ default: m.QRCodeSVG })));

import { supabase } from "@/integrations/supabase/client";
import AppSidebar from "@/components/layout/AppSidebar";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";
import MobilePushShell from "@/components/layout/MobilePushShell";
import { safeCopyText } from "@/lib/safeClipboard";

/** Same sidebar toggle glyph used across the app's mobile headers. */
const SidebarToggleIcon = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    className="h-[22px] w-[22px]"
  >
    <rect x="3.25" y="4.5" width="17.5" height="15" rx="3.5" stroke="currentColor" strokeWidth="1.6" />
    <line x1="9.25" y1="4.5" x2="9.25" y2="19.5" stroke="currentColor" strokeWidth="1.6" />
    <line x1="5.5" y1="9" x2="7" y2="9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <line x1="5.5" y1="12" x2="7" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <line x1="5.5" y1="15" x2="7" y2="15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const on = () => setIsDesktop(mql.matches);
    mql.addEventListener("change", on);
    on();
    return () => mql.removeEventListener("change", on);
  }, []);
  return isDesktop;
}

export const WHATSAPP_PHONE = "201098821812";
export const PROMOTER_MESSAGE =
  "Hello, I want to join the Megsy AI promotion / referral system. Please send me the details.";
export const CREDITS_PER_SIGNUP = 15;
export const POINTS_PER_SIGNUP = 10;
export const MIN_PAYOUT = 10;

/* Neutral, quiet palette — no gradients, no neon. */
export const PAGE_BG = "hsl(var(--background))";
export const SURFACE = "hsl(var(--foreground) / 0.035)";
export const SURFACE_2 = "hsl(var(--foreground) / 0.06)";
export const BORDER = "hsl(var(--foreground) / 0.10)";
export const TEXT = "hsl(var(--foreground))";
export const MUTED = "hsl(var(--foreground) / 0.6)";
export const INK = "hsl(var(--background))";
export const YELLOW = "hsl(var(--foreground))";
export const PINK = "hsl(var(--foreground) / 0.6)";
export const MINT = "hsl(var(--foreground) / 0.6)";
export const LAVENDER = "hsl(var(--foreground) / 0.6)";
export const PEACH = "hsl(var(--foreground) / 0.6)";
export const BLUE = "hsl(var(--foreground) / 0.6)";
export const GOLD = "#C9A24C";
export const GOLD_SOFT = "#F6E7B7";

export interface Referral {
  id: string;
  status: string;
  created_at: string;
}
export interface Earning {
  id: string;
  amount: number;
  source_action: string;
  created_at: string;
}
export interface Withdrawal {
  id: string;
  amount: number;
  status: string;
  method: string;
  created_at: string;
}
export interface RewardTask {
  id: string;
  task_key: string;
  title: string;
  description: string | null;
  reward_credits: number;
  action_type: string;
  action_url: string | null;
  target_count: number;
  icon: string | null;
}
export interface UserTask {
  task_id: string;
  progress: number;
  completed_at: string | null;
  awarded_credits: number;
}
export interface CatalogReward {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  plan: string;
  billing_period: "monthly" | "yearly";
  points_cost: number;
  stock_total: number;
  stock_claimed: number;
}

export const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export const statusTone = (s: string) => {
  if (s === "approved" || s === "paid" || s === "active")
    return "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20";
  if (s === "rejected") return "bg-rose-500/10 text-rose-400 ring-rose-500/20";
  return "bg-amber-500/10 text-amber-400 ring-amber-500/20";
};

export const statusLabel = (s: string) =>
  (
    ({
      approved: "Approved",
      pending: "Pending",
      rejected: "Rejected",
      paid: "Paid",
      active: "Active",
    }) as Record<string, string>
  )[s] ?? s;

export const EmptyState = ({ title, hint }: { title: string; hint: string }) => (
  <div className="flex flex-col items-center justify-center py-14 text-center">
    <p className="text-[15px] font-medium text-foreground">{title}</p>
    <p className="mt-1 max-w-[280px] text-[13px] leading-relaxed text-foreground/55">{hint}</p>
  </div>
);

/* ── Shared primitives ─────────────────────────────────────────── */

export const Card = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={`rounded-2xl border border-foreground/10 bg-foreground/[0.03] ${className}`}
  >
    {children}
  </div>
);

export const PrimaryButton = ({
  children,
  onClick,
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-[14px] font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
  >
    {children}
  </button>
);

export const GhostButton = ({
  children,
  onClick,
  disabled,
  className = "",
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={ariaLabel}
    className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-foreground/15 bg-foreground/[0.04] px-5 text-[14px] font-medium text-foreground transition hover:bg-foreground/[0.08] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
  >
    {children}
  </button>
);

/* ── Context ───────────────────────────────────────────────────── */

export interface ReferralsContextValue {
  userId: string | null;
  code: string;
  link: string;
  refs: Referral[];
  earns: Earning[];
  wds: Withdrawal[];
  tasks: RewardTask[];
  userTasks: UserTask[];
  points: number;
  rewards: CatalogReward[];
  totalEarned: number;
  committed: number;
  available: number;
  signups: number;
  canWithdraw: boolean;
  justCopied: boolean;
  claimTask: (t: RewardTask) => void;
  redeemReward: (slug: string) => Promise<void>;
  copyLink: () => Promise<void>;
  shareLink: () => Promise<void>;
  openPromoter: () => void;
  openQr: () => void;
  reload: () => void;
}

const REFERRALS_FALLBACK: ReferralsContextValue = {
  userId: null,
  code: "",
  link: "",
  refs: [],
  earns: [],
  wds: [],
  tasks: [],
  userTasks: [],
  points: 0,
  rewards: [],
  totalEarned: 0,
  committed: 0,
  available: 0,
  signups: 0,
  canWithdraw: false,
  justCopied: false,
  claimTask: () => {},
  redeemReward: async () => {},
  copyLink: async () => {},
  shareLink: async () => {},
  openPromoter: () => {},
  openQr: () => {},
  reload: () => {},
};

const ReferralsCtx = createContext<ReferralsContextValue | null>(null);
export const useReferrals = () => useContext(ReferralsCtx) ?? REFERRALS_FALLBACK;

const ReferralsPage = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const onRewards = pathname.endsWith("/rewards");
  const qrRef = useRef<SVGSVGElement | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [refs, setRefs] = useState<Referral[]>([]);
  const [earns, setEarns] = useState<Earning[]>([]);
  const [wds, setWds] = useState<Withdrawal[]>([]);
  const [tasks, setTasks] = useState<RewardTask[]>([]);
  const [userTasks, setUserTasks] = useState<UserTask[]>([]);
  const [points, setPoints] = useState(0);
  const [rewards, setRewards] = useState<CatalogReward[]>([]);
  const [justCopied, setJustCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isDesktop = useIsDesktop();
  const [sidebarCollapsed] = useSidebarCollapsed();
  const sidebarWidth = sidebarCollapsed ? 60 : 320;

  const loadData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const { data: codes } = await supabase
      .from("referral_codes")
      .select("code")
      .eq("user_id", user.id)
      .limit(1);
    let row = codes?.[0] as { code: string } | undefined;
    if (!row) {
      const newCode = `MEGSY-${user.id.substring(0, 6).toUpperCase()}`;
      await supabase
        .from("referral_codes")
        .insert({ user_id: user.id, code: newCode, referral_mode: "cash" });
      row = { code: newCode };
    }
    setCode(row.code);

    const [r, e, w, tk, ut] = await Promise.all([
      supabase
        .from("referrals")
        .select("*")
        .eq("referrer_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("referral_earnings")
        .select("*")
        .eq("referrer_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("withdrawal_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase.from("reward_tasks").select("*").eq("active", true).order("sort_order"),
      supabase
        .from("user_reward_tasks")
        .select("task_id, progress, completed_at, awarded_credits")
        .eq("user_id", user.id),
    ]);
    setRefs(r.data ?? []);
    setEarns(e.data ?? []);
    setWds(w.data ?? []);
    setTasks((tk.data as RewardTask[]) ?? []);
    setUserTasks((ut.data as UserTask[]) ?? []);

    // Points + reward catalogue live in newer tables; degrade quietly when absent.
    const anyDb = supabase as any;
    try {
      const { data: pts } = await anyDb
        .from("referral_points")
        .select("points")
        .eq("user_id", user.id);
      if (Array.isArray(pts))
        setPoints(pts.reduce((s: number, x: any) => s + Number(x.points || 0), 0));
    } catch {
      /* table not provisioned yet */
    }
    try {
      const { data: cat } = await anyDb
        .from("reward_catalog")
        .select("*")
        .eq("active", true)
        .order("sort_order");
      if (Array.isArray(cat)) setRewards(cat as CatalogReward[]);
    } catch {
      /* table not provisioned yet */
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const claimTask = async (task: RewardTask) => {
    if (!userId) return;
    const existing = userTasks.find((u) => u.task_id === task.id);
    if (existing?.completed_at) return;

    if (task.action_type === "invite_friends") {
      const progress = refs.length;
      if (progress < task.target_count) {
        toast.error(`Invite ${task.target_count - progress} more friends first`);
        return;
      }
    } else if (task.action_url) {
      window.open(task.action_url, "_blank", "noopener,noreferrer");
    }

    // Credit grants must be verified and awarded atomically by a privileged
    // backend flow; never trust a browser-written completion row or amount.
    toast.info("This reward is awaiting secure verification");
  };

  const redeemReward = async (slug: string) => {
    const { data, error } = await (supabase as any).rpc("redeem_reward", { p_reward_slug: slug });
    if (error) return void toast.error(error.message);
    const res = data as { ok?: boolean; error?: string } | null;
    if (!res?.ok) {
      const msg =
        res?.error === "insufficient_points"
          ? "You don't have enough points yet"
          : res?.error === "out_of_stock"
            ? "This reward is fully claimed"
            : "Couldn't redeem this reward";
      return void toast.error(msg);
    }
    toast.success("Redeemed — our team will activate your plan shortly");
    loadData();
  };

  const link = code ? `${window.location.origin}/ref/${code}` : "";
  const totalEarned = earns.reduce((s, x) => s + Number(x.amount), 0);
  const committed = wds
    .filter((w) => w.status !== "rejected")
    .reduce((s, x) => s + Number(x.amount), 0);
  const available = totalEarned - committed;
  const signups = refs.length;
  const canWithdraw = available >= MIN_PAYOUT;

  const copyLink = async () => {
    if (!link) return;
    await safeCopyText(link);
    setJustCopied(true);
    setTimeout(() => setJustCopied(false), 1600);
    toast.success("Link copied");
  };

  const shareLink = async () => {
    if (!link) return;
    const shareText = `Try Megsy AI and get ${CREDITS_PER_SIGNUP} free credits with my invite link:\n${link}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Megsy AI", text: shareText, url: link });
        return;
      } catch {
        /* fallthrough */
      }
    }
    await safeCopyText(shareText);
    toast.success("Invite message copied");
  };

  const openPromoter = () => {
    const url = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(PROMOTER_MESSAGE)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const downloadQR = () => {
    if (!qrRef.current) return;
    const source = new XMLSerializer().serializeToString(qrRef.current);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `megsy-referral-qr-${code}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const ctx: ReferralsContextValue = {
    userId,
    code,
    link,
    refs,
    earns,
    wds,
    tasks,
    userTasks,
    points,
    rewards,
    totalEarned,
    committed,
    available,
    signups,
    canWithdraw,
    justCopied,
    claimTask,
    redeemReward,
    copyLink,
    shareLink,
    openPromoter,
    openQr: () => setQrOpen(true),
    reload: loadData,
  };

  const content = (
    <div className={`mx-auto flex min-h-full w-full max-w-[640px] flex-col px-5 min-h-[100dvh] ${onRewards ? "pb-10" : "pb-[120px]"} pt-4 md:pt-6`}>
      {onRewards || isDesktop ? null : (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
          className="mb-2 flex h-11 w-11 items-center justify-center rounded-full border-0 bg-transparent text-foreground transition active:scale-95"
        >
          <SidebarToggleIcon />
        </button>
      )}
      <div className="flex flex-1 flex-col justify-center">
        <Outlet />
      </div>
    </div>
  );


  /** Sticky action bar — copy the invite link, open the redemption page. */
  const actionBar = (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
    >
      <div className="pointer-events-auto mx-auto w-full max-w-[640px] px-5">
        <div className="flex gap-2 rounded-[24px] border border-foreground/10 bg-background/85 p-2 shadow-[0_18px_40px_-22px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          <button
            type="button"
            onClick={copyLink}
            disabled={!link}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-[18px] bg-foreground px-5 text-[14px] font-semibold text-background transition active:scale-[0.99] disabled:opacity-40"
          >
            {justCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {justCopied ? "Copied" : "Copy invite link"}
          </button>
          <GhostButton
            onClick={shareLink}
            disabled={!link}
            className="h-12 w-12 rounded-[18px] !px-0"
            aria-label="Share invite link"
          >
            <Share2 className="h-4 w-4" />
          </GhostButton>
          <GhostButton
            onClick={() => setQrOpen(true)}
            disabled={!link}
            className="h-12 w-12 rounded-[18px] !px-0"
            aria-label="Show QR code"
          >
            <QrCode className="h-4 w-4" />
          </GhostButton>
        </div>
      </div>
    </div>
  );





  return (
    <ReferralsCtx.Provider value={ctx}>
      {isDesktop ? (
        <div className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
          <aside
            style={{ width: sidebarWidth, minWidth: sidebarWidth, flexBasis: sidebarWidth }}
            className="relative z-40 hidden shrink-0 overflow-hidden transition-[width,min-width,flex-basis] duration-300 md:flex"
          >
            <AppSidebar
              open
              inline
              onClose={() => {}}
              onNewChat={() => navigate("/")}
            />
          </aside>
          <main className="relative min-w-0 flex-1 overflow-y-auto">
            {content}
            {onRewards ? null : actionBar}
          </main>
        </div>
      ) : (
        <MobilePushShell
          open={sidebarOpen}
          onOpenChange={setSidebarOpen}
          onNewChat={() => navigate("/")}
          currentMode="chat"
        >
          <div className="min-h-[100dvh] bg-background text-foreground">
            {content}
            {onRewards ? null : actionBar}
          </div>
        </MobilePushShell>
      )}

      {qrOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center px-5"
          style={{ background: "hsl(0 0% 0% / 0.7)", backdropFilter: "blur(6px)" }}
          onClick={() => setQrOpen(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl border border-foreground/10 bg-background p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setQrOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-foreground/10 text-foreground/70"
            >
              <X className="h-4 w-4" />
            </button>
            <h2 className="text-center text-[18px] font-semibold">Your QR code</h2>
            <div className="mx-auto mt-5 grid w-max place-items-center rounded-2xl bg-white p-5">
              {link ? (
                <Suspense
                  fallback={<div className="h-[200px] w-[200px] animate-pulse rounded-xl bg-black/10" />}
                >
                  <QRCodeSVG
                    ref={qrRef}
                    value={link}
                    size={200}
                    bgColor="#FFFFFF"
                    fgColor="#0a0a0a"
                    level="M"
                  />
                </Suspense>
              ) : (
                <div className="h-[200px] w-[200px] animate-pulse rounded-xl bg-black/10" />
              )}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <GhostButton onClick={copyLink}>
                <Copy className="h-4 w-4" />
                Copy
              </GhostButton>
              <GhostButton onClick={downloadQR}>
                <Download className="h-4 w-4" />
                Download
              </GhostButton>
            </div>
          </div>
        </div>
      )}
    </ReferralsCtx.Provider>
  );
};

export default ReferralsPage;
