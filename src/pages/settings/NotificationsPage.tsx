/** @doc Notifications settings — real toggles bound to notification_preferences. */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeErrorMessage } from "@/lib/sanitizeError";
import { useIsMobile } from "@/hooks/use-mobile";
import { goBackOr } from "@/lib/navigation";
import { SubShell, SubSection, SubCard } from "@/components/settings/SubShell";

type Prefs = {
  app_generation: boolean;
  app_credits: boolean;
  app_referral: boolean;
  app_system: boolean;
  email_enabled: boolean;
  email_transactions: boolean;
  email_low_balance: boolean;
  email_welcome: boolean;
  email_newsletter: boolean;
};

const DEFAULTS: Prefs = {
  app_generation: true,
  app_credits: true,
  app_referral: true,
  app_system: true,
  email_enabled: true,
  email_transactions: true,
  email_low_balance: true,
  email_welcome: true,
  email_newsletter: false,
};

type ToggleDef = { key: keyof Prefs; title: string; desc: string };

const APP_TOGGLES: ToggleDef[] = [
  { key: "app_generation", title: "Generation complete", desc: "Get notified when a generation completes" },
  { key: "app_credits", title: "Credit updates", desc: "Balance changes and top-up confirmations" },
  { key: "app_referral", title: "Referrals", desc: "Rewards and referral activity" },
  { key: "app_system", title: "System messages", desc: "Important account and product updates" },
];

const EMAIL_TOGGLES: ToggleDef[] = [
  { key: "email_transactions", title: "Transaction receipts", desc: "Emails for purchases and invoices" },
  { key: "email_low_balance", title: "Low balance alerts", desc: "Email when your credits run low" },
  { key: "email_welcome", title: "Welcome & onboarding", desc: "Getting-started emails for new features" },
  { key: "email_newsletter", title: "Product newsletter", desc: "Occasional product news and tips" },
];

