/** @doc Help & Support — Obsidian glass minimalism. */
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function SettingsSupportPage() {
  const navigate = useNavigate();

  const goBack = () => navigate("/settings");

  return (
    <div className="min-h-screen w-full bg-background text-foreground" style={{ fontFamily: '"DM Sans", "Inter", system-ui, sans-serif' }}>
      <div className="mx-auto w-full max-w-md px-6 py-8">
        {/* Top bar */}
        <div className="mb-8 flex items-center">
          <button
            onClick={goBack}
            aria-label="Back"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/40 text-foreground transition-colors hover:bg-background/60 active:scale-95"
          >
            <ArrowLeft className="h-[17px] w-[17px]" strokeWidth={2.2} />
          </button>
        </div>

        {/* Header */}
        <header className="mb-10 px-2">
          <h1
            className="text-[32px] leading-tight font-semibold tracking-tight text-foreground"
            style={{ fontFamily: '"Space Grotesk", "Inter", system-ui, sans-serif' }}
          >
            Help & Support
          </h1>
        </header>

        {/* Get Help */}
        <section className="mb-8 flex flex-col gap-3">
          <h2
            className="px-2 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground"
            style={{ fontFamily: '"Space Grotesk", "Inter", system-ui, sans-serif' }}
          >
            Get Help
          </h2>

          <div className="flex flex-col gap-2">
            <SupportCard
              label="Help Center"
              hint="Browse articles and guides"
              onClick={() => navigate("/settings/support/help")}
            />

            <SupportCard
              label="Ask AI"
              hint="Instant answers from our agent"
              onClick={() => navigate("/chat")}
            />

            <SupportCard
              label="Write to a human"
              hint="Typically replies in 24h"
              onClick={() => navigate("/settings/support/contact")}
            />
          </div>
        </section>

        {/* Resources */}
        <section className="mb-10 flex flex-col gap-3">
          <h2
            className="px-2 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground"
            style={{ fontFamily: '"Space Grotesk", "Inter", system-ui, sans-serif' }}
          >
            Resources
          </h2>

          <div className="flex flex-col">
            <SupportCard
              label="Documentation"
              hint="Technical specs and API reference"
              onClick={() => window.open("https://help.megsyai.com", "_blank", "noopener")}
            />
          </div>
        </section>

        {/* Footer */}
        <footer className="px-2 pt-4">
          <p className="text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
            App Version 4.12.0 • Build 992
          </p>
        </footer>
      </div>
    </div>
  );
}

function SupportCard({
  label,
  hint,
  badge,
  onClick,
}: {
  label: string;
  hint: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center justify-between rounded-[24px] border border-border bg-background/40 p-5 text-left transition-all hover:bg-background/60 active:scale-[0.98]"
    >
      <div className="flex flex-col items-start gap-1">
        <div className="flex items-center gap-2">
          <span className="text-base font-medium text-foreground">{label}</span>
          {badge && (
            <span
              className="rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-background"
              style={{ fontFamily: '"Space Grotesk", "Inter", system-ui, sans-serif' }}
            >
              {badge}
            </span>
          )}
        </div>
        <span className="text-sm text-muted-foreground">{hint}</span>
      </div>
      <svg
        className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-foreground"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
    </button>
  );
}
