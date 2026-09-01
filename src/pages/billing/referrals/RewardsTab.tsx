/** @doc Redemption page — a clean, uncluttered list of subscription rewards. */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { goBackOr } from "@/lib/navigation";
import { useReferrals } from "../ReferralsPage";
import PlanCard from "./PlanCard";
import { FALLBACK_REWARDS, type CatalogRow, periodLabel, planKey } from "./rewardsCatalog";

export default function RewardsTab() {
  const navigate = useNavigate();
  const { points, rewards, redeemReward } = useReferrals();
  const [busy, setBusy] = useState<string | null>(null);

  const list = rewards.length > 0 ? (rewards as unknown as CatalogRow[]) : FALLBACK_REWARDS;
  const shown = useMemo(
    () =>
      [...list]
        .filter((r) => (r.category ?? "plan") === "plan" && r.billing_period !== "yearly")
        .sort((a, b) => a.points_cost - b.points_cost),
    [list],
  );

  const redeem = async (slug: string) => {
    setBusy(slug);
    try {
      await redeemReward(slug);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[560px] space-y-7 pb-10">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => goBackOr(navigate, "/settings/referrals")}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-accent active:scale-95"
        >
          <ArrowLeft className="h-[17px] w-[17px]" strokeWidth={2.2} />
        </button>
      </div>

      <header>
        <h1 className="text-[27px] font-semibold tracking-tight text-foreground">Redeem</h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-foreground/55">
          Spend your points on a free month of any plan.
        </p>
      </header>

      <ul className="space-y-3.5">
        {shown.map((r) => {
          const plan = planKey(r);
          const left = Math.max(0, r.stock_total - r.stock_claimed);
          const affordable = points >= r.points_cost && left > 0;
          return (
            <li
              key={r.slug}
              className="flex items-center gap-4 rounded-[26px] border border-foreground/[0.09] bg-foreground/[0.02] p-4"
            >
              <PlanCard plan={plan} className="h-[118px] w-[172px] shrink-0 sm:h-[130px] sm:w-[190px]" />
              <div className="min-w-0 flex-1">
                <p className="text-[15.5px] font-semibold capitalize leading-tight text-foreground">
                  {plan}
                </p>
                <p className="mt-0.5 text-[12.5px] text-foreground/55">
                  {periodLabel(r.billing_period)} · {r.points_cost.toLocaleString()} pts
                </p>
                <button
                  type="button"
                  onClick={() => redeem(r.slug)}
                  disabled={!affordable || busy === r.slug}
                  className="mt-2.5 inline-flex h-9 items-center justify-center rounded-full bg-foreground px-4 text-[13px] font-semibold text-background transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-foreground/[0.07] disabled:text-foreground/50"
                >
                  {left === 0
                    ? "Sold out"
                    : busy === r.slug
                      ? "Redeeming…"
                      : affordable
                        ? "Redeem"
                        : `${(r.points_cost - points).toLocaleString()} pts to go`}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
