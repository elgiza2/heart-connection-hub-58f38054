/** @doc Post-checkout status page — matches the glass "+" menu style. */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { m as motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import SecondMonthOfferCard from "@/components/billing/SecondMonthOfferCard";
import { clearAbandonedCheckout } from "@/lib/pricingOffers";

const mobileFont =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif";

const glass = {
  background: "rgba(0, 0, 0, 0.32)",
  backdropFilter: "blur(22px) saturate(160%)",
  WebkitBackdropFilter: "blur(22px) saturate(160%)",
  boxShadow:
    "inset 0 1px 1px rgba(255,255,255,0.16), 0 0 0 1px var(--overlay-white-18), 0 22px 60px -18px rgba(0,0,0,0.7)",
};

const BillingSuccessPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "pending" | "failed">("loading");
  const [details, setDetails] = useState<any>(null);
  const [creating, setCreating] = useState(false);

  // A paid checkout cancels the come-back ($5) offer.
  useEffect(() => {
    if (status === "success") clearAbandonedCheckout();
  }, [status]);

  useEffect(() => {
    const provider = params.get("provider");
    const kashierOrder = params.get("order");

    if (provider === "kashier" && kashierOrder) {
      let cancelled = false;
      const poll = async (attempt = 0) => {
        if (cancelled) return;
        const { data } = await supabase
          .from("kashier_orders")
          .select("status, amount, currency, credits, plan, method")
          .eq("order_id", kashierOrder)
          .maybeSingle();
        if (data) {
          setDetails({
            product_name: data.plan ? `${data.plan} Plan` : `${data.credits} MC top-up`,
            amount: Number(data.amount) * 100,
            currency: data.currency,
          });
          if (data.status === "paid") return setStatus("success");
          if (data.status === "failed") return setStatus("failed");
        }
        if (attempt < 20) {
          setStatus("pending");
          setTimeout(() => poll(attempt + 1), 2000);
        } else {
          setStatus("pending");
        }
      };
      poll();
      return () => {
        cancelled = true;
      };
    }

    const identifier =
      params.get("checkout_id") || params.get("payment_id") || params.get("subscription_id");
    if (!identifier) {
      setStatus("failed");
      return;
    }
    (async () => {
      try {
        const data = {
          status:
            params.get("status") === "active" || params.get("status") === "succeeded"
              ? "succeeded"
              : "open",
          payment_id: params.get("payment_id"),
          subscription_id: params.get("subscription_id"),
          checkout_id: identifier,
        };
        setDetails(data);
        if (data.status === "succeeded") setStatus("success");
        else if (data.status === "open") setStatus("pending");
        else setStatus("failed");
      } catch {
        setStatus("failed");
      }
    })();
  }, [params]);

  const handleSuccessContinue = async () => {
    setCreating(true);
    const pendingWorkspaceName = sessionStorage.getItem("megsy_pending_workspace_name");
    const pendingWorkspacePlan = sessionStorage.getItem("megsy_pending_workspace_plan");

    if (pendingWorkspaceName && pendingWorkspacePlan) {
      const { data, error } = await supabase.rpc("create_workspace", {
        p_name: pendingWorkspaceName,
        p_plan: pendingWorkspacePlan,
      } as never);

      if (!error && data) {
        const wsId = (data as any).id;
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) {
            await supabase
              .from("profiles")
              .update({ active_workspace_id: wsId } as any)
              .eq("id", user.id);
          }
        } catch {
          /* ignore */
        }
        try {
          sessionStorage.removeItem("megsy_pending_workspace_name");
        } catch {}
        try {
          sessionStorage.removeItem("megsy_pending_workspace_plan");
        } catch {}
        navigate(`/settings/workspaces/${(data as any).id}`);
        return;
      }
    }
    navigate("/");
  };

  const amountFormatted =
    details?.amount != null
      ? `${(details.amount / 100).toFixed(2)} ${(details.currency || "USD").toUpperCase()}`
      : null;

  const title = useMemo(() => {
    if (status === "loading") return "Confirming payment";
    if (status === "success") return "Payment successful";
    if (status === "pending") return "Processing payment";
    return "Payment failed";
  }, [status]);

  const subtitle = useMemo(() => {
    if (status === "loading") return "Hang tight, this only takes a moment.";
    if (status === "success") {
      return details?.product_name
        ? `Your ${details.product_name} is now active.`
        : "Your purchase is complete.";
    }
    if (status === "pending") return "This usually finishes within a minute.";
    return "If you were charged, the amount will be refunded automatically.";
  }, [status, details]);

  return (
    <div
      dir="ltr"
      className="relative min-h-dvh flex items-center justify-center p-4 sm:p-6 overflow-hidden bg-background"
    >
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.16, ease: [0.22, 0.9, 0.3, 1] }}
        className="w-full max-w-md rounded-[28px] p-6 sm:p-8 flex flex-col text-center"
        style={{ ...glass, fontFamily: mobileFont, color: "hsl(var(--brand-parchment))" }}
      >
        <div className="px-1 pb-5">
          <p className="text-[15px] font-medium text-foreground leading-tight">{title}</p>
          <p className="text-[13px] text-foreground/55 mt-1 leading-snug">{subtitle}</p>
        </div>

        {(amountFormatted || details?.product_name) && status !== "failed" && (
          <div className="mb-5 rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4 text-left">
            {details?.product_name && (
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-foreground/55">Plan</span>
                <span className="font-medium text-foreground">{details.product_name}</span>
              </div>
            )}
            {amountFormatted && (
              <div className="flex items-center justify-between text-[13px] mt-2">
                <span className="text-foreground/55">Amount</span>
                <span className="font-medium text-foreground">{amountFormatted}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-[13px] mt-2">
              <span className="text-foreground/55">Status</span>
              <span
                className={`font-medium ${
                  status === "success"
                    ? "text-emerald-400"
                    : status === "pending"
                      ? "text-amber-400"
                      : "text-foreground/70"
                }`}
              >
                {status === "success" ? "Paid" : status === "pending" ? "Pending" : "Confirming"}
              </span>
            </div>
          </div>
        )}

        {status === "success" && <SecondMonthOfferCard />}

        <div className="flex flex-col gap-2">
          {status === "success" && (
            <>
              <button
                onClick={handleSuccessContinue}
                disabled={creating}
                className="w-full flex items-center justify-center border border-foreground/10 rounded-2xl bg-foreground/[0.07] px-4 py-3.5 text-[14px] font-medium text-foreground hover:bg-foreground/[0.10] active:bg-foreground/[0.14] transition disabled:opacity-40"
              >
                {creating ? "Setting up…" : "Continue to dashboard"}
              </button>
              <button
                onClick={() => navigate("/settings/billing")}
                className="w-full flex items-center justify-center border border-foreground/10 rounded-2xl bg-foreground/[0.03] px-4 py-3.5 text-[14px] font-medium text-foreground/70 hover:bg-foreground/[0.07] active:bg-foreground/[0.10] transition"
              >
                View invoice
              </button>
            </>
          )}

          {status === "pending" && (
            <>
              <button
                onClick={() => window.location.reload()}
                className="w-full flex items-center justify-center border border-foreground/10 rounded-2xl bg-foreground/[0.07] px-4 py-3.5 text-[14px] font-medium text-foreground hover:bg-foreground/[0.10] active:bg-foreground/[0.14] transition"
              >
                Refresh status
              </button>
              <button
                onClick={() => navigate("/settings/billing")}
                className="w-full flex items-center justify-center border border-foreground/10 rounded-2xl bg-foreground/[0.03] px-4 py-3.5 text-[14px] font-medium text-foreground/70 hover:bg-foreground/[0.07] active:bg-foreground/[0.10] transition"
              >
                View invoices
              </button>
            </>
          )}

          {status === "failed" && (
            <>
              <button
                onClick={() => navigate("/pricing")}
                className="w-full flex items-center justify-center border border-foreground/10 rounded-2xl bg-foreground/[0.07] px-4 py-3.5 text-[14px] font-medium text-foreground hover:bg-foreground/[0.10] active:bg-foreground/[0.14] transition"
              >
                Back to pricing
              </button>
              <button
                onClick={() => navigate("/")}
                className="w-full flex items-center justify-center border border-foreground/10 rounded-2xl bg-foreground/[0.03] px-4 py-3.5 text-[14px] font-medium text-foreground/70 hover:bg-foreground/[0.07] active:bg-foreground/[0.10] transition"
              >
                Go home
              </button>
            </>
          )}

          {status === "loading" && (
            <div className="flex items-center justify-center py-4">
              <span className="w-5 h-5 border-2 border-foreground/25 border-t-foreground rounded-full animate-spin" />
            </div>
          )}
        </div>

        <p className="mt-5 text-[11.5px] text-foreground/65">
          Need help?{" "}
          <a href="mailto:support@megsyai.com" className="underline hover:text-foreground/70">
            support@megsyai.com
          </a>
        </p>
      </motion.div>
    </div>
  );
};

export default BillingSuccessPage;
