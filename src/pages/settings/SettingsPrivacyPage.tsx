/** @doc Privacy settings — mobile-first dark cards matching the native iOS privacy screen. */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  SubShell,
  SubSection,
  SubCard,
} from "@/components/settings/SubShell";
import { downloadUserData } from "@/lib/exportUserData";

export default function SettingsPrivacyPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [isExporting, setIsExporting] = useState(false);

  const handleExportData = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const toastId = toast.loading("Preparing your data export…");
    try {
      await downloadUserData(({ table, index, total }) => {
        toast.loading(`Exporting your data… (${index}/${total}: ${table})`, { id: toastId });
      });
      toast.success("Your data export has downloaded.", { id: toastId });
    } catch (error: any) {
      toast.error(error?.message || "Couldn't export your data. Please try again.", { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  const DataPrivacyCard = () => (
    <div className="rounded-[18px] bg-background border border-foreground/[0.07] p-4">
      <h3 className="text-[17px] font-semibold text-foreground mb-2">Data privacy</h3>
      <p className="text-[13px] leading-[1.45] text-foreground/55">
        Megsy believes in transparent data practices.
      </p>
      <p className="mt-3 text-[13px] leading-[1.5] text-foreground/55">
        Keeping your data safe is a priority. Learn how your information is protected when using Megsy products, and visit our{" "}
        <a
          href="/privacy"
          onClick={(e) => {
            e.preventDefault();
            navigate("/privacy");
          }}
          className="text-foreground underline underline-offset-2 decoration-[#EDE4D8]/30"
        >
          Privacy Center
        </a>{" "}
        and{" "}
        <a
          href="/privacy"
          onClick={(e) => {
            e.preventDefault();
            navigate("/privacy");
          }}
          className="text-foreground underline underline-offset-2 decoration-[#EDE4D8]/30"
        >
          Privacy Policy
        </a>{" "}
        for more details.
      </p>
    </div>
  );

  const ExportDataCard = () => (
    <div className="rounded-[18px] bg-background border border-foreground/[0.07] p-4 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <h3 className="text-[17px] font-semibold text-foreground leading-tight">
          Download my data
        </h3>
        <p className="mt-1.5 text-[13px] leading-[1.5] text-foreground/55">
          Get a copy of your profile, conversations, messages, and other account data as a JSON file.
        </p>
        <button
          type="button"
          onClick={handleExportData}
          disabled={isExporting}
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-foreground/[0.08] border border-foreground/[0.1] px-4 py-2 text-[13px] font-medium text-foreground disabled:opacity-50"
      aria-label="Download"
    >
          <Download className="w-[14px] h-[14px]" />
          {isExporting ? "Exporting…" : "Export my data"}
        </button>
      </div>
    </div>
  );

  if (!isMobile) {
    return (
      <SubShell
        title="Privacy"
        subtitle="Control what Megsy stores and how your data is used."
        backTo="/settings"
      >
        <SubSection title="Data privacy">
          <SubCard>
            <DataPrivacyCard />
          </SubCard>
        </SubSection>

        <SubSection title="Your data">
          <SubCard>
            <ExportDataCard />
          </SubCard>
        </SubSection>
      </SubShell>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground font-sans">
      <style>{mobileCss}</style>
      <div className="privacy-root">
        {/* Topbar */}
        <header className="privacy-topbar">
          <button className="privacy-icon-btn" aria-label="Back" onClick={() => navigate("/settings")}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h1 className="privacy-title">Privacy</h1>
          <div className="w-11" />
        </header>

        <section className="privacy-main">
          <DataPrivacyCard />
          <div className="h-4" />
          <ExportDataCard />
        </section>
      </div>
    </div>
  );
}

const mobileCss = `
.privacy-root {
  min-height: 100dvh;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  font-family: "Neue Haas Unica", "Helvetica Now Display", -apple-system, "SF Pro Display", Inter, "Segoe UI", Roboto, sans-serif;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
.privacy-topbar {
  position: sticky; top: 0; z-index: 5;
  display: grid; grid-template-columns: 44px 1fr 44px;
  align-items: center;
  padding: calc(env(safe-area-inset-top, 0px) + 10px) 14px 12px;
  background: hsl(var(--background));
}
.privacy-title {
  margin: 0;
  text-align: center;
  font-size: 17px; font-weight: 600;
  letter-spacing: -0.01em;
  color: hsl(var(--foreground));
}
.privacy-icon-btn {
  width: 40px; height: 40px;
  display: inline-grid; place-items: center;
  border-radius: 999px;
  background: transparent;
  border: 0;
  color: hsl(var(--foreground));
  cursor: pointer;
  transition: transform 160ms ease;
}
.privacy-icon-btn:active { transform: scale(0.94); }
.privacy-main { padding: 8px 16px 24px; }
`;
