/**
 * @doc /restore — Restore purchases.
 * Re-checks the subscription that is recorded server-side for the signed-in
 * account and explains, in plain language, what restoring does and what to do
 * when a payment went through on a different account.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SEOHead from "@/components/common/SEOHead";
import { supabase } from "@/integrations/supabase/client";
import { getCachedUser } from "@/lib/cachedUser";
import { getOwnProfile } from "@/lib/ownProfile";

const SUPPORT_EMAIL = "support@megsyai.com";

type State =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "paid"; plan: string; email: string }
  | { kind: "free"; email: string };

export default function RestorePurchasePage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [checkedAt, setCheckedAt] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const user = await getCachedUser();
      if (!alive) return;
      if (!user) {
        setState({ kind: "signedOut" });
        return;
      }
      const { data: paid } = await supabase.rpc("has_paid_plan", { p_user_id: user.id });
      const profile = await getOwnProfile(user.id);
      if (!alive) return;
      const plan = (profile?.plan || "free").toString().toLowerCase();
      const email = user.email || "";
      setState(paid === true || (paid !== false && plan !== "free")
        ? { kind: "paid", plan, email }
        : { kind: "free", email });
    })();
    return () => {
      alive = false;
    };
  }, [checkedAt]);

  return (
    <>
      <SEOHead
        title="Restore Purchases"
        description="Restore a Megsy AI subscription on this device by re-checking the plan recorded for your account."
        path="/restore"
      />
      <main className="min-h-dvh bg-background text-foreground">
        <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:py-16">
          <Link to="/pricing" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            ← Back to pricing
          </Link>

          <header className="mt-6">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Restore Purchases</h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Your subscription is stored on your Megsy account, not on the device. Restoring simply
              re-reads it from our servers and re-applies it here.
            </p>
          </header>

          <section className="mt-10 rounded-2xl border border-border p-5">
            {state.kind === "loading" && (
              <p className="text-sm text-muted-foreground">Checking your account…</p>
            )}

            {state.kind === "signedOut" && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold tracking-tight">Sign in to restore</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Sign in with the same email you used when you paid, and the plan is restored
                  automatically.
                </p>
                <Link
                  to="/auth"
                  className="inline-flex h-10 items-center rounded-full bg-foreground px-5 text-sm font-semibold text-background"
                >
                  Sign in
                </Link>
              </div>
            )}

            {state.kind === "paid" && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold tracking-tight">Subscription restored</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  An active plan ({state.plan}) is linked to {state.email}. All paid features are
                  available on this device.
                </p>
                <Link
                  to="/settings/billing"
                  className="inline-flex h-10 items-center rounded-full border border-border px-5 text-sm font-semibold"
                >
                  Manage billing
                </Link>
              </div>
            )}

            {state.kind === "free" && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold tracking-tight">No active subscription found</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  We found no paid plan on {state.email}. If you paid with a different email, sign in
                  with that account. If the charge was made on this account, email {SUPPORT_EMAIL}
                  {" "}with the transaction date and we will link it.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setCheckedAt(Date.now())}
                    className="inline-flex h-10 items-center rounded-full border border-border px-5 text-sm font-semibold"
                  >
                    Check again
                  </button>
                  <Link
                    to="/pricing"
                    className="inline-flex h-10 items-center rounded-full bg-foreground px-5 text-sm font-semibold text-background"
                  >
                    See plans
                  </Link>
                </div>
              </div>
            )}
          </section>

          <div className="mt-10 space-y-9">
            <section>
              <h2 className="text-lg font-semibold tracking-tight">What restoring does</h2>
              <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
                <p>
                  It re-checks the plan recorded for your account on our servers and re-applies the
                  entitlements to the app on this device. It never creates a new charge.
                </p>
                <p>
                  Plan limits and credits are enforced server-side, so a restore reflects exactly what
                  your account is entitled to.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold tracking-tight">If it still does not appear</h2>
              <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
                <p>
                  Payments can take a short time to confirm. Wait a minute and press Check again.
                </p>
                <p>
                  Still missing? Email {SUPPORT_EMAIL} from your account address with the payment date
                  and amount. Cancellations and refunds are covered in our{" "}
                  <Link className="underline hover:text-foreground" to="/refund">
                    refund policy
                  </Link>
                  .
                </p>
              </div>
            </section>
          </div>

          <footer className="mt-14 border-t border-border pt-6 text-xs text-muted-foreground">
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <Link className="hover:text-foreground" to="/terms">Terms</Link>
              <Link className="hover:text-foreground" to="/privacy">Privacy</Link>
              <Link className="hover:text-foreground" to="/refund">Refunds</Link>
              <Link className="hover:text-foreground" to="/contact">Contact</Link>
              <Link className="hover:text-foreground" to="/pricing">Pricing</Link>
            </div>
          </footer>
        </div>
      </main>
    </>
  );
}
