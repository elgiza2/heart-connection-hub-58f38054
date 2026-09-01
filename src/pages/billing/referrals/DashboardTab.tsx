/** @doc Referrals overview — one screen: hero, points balance, quick stats. */
import { useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import PlanCard from "./PlanCard";
import { POINTS_PER_SIGNUP, useReferrals } from "../ReferralsPage";
import { FALLBACK_REWARDS } from "./rewardsCatalog";

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] px-4 py-3">
    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/50">
      {label}
    </p>
    <p className="mt-1 text-[20px] font-semibold tracking-tight text-foreground">{value}</p>
  </div>
);

export default function DashboardTab() {
  const navigate = useNavigate();
  const { signups, points, rewards } = useReferrals();

  const list = rewards.length ? rewards : FALLBACK_REWARDS;
  const cheapest = Math.min(...list.map((r) => Number(r.points_cost) || Infinity));
  const goal = Number.isFinite(cheapest) ? cheapest : 800;
  const pct = Math.max(0, Math.min(100, Math.round((points / goal) * 100)));
  const remaining = Math.max(0, goal - points);

  return (
    <div className="flex h-full flex-col justify-center gap-4" data-stagger>
      {/* Hero */}
      <section>
        <div className="relative flex h-[168px] items-center justify-center overflow-hidden rounded-[28px] border border-foreground/[0.08] bg-gradient-to-b from-foreground/[0.06] to-foreground/[0.01] sm:h-[200px]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 90% at 50% 115%, hsl(var(--primary)/0.22), transparent 62%)",
            }}
          />
          <PlanCard
            plan="starter"
            className="-mr-5 h-[98px] w-[142px] shrink-0 sm:h-[114px] sm:w-[166px]"
            style={{ transform: "rotate(-12deg) translateY(4px)" }}
          />
          <PlanCard
            plan="pro"
            className="z-10 h-[114px] w-[166px] shrink-0 sm:h-[132px] sm:w-[192px]"
          />
          <PlanCard
            plan="elite"
            className="-ml-5 h-[98px] w-[142px] shrink-0 sm:h-[114px] sm:w-[166px]"
            style={{ transform: "rotate(12deg) translateY(4px)" }}
          />
        </div>

        <h1 className="mt-4 text-[26px] font-semibold leading-[1.12] tracking-tight text-foreground sm:text-[30px]">
          Invite friends, earn points.
        </h1>
        <p className="mt-1.5 max-w-[360px] text-[13px] leading-relaxed text-foreground/60">
          Each friend who joins gives you {POINTS_PER_SIGNUP} points — trade them for a free
          subscription.
        </p>
      </section>


      {/* Points balance */}
      <section className="rounded-[24px] border border-foreground/[0.08] bg-foreground/[0.02] p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/50">
              Points balance
            </p>
            <div className="mt-1 flex items-end gap-2">
              <span className="text-[38px] font-semibold leading-none tracking-tight text-foreground">
                {points}
              </span>
              <span className="pb-1 text-[13px] text-foreground/50">/ {goal}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/settings/referrals/rewards")}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-foreground/12 bg-foreground/[0.04] px-4 text-[13.5px] font-medium text-foreground transition hover:bg-foreground/[0.08] active:scale-[0.98]"
          >
            Redeem
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.08]">
          <div
            className="h-full rounded-full bg-foreground transition-[width] duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2.5 text-[12.5px] text-foreground/55">
          {remaining === 0
            ? "You can redeem a free plan now."
            : `${remaining} points to go — about ${Math.ceil(remaining / POINTS_PER_SIGNUP)} more friends.`}
        </p>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Friends joined" value={String(signups)} />
        <Stat label="Points earned" value={String(points)} />
      </div>
      {signups > 0 && points === 0 ? (
        <p className="text-[12.5px] leading-relaxed text-foreground/55">
          Points are credited once an invited friend confirms their account, so a brand-new signup
          can show here before its points land.
        </p>
      ) : null}
    </div>
  );
}