const NotificationsPage = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const savedRef = useRef<Prefs>(DEFAULTS);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) {
        setLoading(false);
        return;
      }
      setUserId(user.id);
      const { data } = await supabase
        .from("notification_preferences")
        .select("app_generation,app_credits,app_referral,app_system,email_enabled,email_transactions,email_low_balance,email_welcome,email_newsletter")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const merged: Prefs = { ...DEFAULTS, ...(data ?? {}) } as Prefs;
      setPrefs(merged);
      savedRef.current = merged;
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Debounced autosave
  useEffect(() => {
    if (loading || !userId) return;
    const dirty = (Object.keys(prefs) as (keyof Prefs)[]).some(
      (k) => prefs[k] !== savedRef.current[k],
    );
    if (!dirty) return;
    setSaveState("saving");
    const timer = setTimeout(async () => {
      try {
        const { error } = await supabase.from("notification_preferences").upsert(
          { user_id: userId, ...prefs },
          { onConflict: "user_id" },
        );
        if (error) throw error;
        savedRef.current = { ...prefs };
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1200);
      } catch (e) {
        setSaveState("idle");
        toast.error(sanitizeErrorMessage(e) || "Failed to save");
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [prefs, loading, userId]);

  const setKey = (k: keyof Prefs, v: boolean) =>
    setPrefs((p) => ({ ...p, [k]: v }));

  const StatusBadge = () => (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-[rgba(232,232,232,0.55)]">
      {saveState === "saving" && (<><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>)}
      {saveState === "saved" && (<><Check className="w-3.5 h-3.5" /> Saved</>)}
    </span>
  );

  if (isMobile) {
    return (
      <div className="npg-root">
        <style>{npgCss}</style>

        <header className="npg-topbar">
          <button
            className="npg-icon-btn"
            aria-label="Back"
            onClick={() => goBackOr(navigate, "/settings")}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="npg-title">Notifications</h1>
          <div className="npg-status"><StatusBadge /></div>
        </header>

        <section className="npg-main">
          <div className="npg-section-title">In-app</div>
          <div className="npg-card">
            {APP_TOGGLES.map((t, i) => (
              <ToggleRow
                key={t.key}
                title={t.title}
                desc={t.desc}
                checked={prefs[t.key]}
                onChange={(v) => setKey(t.key, v)}
                divider={i < APP_TOGGLES.length - 1}
              />
            ))}
          </div>

          <div className="npg-section-title">Email</div>
          <div className="npg-card">
            <ToggleRow
              title="Email notifications"
              desc="Turn off to stop all emails from Megsy, including product news"
              checked={prefs.email_enabled}
              onChange={(v) => setKey("email_enabled", v)}
              divider={false}
            />
          </div>
          {prefs.email_enabled && (
            <div className="npg-card" style={{ marginTop: 12 }}>
              {EMAIL_TOGGLES.map((t, i) => (
                <ToggleRow
                  key={t.key}
                  title={t.title}
                  desc={t.desc}
                  checked={prefs[t.key]}
                  onChange={(v) => setKey(t.key, v)}
                  divider={i < EMAIL_TOGGLES.length - 1}
                />
              ))}
            </div>
          )}

          <div className="npg-spacer" />
        </section>
      </div>
    );
  }

  // Desktop
  return (
    <SubShell
      title="Notifications"
      subtitle="Choose what to be notified about. Saved automatically."
      backTo="/settings"
      action={<StatusBadge />}
    >
      <SubSection title="In-app" description="Notifications inside Megsy.">
        <SubCard>
          <div className="divide-y divide-border/60">
            {APP_TOGGLES.map((t) => (
              <div key={t.key} className="flex items-start justify-between gap-6 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-[14px] font-medium text-foreground">{t.title}</div>
                  <div className="text-[12.5px] text-muted-foreground mt-0.5">{t.desc}</div>
                </div>
                <Switch label={t.title} checked={prefs[t.key]} onChange={(v) => setKey(t.key, v)} />
              </div>
            ))}
          </div>
        </SubCard>
      </SubSection>

      <SubSection title="Email" description="What lands in your inbox.">
        <SubCard>
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="text-[14px] font-medium text-foreground">Email notifications</div>
              <div className="text-[12.5px] text-muted-foreground mt-0.5">
                Turn off to stop all emails from Megsy, including product news
              </div>
            </div>
            <Switch label="Email notifications" checked={prefs.email_enabled} onChange={(v) => setKey("email_enabled", v)} />
          </div>
        </SubCard>
      </SubSection>

      {prefs.email_enabled && (
      <SubSection title="Email types" description="Fine-tune what we send.">
        <SubCard>
          <div className="divide-y divide-border/60">
            {EMAIL_TOGGLES.map((t) => (
              <div key={t.key} className="flex items-start justify-between gap-6 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-[14px] font-medium text-foreground">{t.title}</div>
                  <div className="text-[12.5px] text-muted-foreground mt-0.5">{t.desc}</div>
                </div>
                <Switch label={t.title} checked={prefs[t.key]} onChange={(v) => setKey(t.key, v)} />
              </div>
            ))}
          </div>
        </SubCard>
      </SubSection>
      )}
    </SubShell>
  );
};

const ToggleRow = ({
  title, desc, checked, onChange, divider,
}: { title: string; desc: string; checked: boolean; onChange: (v: boolean) => void; divider: boolean }) => (
  <>
    <div className="npg-row">
      <div className="npg-row-text">
        <div className="npg-row-title">{title}</div>
        <div className="npg-row-desc">{desc}</div>
      </div>
      <Switch label={title} checked={checked} onChange={onChange} />
    </div>
    {divider && <div className="npg-divider" />}
  </>
);

const Switch = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
  <button
    type="button"
    role="switch"
    aria-label={label}
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className={`npg-switch ${checked ? "is-on" : ""}`}
  >
    <span className="npg-switch-thumb" />
  </button>
);

const npgCss = `
.npg-root {
  min-height: 100dvh;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  font-family: "Neue Haas Unica", "Helvetica Now Display", -apple-system, "SF Pro Display", Inter, "Segoe UI", Roboto, sans-serif;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
.npg-topbar {
  position: sticky; top: 0; z-index: 5;
  display: grid; grid-template-columns: 44px 1fr 44px;
  align-items: center;
  padding: calc(env(safe-area-inset-top, 0px) + 10px) 14px 12px;
  background: hsl(var(--background));
}
.npg-title {
  margin: 0; text-align: center;
  font-size: 17px; font-weight: 600;
  letter-spacing: -0.01em; color: hsl(var(--foreground));
}
.npg-status { display: flex; justify-content: flex-end; padding-right: 4px; }
.npg-icon-btn {
  width: 44px; height: 44px; margin-inline-start: -2px;
  display: inline-grid; place-items: center;
  border-radius: 999px;
  background: transparent;
  border: 0;
  color: hsl(var(--foreground)); cursor: pointer;
  transition: transform 160ms ease;
}
.npg-icon-btn:active { transform: scale(0.94); }

.npg-main { padding: 8px 16px 24px; }
.npg-section-title {
  margin: 18px 6px 10px;
  font-size: 13px; font-weight: 500;
  color: rgba(232,232,232,0.5);
  letter-spacing: -0.005em;
}
.npg-card {
  background: hsl(var(--card));
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 18px;
  overflow: hidden;
}
.npg-row {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 18px;
  min-height: 64px;
}
.npg-row-text { flex: 1; min-width: 0; }
.npg-row-title {
  font-size: 15.5px; font-weight: 600;
  color: hsl(var(--foreground));
  letter-spacing: -0.005em;
}
.npg-row-desc {
  font-size: 13px;
  color: rgba(232,232,232,0.5);
  margin-top: 3px;
  line-height: 1.35;
}
.npg-divider {
  height: 1px;
  background: rgba(255,255,255,0.06);
  margin-left: 18px;
}
.npg-spacer { height: 40px; }

.npg-switch {
  /* 44px tall hit area; the visible 31px iOS-style track is drawn by ::before. */
  position: relative;
  flex-shrink: 0;
  width: 51px; height: 44px;
  background: transparent;
  border: 0; padding: 0;
  cursor: pointer;
}
.npg-switch::before {
  content: "";
  position: absolute;
  left: 0; right: 0; top: 6.5px; height: 31px;
  border-radius: 999px;
  background: rgba(120,120,128,0.32);
  transition: background 180ms ease;
}
.npg-switch:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 3px;
}
.npg-switch.is-on::before { background: hsl(var(--primary)); }
.npg-switch-thumb {
  position: absolute;
  top: 8.5px; left: 2px;
  width: 27px; height: 27px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 4px rgba(0,0,0,0.35);
  transition: transform 180ms ease;
}
.npg-switch.is-on .npg-switch-thumb { transform: translateX(20px); background: hsl(var(--primary-foreground)); }
`;

export default NotificationsPage;
