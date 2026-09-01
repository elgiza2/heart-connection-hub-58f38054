/** @doc Help Center — Obsidian glass minimalism, matching Help & Support. */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { goBackOr } from "@/lib/navigation";

const sections = [
  {
    title: "Getting started",
    items: [
      { q: "What is Megsy?", a: "Megsy is an all-in-one AI creative platform — chat, images, videos, websites/code, presentations, and file analysis, all running on Megsy Credits (MC)." },
      { q: "How do credits (MC) work?", a: "Every action consumes MC. Chat costs 1 MC, images start at 2 MC, videos at 8 MC, and Build projects vary by complexity. Your balance is shown in Settings → Billing." },
      { q: "How do I sign in?", a: "Go to /auth and sign in with email or Google. Forgot your password? Use the recovery link on the login screen." },
      { q: "Free vs paid plans", a: "Free includes a starter credit allowance. Paid plans (Starter, Pro, Elite, Enterprise) add monthly MC, faster models, and team features. Compare at /pricing." },
    ],
  },
  {
    title: "Chat",
    items: [
      { q: "How do I start a chat?", a: "Open /chat and type your prompt. You can attach files, enable web search, switch models, and pick agents from the composer." },
      { q: "Can Megsy remember things about me?", a: "Yes — important details are saved in Memory. Manage them from Settings → Memory." },
      { q: "How do I share a conversation?", a: "Open any chat → menu → Share. A read-only public link is created. You can revoke it anytime." },
      { q: "What is Deep Research?", a: "An agent that runs multi-source web research and returns a structured report with citations." },
      { q: "What is Slides mode?", a: "Generates a full editable presentation from a prompt. Export to PPTX from the slide deck view." },
    ],
  },
  {
    title: "Images & Video",
    items: [
      { q: "How do I generate an image?", a: "Open Media → Image Studio, pick a model, write your prompt, choose ratio and quality, then generate." },
      { q: "How do I generate a video?", a: "Open Media → Video Studio, pick a model, optionally upload a starting image, write your prompt, and generate." },
      { q: "What is Lip Sync?", a: "Upload a portrait video and an audio file, and Megsy syncs the mouth movements to the audio." },
      { q: "Can I edit a generated image?", a: "Yes — open the image and use the edit tools (inpaint, upscale, background remove). Each edit costs MC." },
      { q: "Where are my generations saved?", a: "Everything you generate lives in your Library, scoped to your account or active workspace." },
    ],
  },
  {
    title: "Build (websites & apps)",
    items: [
      { q: "How do I start a project?", a: "Open /build, describe what you want, and Megsy scaffolds a working project you can iterate on with chat." },
      { q: "Can I preview my project?", a: "Yes — every project has a live preview pane that updates as the AI edits files." },
      { q: "How do I publish a project?", a: "Open the project → Publish. You get a free megsy.app subdomain, or connect a custom domain from project Settings." },
      { q: "Can I connect a database?", a: "Yes — projects can use Lovable Cloud for auth, database, storage, and edge functions." },
    ],
  },
  {
    title: "Billing & Plans",
    items: [
      { q: "How do I buy credits?", a: "Settings → Billing → Buy credits. You can pay with card or supported local methods." },
      { q: "How do I upgrade my plan?", a: "Visit /pricing and choose a plan. Upgrades take effect immediately and unused credits roll over." },
      { q: "How do I cancel?", a: "Settings → Billing → Manage subscription → Cancel. You keep access until the end of the billing period." },
      { q: "Do you offer refunds?", a: "Yes within 14 days for unused credits. Contact our team from Help & Support → Write to a human." },
    ],
  },
  {
    title: "Settings & Privacy",
    items: [
      { q: "Where do I change my email or password?", a: "Settings → Account → Change email / Change password." },
      { q: "How do I delete my account?", a: "Settings → Account → Delete account. This is irreversible and wipes all personal data within 30 days." },
      { q: "Is my data used for training?", a: "No. Your prompts and outputs are never used to train models." },
      { q: "How do I enable two-factor auth?", a: "Settings → Account → Security → Enable 2FA. Use any TOTP app like 1Password or Authy." },
    ],
  },
  {
    title: "Troubleshooting",
    items: [
      { q: "A generation failed — am I charged?", a: "No. Failed generations are automatically refunded within a few minutes." },
      { q: "The app feels slow", a: "Check status.megsyai.com for incidents. Try a hard refresh, then sign out and back in." },
      { q: "I can't sign in", a: "Use the password reset link, check for typos in your email, and make sure cookies aren't blocked." },
      { q: "Where do I report a bug?", a: "Help & Support → Write to a human. Include screenshots and the URL where it happened." },
    ],
  },
];

export default function SettingsHelpPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections
      .map((s) => ({ ...s, items: s.items.filter((it) => (it.q + " " + it.a).toLowerCase().includes(q)) }))
      .filter((s) => s.items.length > 0);
  }, [query]);

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
        <header className="mb-6 px-2">
          <h1
            className="text-[32px] leading-tight font-semibold tracking-tight text-foreground"
            style={{ fontFamily: '"Space Grotesk", "Inter", system-ui, sans-serif' }}
          >
            Help Center
          </h1>
        </header>

        {/* Search */}
        <div className="mb-8 flex items-center gap-3 rounded-[18px] border border-border bg-card px-4 py-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted-foreground">
            <circle cx="11" cy="11" r="7" />
            <path strokeLinecap="round" d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles"
            className="flex-1 bg-transparent text-[14.5px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Sections */}
        {filtered.map((sec) => (
          <section key={sec.title} className="mb-8 flex flex-col gap-3">
            <h2
              className="px-2 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground"
              style={{ fontFamily: '"Space Grotesk", "Inter", system-ui, sans-serif' }}
            >
              {sec.title}
            </h2>
            <div className="overflow-hidden rounded-[24px] border border-border bg-background/40">
              {sec.items.map((it, i) => {
                const key = `${sec.title}-${i}`;
                const open = openKey === key;
                return (
                  <div
                    key={key}
                    className={`${i > 0 ? "border-t border-border" : ""}`}
                  >
                    <button
                      onClick={() => setOpenKey(open ? null : key)}
                      className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-background/60 active:scale-[0.99]"
                    >
                      <span className="text-[14.5px] font-medium text-foreground">{it.q}</span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                        strokeWidth={2}
                      />
                    </button>
                    <div
                      className="grid transition-[grid-template-rows] duration-300 ease-out"
                      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
                    >
                      <div className="overflow-hidden">
                        <p className="px-5 pb-4 text-[13.5px] leading-[1.6] text-muted-foreground">{it.a}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {filtered.length === 0 && (
          <div className="rounded-[24px] border border-border bg-background/40 p-8 text-center">
            <p className="text-[15px] font-semibold text-foreground">No matches</p>
            <span className="mt-1 block text-[13px] text-muted-foreground">Try a different keyword.</span>
          </div>
        )}
      </div>
    </div>
  );
}
