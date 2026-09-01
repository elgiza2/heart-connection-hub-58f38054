/** @doc Upgrade-required card shown in chat when a free user requests a premium feature (images, video, code). */
import { Sparkles, Lock, Check, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { translateExactText, useUserLang } from "@/lib/authI18n";

type Feature = "images" | "video" | "code";

const COPY: Record<Feature, { title: string; sub: string; perks: string[] }> = {
  images: {
    title: "Image generation is a Premium feature",
    sub: "Create stunning AI images with the best models — unlocked on any paid plan.",
    perks: ["Unlimited image generations", "All premium image models", "HD exports"],
  },
  video: {
    title: "Video generation is a Premium feature",
    sub: "Generate cinematic AI videos in seconds — included with every paid plan.",
    perks: ["Veo, Kling, Sora & more", "Up to 4K rendering", "No watermarks"],
  },
  code: {
    title: "Code & website builds are Premium",
    sub: "Ship full websites, apps and code projects with Megsy — paid plans only.",
    perks: ["Unlimited builds", "Live preview & deploy", "Pro models for code"],
  },
};

export default function UpgradeRequiredCard({ feature }: { feature: Feature }) {
  const navigate = useNavigate();
  const lang = useUserLang();
  const tx = (text: string) => translateExactText(text, lang);
  const copy = COPY[feature];

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-background to-background p-5 shadow-[0_10px_40px_-12px_hsl(var(--primary)/0.35)]">
      {/* Glow accent */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl"
        style={{ background: "hsl(var(--primary) / 0.25)" }}
      />

      <div className="relative flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 ring-1 ring-primary/30">
          <Lock className="h-5 w-5 text-primary" strokeWidth={2.4} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-tight text-foreground">{tx(copy.title)}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{tx(copy.sub)}</p>
        </div>
      </div>

      <ul className="relative mt-4 space-y-1.5">
        {copy.perks.map((p) => (
          <li key={p} className="flex items-center gap-2 text-[13px] text-foreground/85">
            <Check className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={3} />
            <span>{tx(p)}</span>
          </li>
        ))}
      </ul>

      <div className="relative mt-5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate("/pricing")}
          className="btn-sunset group inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl px-4 text-[14px] font-semibold transition active:scale-[0.98]"
        >
          <Sparkles className="h-4 w-4" strokeWidth={2.4} />
          <span>{tx("Upgrade now")}</span>
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            strokeWidth={2.4}
          />
        </button>
        <button
          type="button"
          onClick={() => navigate("/pricing")}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-background px-4 text-[13px] font-medium text-foreground transition hover:bg-muted"
        >
          {tx("See plans")}
        </button>
      </div>
    </div>
  );
}
