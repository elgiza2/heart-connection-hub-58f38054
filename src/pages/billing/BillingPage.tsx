/** @doc Subscription management page. */
import { useState, useEffect } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  CalendarClock,
  Rocket,
  HeartHandshake,
  LogOut,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { SubShell, SubSection, SubCard } from "@/components/settings/SubShell";
import ProfileGlassShell, {
  GlassSection,
  GlassCard,
  GlassRow,
  GlassPrimaryButton,
  GlassSecondaryButton,
} from "@/components/profile/ProfileGlassShell";
import { toast } from "sonner";
import { SAVE_OFFER, saveOfferPrice } from "@/data/pricingData";

type Sub = {
  plan: string | null;
  status: string | null;
  current_period_end: string | null;
  amount_cents: number | null;
  currency: string | null;
};

const fmtDate = (s?: string | null) =>
  s
    ? new Date(s).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

const REASONS = [
  "Too expensive",
  "Not using it enough",
  "Missing features",
  "Found an alternative",
  "Other",
];

const BillingPage = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [credits, setCredits] = useState(0);
  const [plan, setPlan] = useState("Free");
  const [sub, setSub] = useState<Sub | null>(null);

  // cancel flow
  const [cancelOpen, setCancelOpen] = useState(false);
  const [step, setStep] = useState<"offer" | "reason">("offer");
  const [reason, setReason] = useState<string>("");
  const [improvement, setImprovement] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("credits, plan")
        .eq("id", user.id)
        .single();
      if (profile) {
        setCredits(Number(profile.credits) || 0);
        setPlan(profile.plan || "Free");
      }
      const { data: subData } = await supabase
        .from("subscriptions")
        .select("plan, status, current_period_end, amount_cents, currency")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (subData) setSub(subData as Sub);
    })();
  }, []);

  const goBack = () => navigate("/settings");
  const isActive = sub?.status === "active" || sub?.status === "trialing";
  const priceLabel = sub?.amount_cents
    ? `${(sub.amount_cents / 100).toFixed(0)} ${sub.currency || "EGP"}`
    : null;

  const submitCancel = async () => {
    if (!reason) {
      toast.error("Please tell us why you're cancelling");
      return;
    }
    setSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("contact_submissions").insert({
        user_id: user.id,
        subject: "Subscription cancellation",
        message: `Reason: ${reason}\n\nHow we can improve:\n${improvement || "—"}`,
      } as any);
      if (error) throw error;
      toast.success("Cancellation request sent. Our team will reach out shortly.");
      setCancelOpen(false);
      setReason("");
      setImprovement("");
    } catch (e: any) {
      toast.error(e?.message || "Could not submit request");
    } finally {
      setSubmitting(false);
    }
  };

  const monthlyPrice = sub?.amount_cents ? Math.round(sub.amount_cents / 100) : null;
  const halfPrice = monthlyPrice ? saveOfferPrice(monthlyPrice) : null;

  const sendRetentionRequest = async (kind: "discount" | "pause", detail: string) => {
    setSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("contact_submissions").insert({
        user_id: user.id,
        subject: kind === "discount" ? "Retention offer — 50% for 2 months" : "Subscription pause request",
        message: detail,
      } as any);
      if (error) throw error;
      toast.success(
        kind === "discount"
          ? "Your discount request is in — we'll apply it within a few minutes."
          : "Pause requested. We'll freeze your plan and keep everything saved.",
      );
      setCancelOpen(false);
      setStep("offer");
      setReason("");
      setImprovement("");
    } catch (e: any) {
      toast.error(e?.message || "Could not submit request");
    } finally {
      setSubmitting(false);
    }
  };

  const SaveOffer = (
    <GlassCard>
      <div style={{ padding: 16, display: "grid", gap: 14 }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{SAVE_OFFER.titleEn}</p>
          <p style={{ fontSize: 13, color: "var(--overlay-white-70)", marginTop: 6, lineHeight: 1.55 }}>
            {SAVE_OFFER.bodyEn}
          </p>
        </div>

        {halfPrice != null && monthlyPrice != null && (
          <div
            style={{
              borderRadius: 14,
              border: "1px solid var(--overlay-white-14)",
              background: "var(--overlay-white-04)",
              padding: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 26, fontWeight: 600, color: "#fff" }}>
                {halfPrice} {sub?.currency || "EGP"}
              </span>
              <span style={{ fontSize: 13, color: "var(--overlay-white-70)", textDecoration: "line-through" }}>
                {monthlyPrice} {sub?.currency || "EGP"}
              </span>
              <span style={{ fontSize: 12.5, color: "var(--overlay-white-70)" }}>
                / month for {SAVE_OFFER.months} months
              </span>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gap: 8 }}>
          <GlassPrimaryButton
            onClick={() =>
              sendRetentionRequest(
                "discount",
                `Customer accepted the retention offer: ${SAVE_OFFER.discountPercent}% off for ${SAVE_OFFER.months} months on plan ${sub?.plan || plan}.`,
              )
            }
            disabled={submitting}
          >
            {submitting ? "Sending…" : SAVE_OFFER.discountCtaEn}
          </GlassPrimaryButton>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12.5, color: "var(--overlay-white-70)" }}>Or pause for</span>
            {SAVE_OFFER.pauseMonths.map((m) => (
              <button
                key={m}
                disabled={submitting}
                onClick={() =>
                  sendRetentionRequest("pause", `Customer asked to pause the subscription for ${m} month(s).`)
                }
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  fontSize: 12.5,
                  fontWeight: 500,
                  border: "1px solid var(--overlay-white-14)",
                  background: "var(--overlay-white-04)",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                {m} {m === 1 ? "month" : "months"}
              </button>
            ))}
          </div>
        </div>

        <div className="ng-actions" style={{ marginTop: 4 }}>
          <GlassSecondaryButton onClick={() => setStep("reason")}>
            No thanks, cancel
          </GlassSecondaryButton>
          <GlassPrimaryButton onClick={() => setCancelOpen(false)}>Keep plan</GlassPrimaryButton>
        </div>
      </div>
    </GlassCard>
  );

  const CancelForm = (
    <GlassCard>
      <div style={{ padding: 16, display: "grid", gap: 14 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 8 }}>
            Why are you cancelling?
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {REASONS.map((r) => {
              const active = reason === r;
              return (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 999,
                    fontSize: 12.5,
                    fontWeight: 500,
                    border: `1px solid ${active ? "rgba(255,255,255,0.55)" : "var(--overlay-white-14)"}`,
                    background: active ? "rgba(255,255,255,0.16)" : "var(--overlay-white-04)",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  {r}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label style={{ fontSize: 12, color: "var(--overlay-white-70)", display: "block", marginBottom: 6 }}>
            How can we improve?
          </label>
          <textarea
            placeholder="Optional — what would have kept you here?"
            value={improvement}
            onChange={(e) => setImprovement(e.target.value)}
            rows={3}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              background: "var(--overlay-white-04)",
              border: "1px solid var(--overlay-white-12)",
              color: "#fff",
              fontSize: 13,
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
        </div>
        <div className="ng-actions" style={{ marginTop: 4 }}>
          <GlassSecondaryButton onClick={() => setCancelOpen(false)}>
            Keep plan
          </GlassSecondaryButton>
          <GlassPrimaryButton onClick={submitCancel} disabled={submitting}>
            {submitting ? "Sending…" : "Confirm cancel"}
          </GlassPrimaryButton>
        </div>
      </div>
    </GlassCard>
  );

  const CancelFlow = SAVE_OFFER.enabled && step === "offer" ? SaveOffer : CancelForm;


  if (isMobile) {
    const planLabel = (plan || "Free").toString();
    return (
      <div className="bpv2-root">
        <style>{bpv2Css}</style>
        <header className="bpv2-topbar">
          <button className="bpv2-back" aria-label="Back" onClick={goBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h1 className="bpv2-title">Billing</h1>
          <div style={{ width: 36 }} />
        </header>

        <main className="bpv2-main">
          {/* Hero: credits */}
          <section className="bpv2-hero">
            <div className="bpv2-hero-top">
              <span className="bpv2-eyebrow">Message credits</span>
              <span className="bpv2-plan-chip">{planLabel}</span>
            </div>
            <div className="bpv2-credits">
              <span className="bpv2-credits-num">{credits.toLocaleString()}</span>
              <span className="bpv2-credits-unit">MC</span>
            </div>
            <p className="bpv2-hero-sub">Available on your account</p>
            <div className="bpv2-hero-actions">
              <button className="bpv2-btn bpv2-btn-primary" onClick={() => navigate("/pricing")}>
                Top up
                <ArrowUpRight className="w-4 h-4" />
              </button>
              <button className="bpv2-btn bpv2-btn-ghost" onClick={() => navigate("/settings/referrals")}>
                Earn free MC
              </button>
            </div>
          </section>

          {/* Plan details */}
          <section className="bpv2-section">
            <h2 className="bpv2-section-title">Plan</h2>
            <div className="bpv2-card">
              <div className="bpv2-row">
                <div className="bpv2-row-icon"><BadgeCheck className="w-[18px] h-[18px]" /></div>
                <div className="bpv2-row-body">
                  <div className="bpv2-row-label">Status</div>
                  <div className="bpv2-row-hint">
                    {isActive
                      ? priceLabel
                        ? `${sub?.status} · ${priceLabel}`
                        : String(sub?.status)
                      : "No active subscription"}
                  </div>
                </div>
              </div>
              {isActive && sub?.current_period_end && (
                <div className="bpv2-row bpv2-row-b">
                  <div className="bpv2-row-icon"><CalendarClock className="w-[18px] h-[18px]" /></div>
                  <div className="bpv2-row-body">
                    <div className="bpv2-row-label">Next renewal</div>
                    <div className="bpv2-row-hint">{fmtDate(sub.current_period_end)}</div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Manage */}
          <section className="bpv2-section">
            <h2 className="bpv2-section-title">Manage</h2>
            <div className="bpv2-card">
              <button className="bpv2-row bpv2-row-btn" onClick={() => navigate("/pricing")}>
                <div className="bpv2-row-icon"><Rocket className="w-[18px] h-[18px]" /></div>
                <div className="bpv2-row-body">
                  <div className="bpv2-row-label">{isActive ? "Change plan" : "Upgrade plan"}</div>
                  <div className="bpv2-row-hint">View pricing and switch plans</div>
                </div>
                <ArrowUpRight className="w-4 h-4 bpv2-row-chev" />
              </button>
              <button className="bpv2-row bpv2-row-btn bpv2-row-b" onClick={() => navigate("/settings/referrals")}>
                <div className="bpv2-row-icon"><HeartHandshake className="w-[18px] h-[18px]" /></div>
                <div className="bpv2-row-body">
                  <div className="bpv2-row-label">Referrals</div>
                  <div className="bpv2-row-hint">Invite friends and unlock bonuses</div>
                </div>
                <ArrowUpRight className="w-4 h-4 bpv2-row-chev" />
              </button>
              {isActive && !cancelOpen && (
                <button className="bpv2-row bpv2-row-btn bpv2-row-b bpv2-row-danger" onClick={() => { setStep("offer"); setCancelOpen(true); }}>
                  <div className="bpv2-row-icon"><LogOut className="w-[18px] h-[18px]" /></div>
                  <div className="bpv2-row-body">
                    <div className="bpv2-row-label">Cancel subscription</div>
                    <div className="bpv2-row-hint">We'll ask a quick question</div>
                  </div>
                </button>
              )}
            </div>
          </section>

          {isActive && cancelOpen && (
            <section className="bpv2-section">
              <h2 className="bpv2-section-title">{step === "offer" ? "Wait — an offer for you" : "Before you go"}</h2>
              <div className="bpv2-card bpv2-card-pad">{CancelFlow}</div>
            </section>
          )}

          <div className="bpv2-bottom-spacer" />
        </main>
      </div>
    );
  }


  return (
    <SubShell
      title="Subscription"
      subtitle="Manage your plan and message credits."
      backTo="/settings"
    >
      <SubSection title="Credits" description="Message credits available on your account.">
        <SubCard>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                Message credits
              </p>
              <p className="mt-2 text-[32px] font-semibold text-foreground leading-none">
                {credits.toLocaleString()}
                <span className="ml-2 text-[13px] font-medium text-muted-foreground">MC</span>
              </p>
            </div>
            <span className="text-[11px] font-semibold px-3 py-1 rounded-full border border-border bg-background/60 uppercase tracking-[0.14em]">
              {plan}
            </span>
          </div>
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              onClick={() => navigate("/settings/referrals")}
              className="px-4 py-2 rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Earn MC
            </button>
            <button
              onClick={() => navigate("/pricing")}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors inline-flex items-center gap-1.5"
            >
              Top up <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </SubCard>
      </SubSection>

      <SubSection title="Plan details" description="Your active subscription.">
        <SubCard>
          <div className="grid grid-cols-2 gap-4 text-[13px]">
            <div>
              <p className="text-muted-foreground text-[11px] uppercase tracking-[0.14em]">Status</p>
              <p className="mt-1 font-medium text-foreground">{sub?.status || "free"}</p>
            </div>
            {isActive && (
              <>
                <div>
                  <p className="text-muted-foreground text-[11px] uppercase tracking-[0.14em]">Price</p>
                  <p className="mt-1 font-medium text-foreground">{priceLabel || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px] uppercase tracking-[0.14em]">Renews on</p>
                  <p className="mt-1 font-medium text-foreground">{fmtDate(sub?.current_period_end)}</p>
                </div>
              </>
            )}
          </div>
          <div className="mt-5 flex items-center justify-end gap-2">
            {isActive && (
              <button
                onClick={() => { setStep("offer"); setCancelOpen((v) => !v); }}
                className="px-4 py-2 rounded-lg text-[13px] font-medium text-rose-500 hover:bg-rose-500/10 transition-colors"
              >
                Cancel subscription
              </button>
            )}
            <button
              onClick={() => navigate("/pricing")}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors inline-flex items-center gap-1.5"
            >
              {isActive ? "Change plan" : "Upgrade"} <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </SubCard>
      </SubSection>

      {isActive && cancelOpen && (
        <SubSection title={step === "offer" ? "Wait — an offer for you" : "Before you go"} description={step === "offer" ? "Half price for two months, or pause instead." : "Tell us why so we can improve."}>
          <SubCard>{CancelFlow}</SubCard>
        </SubSection>
      )}
    </SubShell>
  );
};

const bpv2Css = `
.bpv2-root {
  min-height: 100dvh;
  background: hsl(var(--background));
  color: hsl(var(--foreground) / 0.9);
  font-family: "DM Sans", -apple-system, "SF Pro Text", Inter, sans-serif;
  display: flex; flex-direction: column; align-items: center;
}
.bpv2-topbar {
  position: sticky; top: 0; z-index: 10;
  width: 100%; max-width: 480px;
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px calc(14px + env(safe-area-inset-top, 0px));
  padding-top: calc(14px + env(safe-area-inset-top, 0px));
  background: linear-gradient(to bottom, #000 82%, transparent);
  backdrop-filter: blur(20px);
}
.bpv2-back {
  width: 36px; height: 36px; border-radius: 999px;
  display: inline-flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  color: hsl(var(--foreground) / 0.9); cursor: pointer;
  transition: background 160ms ease, transform 120ms ease;
}
.bpv2-back:active { transform: scale(0.94); background: rgba(255,255,255,0.10); }
.bpv2-title {
  font-family: "Space Grotesk", -apple-system, "SF Pro Display", Inter, sans-serif;
  font-size: 17px; font-weight: 500; letter-spacing: -0.01em;
  color: hsl(var(--foreground)); margin: 0;
}

.bpv2-main {
  width: 100%; max-width: 480px;
  padding: 8px 16px 24px;
  display: flex; flex-direction: column; gap: 24px;
}

.bpv2-hero {
  border: 1px solid rgba(255,255,255,0.08);
  background:
    radial-gradient(120% 90% at 0% 0%, rgba(255,255,255,0.06), transparent 60%),
    linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%);
  border-radius: 24px;
  padding: 20px;
  display: flex; flex-direction: column; gap: 14px;
}
.bpv2-hero-top {
  display: flex; align-items: center; justify-content: space-between;
}
.bpv2-eyebrow {
  font-size: 11px; font-weight: 500;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: hsl(var(--muted-foreground));
}
.bpv2-plan-chip {
  font-family: "Space Grotesk", sans-serif;
  font-size: 11px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase;
  padding: 5px 10px; border-radius: 999px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.10);
  color: hsl(var(--foreground));
}
.bpv2-credits {
  display: flex; align-items: baseline; gap: 8px;
  font-family: "Space Grotesk", sans-serif;
}
.bpv2-credits-num {
  font-size: 56px; font-weight: 500; letter-spacing: -0.03em;
  color: hsl(var(--foreground)); line-height: 1;
}
.bpv2-credits-unit {
  font-size: 16px; font-weight: 500; color: hsl(var(--muted-foreground));
}
.bpv2-hero-sub {
  margin: 0; font-size: 13px; color: hsl(var(--muted-foreground));
}
.bpv2-hero-actions {
  display: flex; gap: 8px; margin-top: 4px;
}
.bpv2-btn {
  flex: 1;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 12px 14px; border-radius: 14px;
  font-family: "Space Grotesk", sans-serif;
  font-size: 14px; font-weight: 500; letter-spacing: -0.005em;
  cursor: pointer; border: 1px solid transparent;
  transition: transform 120ms ease, background 160ms ease;
}
.bpv2-btn:active { transform: scale(0.98); }
.bpv2-btn-primary {
  background: hsl(var(--primary)); color: hsl(var(--primary-foreground));
}
.bpv2-btn-primary:hover { background: hsl(var(--primary) / 0.88); }
.bpv2-btn-ghost {
  background: rgba(255,255,255,0.05);
  border-color: rgba(255,255,255,0.10);
  color: hsl(var(--foreground));
}
.bpv2-btn-ghost:hover { background: rgba(255,255,255,0.09); }

.bpv2-section { display: flex; flex-direction: column; gap: 10px; }
.bpv2-section-title {
  font-family: "Space Grotesk", sans-serif;
  font-size: 11px; font-weight: 500;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: hsl(var(--muted-foreground));
  margin: 0 4px;
}
.bpv2-card {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 18px;
  overflow: hidden;
}
.bpv2-card-pad { padding: 4px; }

.bpv2-row {
  width: 100%;
  display: flex; align-items: center; gap: 14px;
  padding: 14px 16px;
  background: transparent; border: 0;
  color: hsl(var(--foreground) / 0.9); text-align: left; cursor: default;
  font: inherit;
}
.bpv2-row-btn { cursor: pointer; transition: background 140ms ease; }
.bpv2-row-btn:active { background: rgba(255,255,255,0.05); }
.bpv2-row-b { border-top: 1px solid rgba(255,255,255,0.06); }
.bpv2-row-icon {
  width: 36px; height: 36px; flex-shrink: 0;
  border-radius: 10px;
  background: rgba(255,255,255,0.06);
  display: inline-flex; align-items: center; justify-content: center;
  color: hsl(var(--foreground) / 0.9);
}
.bpv2-row-body { flex: 1; min-width: 0; }
.bpv2-row-label {
  font-family: "Space Grotesk", sans-serif;
  font-size: 15px; font-weight: 500; color: hsl(var(--foreground)); letter-spacing: -0.005em;
}
.bpv2-row-hint { font-size: 12.5px; color: hsl(var(--muted-foreground)); margin-top: 2px; }
.bpv2-row-chev { color: hsl(var(--muted-foreground)); flex-shrink: 0; }
.bpv2-row-danger .bpv2-row-label { color: hsl(var(--destructive)); }
.bpv2-row-danger .bpv2-row-icon { color: hsl(var(--destructive)); background: rgba(255,69,58,0.10); }

.bpv2-bottom-spacer { height: calc(env(safe-area-inset-bottom, 0px) + 32px); }
`;

export default BillingPage;

