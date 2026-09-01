/** @doc Contact — Obsidian glass minimalism, matching Help & Support. */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { translateExactText, useUserLang } from "@/lib/authI18n";
import { goBackOr } from "@/lib/navigation";

export default function SettingsContactPage() {
  const navigate = useNavigate();
  const lang = useUserLang();
  const tx = (s: string) => translateExactText(s, lang);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      setEmail(u.email || "");
      const meta = (u.user_metadata as Record<string, unknown>) || {};
      const full = (meta.full_name as string) || (meta.name as string) || "";
      setName(full || u.email?.split("@")[0] || "");
    });
  }, []);

  const submit = async () => {
    if (!name.trim() || !email.trim() || !message.trim()) {
      toast.error(tx("Please fill in name, email and message"));
      return;
    }
    setSending(true);
    const { error } = await supabase.from("contact_submissions").insert({
      name: name.trim(),
      email: email.trim(),
      subject: subject.trim() || null,
      message: message.trim(),
      form_type: "support",
    });
    setSending(false);
    if (error) {
      toast.error(tx("Failed to send. Please try again."));
      return;
    }
    toast.success(tx("Message sent"));
    setSent(true);
    setSubject("");
    setMessage("");
  };

  const canSend = !!(name.trim() && email.trim() && message.trim() && !sending);

  const inputCls =
    "w-full rounded-[16px] border border-border bg-card px-4 py-3 text-[14.5px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[#333]";
  const labelCls =
    "mb-2 block px-1 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground";

  return (
    <div
      className="min-h-screen w-full bg-background text-foreground"
      style={{ fontFamily: '"DM Sans", "Inter", system-ui, sans-serif' }}
    >
      <div className="mx-auto w-full max-w-md px-6 py-8">
        {/* Top bar */}
        <div className="mb-8 flex items-center">
          <button
            onClick={() => goBackOr(navigate, "/settings/support")}
            aria-label="Back"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/40 text-foreground transition-colors hover:bg-background/60 active:scale-95"
          >
            <ArrowLeft className="h-[17px] w-[17px]" strokeWidth={2.2} />
          </button>
        </div>

        {/* Header */}
        <header className="mb-8 px-2">
          <h1
            className="text-[32px] leading-tight font-semibold tracking-tight text-foreground"
            style={{ fontFamily: '"Space Grotesk", "Inter", system-ui, sans-serif' }}
          >
            {tx("Contact")}
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
            {tx("Reach out and a real human on our team will reply within 24 hours.")}
          </p>
        </header>

        {sent ? (
          <div className="rounded-[24px] border border-border bg-background/40 p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-border bg-card">
              <CheckCircle2 className="h-6 w-6 text-foreground" strokeWidth={1.8} />
            </div>
            <p className="text-[17px] font-semibold text-foreground">{tx("Message sent")}</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
              {tx("Thanks")} {name.split(" ")[0]}. {tx("We'll reply to")}{" "}
              <b className="font-medium text-foreground">{email}</b>{" "}
              {tx("within 24 hours.")}
            </p>
            <button
              onClick={() => setSent(false)}
              className="mt-6 text-[13px] font-medium text-foreground underline underline-offset-4"
            >
              {tx("Send another message")}
            </button>
          </div>
        ) : (
          <>
            {/* Direct */}
            <section className="mb-8">
              <h2 className={labelCls}>{tx("Direct")}</h2>
              <a
                href="mailto:support@megsyai.com"
                className="group flex items-center justify-between rounded-[24px] border border-border bg-background/40 p-5 transition-all hover:bg-background/60 active:scale-[0.98]"
              >
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    {tx("Email")}
                  </span>
                  <span className="mt-1 text-[15px] font-medium text-foreground">
                    support@megsyai.com
                  </span>
                </div>
                <span className="rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground">
                  ~24h
                </span>
              </a>
            </section>

            {/* Form */}
            <section className="mb-8">
              <h2 className={labelCls}>{tx("Send a message")}</h2>
              <div className="flex flex-col gap-4 rounded-[24px] border border-border bg-background/40 p-5">
                <div>
                  <label className={labelCls}>{tx("Name")}</label>
                  <input
                    className={inputCls}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={tx("Your full name")}
                  />
                </div>
                <div>
                  <label className={labelCls}>{tx("Email")}</label>
                  <input
                    type="email"
                    className={inputCls}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label className={labelCls}>{tx("Subject")}</label>
                  <input
                    className={inputCls}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={tx("Optional")}
                  />
                </div>
                <div>
                  <label className={labelCls}>{tx("Message")}</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={5}
                    placeholder={tx("Tell us what's happening…")}
                    className={`${inputCls} resize-none leading-[1.55]`}
                  />
                </div>
              </div>
            </section>

            <button
              onClick={submit}
              disabled={!canSend}
              className="flex w-full items-center justify-center gap-2 rounded-[24px] border border-foreground bg-foreground px-6 py-4 text-[15px] font-semibold text-background transition-all hover:bg-foreground/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-border disabled:bg-background/40 disabled:text-muted-foreground"
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> {tx("Sending")}
                </>
              ) : (
                tx("Send message")
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
