/**
 * FeatureShowcase — five full-screen onboarding panels that explain what Megsy
 * does. Full-bleed (no phone mockup): the device itself is the frame.
 * Horizontal scroll-snap pager with dots. Pure presentation.
 */
import { useEffect, useRef, useState } from "react";
import { Timer, ChevronRight, ChevronLeft, Check, Computer, FolderKanban, Hourglass } from "lucide-react";
import { BrandIcon, hasBrandIcon } from "@/components/chat/media/BrandIcon";
import { RatingBadge } from "@/components/foundations/rating-badge";
import ServicesStage from "./ServicesStage";
import AgentStoryStage from "./AgentStoryStage";
import { getPlan, PLAN_MONTHLY_CREDITS } from "@/data/pricingData";
import {
  getPayRegionOrGuess,
  setPayRegion,
  type PayRegion,
} from "@/lib/payRegion";
import { setUserLang } from "@/lib/authI18n";
import {
  MODEL_ROWS,
  type OnboardingModel,
} from "./allModels";


const BG =
  "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260704_143500_a76b8e64-2c69-4683-80e7-2bb060a921d6.png&w=1280&q=85";

/** One ambient background clip, shared by every onboarding page. */
const PAGE_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260302_085844_21a8f4b3-dea5-4ede-be16-d53f6973bb14.mp4";



const CSS = `
@keyframes fsFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fsFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes fsGlow { 0%, 100% { opacity: 0.35; transform: scale(1); } 50% { opacity: 0.6; transform: scale(1.05); } }
@keyframes fsShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
@keyframes fsProgress { 0% { width: 8%; } 55% { width: 68%; } 80% { width: 82%; } 100% { width: 8%; } }
@keyframes fsPulse { 0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(110,231,160,0.5); } 50% { opacity: 0.75; box-shadow: 0 0 0 6px rgba(110,231,160,0); } }
.fs-progress-bar { animation: fsProgress 7s ease-in-out infinite; }
.fs-live-dot { animation: fsPulse 1.8s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .fs-progress-bar, .fs-live-dot { animation: none; } .fs-progress-bar { width: 68%; } }
.fs-up { opacity: 0; animation: fsFadeUp .42s cubic-bezier(0.22,1,0.36,1) forwards; }
/* Only one continuous ambient loop is allowed on screen at a time (the marquee).
   Float / glow / shimmer are kept as static styles so the eye has one focal motion. */
.fs-float { animation: none; }
.fs-glow { opacity: 0.45; animation: none; }
.fs-shimmer { background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent); }
@media (prefers-reduced-motion: reduce) { .fs-float, .fs-glow, .fs-shimmer { animation: none; } }
.fs-pager { scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
.fs-pager::-webkit-scrollbar { display: none; }
.fs-page { scroll-snap-align: start; }
.fs-glass {
  position: relative;
  background: rgba(255,255,255,0.01);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  box-shadow: inset 0 1px 1px rgba(255,255,255,0.1);
}
.fs-glass::before {
  content: "";
  position: absolute; inset: 0;
  border-radius: inherit;
  padding: 1.4px;
  background: linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.15) 20%, rgba(255,255,255,0) 40%, rgba(255,255,255,0) 60%, rgba(255,255,255,0.15) 80%, rgba(255,255,255,0.45) 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  pointer-events: none;
}
/* Frosted glass surface used by the hero + pricing panels. Translucent, but
   with just enough tint + blur that text always stays readable. */
.fs-solid {
  position: relative;
  background: linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.07) 100%);
  backdrop-filter: blur(28px) saturate(170%) brightness(0.86);
  -webkit-backdrop-filter: blur(28px) saturate(170%) brightness(0.86);
  border: 1px solid rgba(255,255,255,0.22);
  box-shadow: 0 22px 50px -26px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.28);
}
.fs-divider { height: 1px; background: rgba(255,255,255,0.14); }
.fs-glass-selected {
  background: rgba(255,255,255,0.12);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: inset 0 1px 2px rgba(255,255,255,0.2);
}
.fs-glass-selected::before {
  background: linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.25) 20%, rgba(255,255,255,0) 40%, rgba(255,255,255,0) 60%, rgba(255,255,255,0.25) 80%, rgba(255,255,255,0.6) 100%);
}
.fs-marquee {
  overflow: hidden;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent);
  mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent);
}
@keyframes fsScroll { from { transform: translate3d(0,0,0); } to { transform: translate3d(-50%,0,0); } }
.fs-track { display: flex; width: max-content; gap: 10px; padding: 2px 12px; animation: fsScroll linear infinite; }
@media (prefers-reduced-motion: reduce) { .fs-track { animation: none; } }
.fs-chip {
  display: inline-flex; align-items: center; gap: 10px;
  border-radius: 999px; padding: 10px 16px 10px 10px; white-space: nowrap;
}
.fs-chip-icon {
  display: grid; place-items: center; width: 30px; height: 30px;
  border-radius: 999px; background: transparent; color: inherit;
}
.fs-chip-name { font-size: 14px; font-weight: 500; color: #fff; }
@keyframes fsBackIn { from { opacity: 0; transform: translateX(-10px) scale(.9); } to { opacity: 1; transform: translateX(0) scale(1); } }
.fs-back { animation: fsBackIn .35s cubic-bezier(0.22,1,0.36,1) both; }
@media (prefers-reduced-motion: reduce) { .fs-back { animation: none; } }
.fs-cta {
  position: relative;
  overflow: hidden;
  background: rgba(255,255,255,0.10);
  backdrop-filter: blur(18px) saturate(160%);
  color: #fff;
  -webkit-tap-highlight-color: transparent;
  transition: background .25s ease, transform .12s cubic-bezier(0.22,1,0.36,1), box-shadow .25s ease;
}
.fs-cta:hover { background: rgba(255,255,255,0.16); }
.fs-cta:active { transform: scale(0.965); background: rgba(255,255,255,0.2); }
.fs-cta:focus-visible { outline: 2px solid rgba(255,255,255,0.7); outline-offset: 3px; }
@keyframes fsRipple { from { opacity: .35; transform: scale(0); } to { opacity: 0; transform: scale(2.6); } }
.fs-ripple {
  position: absolute; border-radius: 999px; pointer-events: none;
  width: 140px; height: 140px; margin: -70px 0 0 -70px;
  background: radial-gradient(circle, rgba(255,255,255,0.85), rgba(255,255,255,0) 68%);
  animation: fsRipple .55s cubic-bezier(0.22,1,0.36,1) forwards;
}

/* page transitions */
@keyframes fsPageInNext { from { opacity: 0; transform: translate3d(28px,0,0) scale(.985); } to { opacity: 1; transform: none; } }
@keyframes fsPageInPrev { from { opacity: 0; transform: translate3d(-28px,0,0) scale(.985); } to { opacity: 1; transform: none; } }
.fs-slide-next { animation: fsPageInNext .42s cubic-bezier(0.22,1,0.36,1) both; }
.fs-slide-prev { animation: fsPageInPrev .42s cubic-bezier(0.22,1,0.36,1) both; }
@keyframes fsLabelIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.fs-label { display: inline-block; animation: fsLabelIn .28s ease-out both; }
/* 6px dots need a 44px hit area to satisfy WCAG 2.5.8 without changing the
   visual size, so the padding is transparent and the dot stays centred. */
.fs-dot { border: 0; padding: 19px 8px; margin: -19px -8px; min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; background: transparent; }
.fs-dot span { display: block; height: 6px; border-radius: 999px; transition: width .3s cubic-bezier(0.22,1,0.36,1), background .3s ease, opacity .3s ease; }
.fs-bg { transition: transform 1.2s cubic-bezier(0.22,1,0.36,1), filter .8s ease; }
/* drag surface follows the finger, then settles back with a spring-ish ease */
.fs-drag { will-change: transform; }
.fs-drag-settle { transition: transform .34s cubic-bezier(0.22,1,0.36,1); }
@media (prefers-reduced-motion: reduce) {
  .fs-up, .fs-slide-next, .fs-slide-prev, .fs-label { animation: none !important; opacity: 1 !important; transform: none !important; }
  .fs-bg, .fs-drag-settle { transition: none; }
  .fs-ripple { display: none; }
}
`;



const FONT = '"Helvetica Neue", Helvetica, Arial, system-ui, sans-serif';

/* ------------------------------- primitives ------------------------------ */

function Badge({ label }: { label: string }) {
  return (
    <div
      className="fs-up fs-glass"
      style={{
        animationDelay: "0.06s",
        alignSelf: "flex-start",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        borderRadius: 999,
        padding: "9px 12px",
        marginBottom: 18,
      }}
    >
      <Timer size={12} color="rgba(255,255,255,0.8)" />
      <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.9)" }}>{label}</span>
    </div>
  );
}

function Title({ kicker, heading }: { kicker?: string; heading: string }) {
  return (
    <div className="fs-up" style={{ animationDelay: "0.14s", marginBottom: 18 }}>
      {kicker && (
        <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, marginBottom: 10 }}>{kicker}</p>
      )}
      <h2
        style={{
          color: "#fff",
          fontSize: 27,
          fontWeight: 400,
          lineHeight: 1.12,
          letterSpacing: "-0.03em",
        }}
      >
        {heading}
      </h2>
    </div>
  );
}

function OptionGrid({ items, preselected = [] }: { items: string[]; preselected?: number[] }) {
  const [sel, setSel] = useState<number[]>(preselected);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignContent: "start" }}>
      {items.map((label, i) => {
        const on = sel.includes(i);
        return (
          <button
            key={label}
            type="button"
            onClick={() => setSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]))}
            className={`fs-up fs-glass${on ? " fs-glass-selected" : ""}`}
            style={{
              animationDelay: `${0.16 + i * 0.05}s`,
              borderRadius: 32,
              minHeight: 104,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              alignItems: "flex-start",
              textAlign: "left",
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.5)" }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <span style={{ fontSize: 16, fontWeight: 500, color: "#fff" }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ModelChip({ model }: { model: OnboardingModel }) {
  const hasIcon = hasBrandIcon(model.name, model.provider);
  return (
    <span className="fs-glass fs-chip">
      <span className="fs-chip-icon">
        {hasIcon ? (
          <BrandIcon name={model.name} provider={model.provider} size={22} variant="color" />
        ) : (
          <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{model.name.charAt(0)}</span>
        )}
      </span>
      <span className="fs-chip-name">{model.name}</span>
    </span>
  );
}

function ModelRow({
  models,
  reverse = false,
  duration,
  delay,
}: {
  models: OnboardingModel[];
  reverse?: boolean;
  duration: number;
  delay: number;
}) {
  const loop = [...models, ...models];
  return (
    <div className="fs-up fs-marquee" style={{ animationDelay: `${delay}s` }}>
      <div
        className="fs-track"
        style={{
          animationDuration: `${duration}s`,
          animationDirection: reverse ? "reverse" : "normal",
        }}
      >
        {loop.map((m, i) => (
          <ModelChip key={`${m.name}-${i}`} model={m} />
        ))}
      </div>
    </div>
  );
}

function ModelMarquee() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "0 -24px" }}>
      {MODEL_ROWS.slice(0, -2).map((models, i) => (
        <ModelRow
          key={i}
          models={models}
          duration={45 + i * 5}
          delay={0.2 + i * 0.04}
          reverse={i % 2 === 1}
        />
      ))}
    </div>
  );
}

/** Steps the agent walks through inside its own computer. */
const AGENT_STEPS = [
  { label: "Opened a cloud browser", meta: "chrome · logged in" },
  { label: "Pulled 40 sources & 3 dashboards", meta: "read + compared" },
  { label: "Ran the numbers in a sheet", meta: "python · 1.2k rows" },
  { label: "Writing the final report", meta: "12 pages · with charts" },
];

/** Live agent card: Megsy working on its own computer for hours. */
function AgentWorkingCard() {
  const [step, setStep] = useState(1);
  const [mins, setMins] = useState(74);

  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s >= AGENT_STEPS.length ? 1 : s + 1)), 2200);
    const m = setInterval(() => setMins((v) => v + 1), 4000);
    return () => {
      clearInterval(t);
      clearInterval(m);
    };
  }, []);

  const hours = Math.floor(mins / 60);
  const elapsed = `${hours}h ${String(mins % 60).padStart(2, "0")}m running`;
  const pct = Math.round((step / AGENT_STEPS.length) * 100);

  return (
    <div
      className="fs-up fs-solid"
      style={{ animationDelay: "0.14s", borderRadius: 24, padding: 16 }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 10,
            display: "grid",
            placeItems: "center",
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.14)",
            flexShrink: 0,
          }}
        >
          <Computer size={16} color="#fff" strokeWidth={1.9} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ color: "#fff", fontSize: 14.5, fontWeight: 600, lineHeight: 1.2 }}>
            Megsy Agent
          </p>
          <p style={{ color: "rgba(255,255,255,0.62)", fontSize: 11.5, marginTop: 1 }}>
            working on its own computer
          </p>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            fontWeight: 600,
            color: "#8ff0bb",
            background: "rgba(110,231,160,0.12)",
            border: "1px solid rgba(110,231,160,0.28)",
            borderRadius: 999,
            padding: "4px 9px",
            flexShrink: 0,
          }}
        >
          <span
            className="fs-live-dot"
            style={{ width: 6, height: 6, borderRadius: 999, background: "#6ee7a0" }}
          />
          Live
        </span>
      </div>

      <div className="fs-divider" style={{ margin: "13px -16px 13px" }} />

      {/* steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {AGENT_STEPS.map((s, i) => {
          const done = i < step - 1;
          const active = i === step - 1;
          return (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  width: 16,
                  height: 16,
                  flexShrink: 0,
                  borderRadius: 999,
                  display: "grid",
                  placeItems: "center",
                  background: done ? "#6ee7a0" : "transparent",
                  border: done
                    ? "none"
                    : active
                      ? "1.5px solid rgba(255,255,255,0.8)"
                      : "1.5px solid rgba(255,255,255,0.22)",
                }}
              >
                {done && <Check size={10} color="#08281a" strokeWidth={3.4} />}
                {active && (
                  <span
                    className="fs-live-dot"
                    style={{ width: 6, height: 6, borderRadius: 999, background: "#fff" }}
                  />
                )}
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: active ? "#fff" : done ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.42)",
                  fontWeight: active ? 600 : 450,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {s.label}
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 10.5,
                  color: active ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.38)",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {active ? "running…" : s.meta}
              </span>
            </div>
          );
        })}
      </div>

      <div
        style={{
          height: 4,
          borderRadius: 999,
          background: "rgba(255,255,255,0.12)",
          overflow: "hidden",
          marginTop: 14,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            borderRadius: 999,
            background: "linear-gradient(90deg, rgba(255,255,255,0.5), #fff)",
            transition: "width .6s cubic-bezier(0.22,1,0.36,1)",
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 9,
        }}
      >
        <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 11.5 }}>{elapsed}</span>
        <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 11.5 }}>
          Close the app — it keeps going
        </span>
      </div>
    </div>
  );
}

/** First panel: Megsy is an agent with a computer that works for hours. */
function MegsyServicesStage() {
  const services: Array<{ icon: import("lucide-react").LucideIcon; title: string; meta: string }> = [
    {
      icon: Computer,
      title: "Megsy Computer",
      meta: "A real cloud desktop — browses, clicks, types and codes",
    },
    {
      icon: Hourglass,
      title: "Tasks that run for hours",
      meta: "Start it, walk away, get pinged when it's done",
    },
    {
      icon: FolderKanban,
      title: "Finished work, not chat",
      meta: "Reports, decks and sheets delivered as real files",
    },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <AgentWorkingCard />

      {/* One grouped card with dividers — calmer than three floating boxes */}
      <div
        className="fs-up fs-solid"
        style={{ animationDelay: "0.26s", borderRadius: 24, padding: "4px 16px" }}
      >
        {services.map((s, i) => (
          <div key={s.title}>
            {i > 0 && <div className="fs-divider" style={{ margin: "0 -16px" }} />}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0" }}>
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 12,
                  flexShrink: 0,
                  display: "grid",
                  placeItems: "center",
                  background: "rgba(255,255,255,0.10)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                <s.icon size={17} color="#fff" strokeWidth={1.9} />
              </span>
              <div style={{ minWidth: 0 }}>
                <p style={{ color: "#fff", fontSize: 14.5, fontWeight: 600, margin: 0, lineHeight: 1.25 }}>
                  {s.title}
                </p>
                <p
                  style={{
                    color: "rgba(255,255,255,0.62)",
                    fontSize: 12,
                    marginTop: 2,
                    lineHeight: 1.35,
                  }}
                >
                  {s.meta}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


function StatRows({ items }: { items: Array<{ value: string; label: string }> }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map((s, i) => (
        <div
          key={s.label}
          className="fs-up fs-glass"
          style={{
            animationDelay: `${0.16 + i * 0.05}s`,
            borderRadius: 28,
            padding: "18px 20px",
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{ color: "#fff", fontSize: 40, fontWeight: 600, letterSpacing: "-0.06em", lineHeight: 0.9 }}
          >
            <CountUp value={s.value} duration={1200 + i * 200} />
          </span>

          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

function ListRows({ rows }: { rows: Array<{ title: string; meta: string }> }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rows.map((r, i) => (
        <div
          key={r.title}
          className="fs-up fs-glass"
          style={{
            animationDelay: `${0.16 + i * 0.05}s`,
            borderRadius: 28,
            padding: "16px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                color: "#fff",
                fontSize: 16,
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {r.title}
            </p>
            <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginTop: 2 }}>{r.meta}</p>
          </div>
          <ChevronRight size={16} color="rgba(255,255,255,0.5)" />
        </div>
      ))}
    </div>
  );
}

function VoiceBlock({ label }: { label: string }) {
  return (
    <div
      className="fs-up"
      style={{
        animationDelay: "0.34s",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        marginTop: 28,
        position: "relative",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -22,
          width: 170,
          height: 120,
          background:
            "radial-gradient(ellipse at center, rgba(220,200,80,0.5) 0%, rgba(180,160,40,0.2) 40%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div className="fs-glass" style={{ width: 64, height: 64, borderRadius: 999, display: "grid", placeItems: "center" }}>
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
          {[
            [4, 9, 17],
            [9, 4, 22],
            [13, 1, 25],
            [17, 5, 21],
            [22, 10, 16],
          ].map(([x, y1, y2]) => (
            <line key={x} x1={x} y1={y1} x2={x} y2={y2} stroke="#fff" strokeWidth={2} strokeLinecap="round" />
          ))}
        </svg>
      </div>
      <span style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{label}</span>
    </div>
  );
}

/** Clean count-up animation for numeric values like "30M+", "150+", "4.9". */
function CountUp({ value, duration = 1400 }: { value: string; duration?: number }) {
  const match = value.match(/^([\d.]+)(.*)$/);
  const target = match ? parseFloat(match[1]) : 0;
  const suffix = match ? match[2] : "";
  const decimals = match && match[1].includes(".") ? match[1].split(".")[1].length : 0;
  const [display, setDisplay] = useState(target ? "0" : value);

  useEffect(() => {
    if (!match) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay((target * eased).toFixed(decimals));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>
      {display}
      {suffix}
    </span>
  );
}


/**
 * Pricing panel. All numbers come from the single pricing source of truth so
 * the onboarding offer can never drift from /pricing:
 *   Pro — $20/month · $7 first month · $160/year (= 8 months paid, 4 free).
 */
const PRO = getPlan("pro")!;
const PRO_MONTHLY = PRO.monthlyPrice;            // 20
const PRO_FIRST = PRO.firstMonthPrice ?? PRO_MONTHLY; // 7
const PRO_YEARLY = PRO.yearlyPrice;              // 160
const PRO_YEARLY_PER_MONTH = Math.round(PRO_YEARLY / 12); // 13
const PRO_YEARLY_SAVE = PRO_MONTHLY * 12 - PRO_YEARLY;    // 80
const PRO_FIRST_OFF = Math.round((1 - PRO_FIRST / PRO_MONTHLY) * 100); // 65

const PRICING_FEATURES = [
  { title: "Unlimited chat & images", meta: "Every flagship model, no daily caps" },
  { title: `${PLAN_MONTHLY_CREDITS.pro} MC every month`, meta: "Up to 40 premium videos" },
  { title: "Agents & Megsy Computer", meta: "Research, coder, slides, background tasks" },
];

function PricingCard() {
  return (
    <div
      className="fs-up fs-solid"
      style={{ borderRadius: 26, padding: 18, animationDelay: "0.16s" }}
    >
      {/* offer header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
          <span style={{ color: "#fff", fontSize: 44, fontWeight: 600, letterSpacing: "-0.045em", lineHeight: 1 }}>
            ${PRO_FIRST}
          </span>
          <span
            style={{
              color: "rgba(255,255,255,0.5)",
              fontSize: 17,
              fontWeight: 500,
              textDecoration: "line-through",
            }}
          >
            ${PRO_MONTHLY}
          </span>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: "#9df3c5",
            background: "rgba(110,231,160,0.14)",
            border: "1px solid rgba(110,231,160,0.32)",
            borderRadius: 999,
            padding: "5px 10px",
            whiteSpace: "nowrap",
          }}
        >
          SAVE {PRO_FIRST_OFF}%
        </span>
      </div>
      <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 12.5, marginTop: 6 }}>
        Your first month of Pro · renews at ${PRO_MONTHLY}/month · cancel anytime
      </p>

      <div className="fs-divider" style={{ margin: "14px -18px" }} />

      {/* what's included */}
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {PRICING_FEATURES.map((f) => (
          <div key={f.title} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span
              style={{
                width: 17,
                height: 17,
                marginTop: 1,
                flexShrink: 0,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                background: "rgba(130,240,180,0.95)",
              }}
            >
              <Check size={11} color="#08281a" strokeWidth={3.4} />
            </span>
            <div style={{ minWidth: 0 }}>
              <p style={{ color: "#fff", fontSize: 14, fontWeight: 600, lineHeight: 1.25 }}>{f.title}</p>
              <p style={{ color: "rgba(255,255,255,0.62)", fontSize: 11.5, marginTop: 1.5, lineHeight: 1.35 }}>
                {f.meta}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="fs-divider" style={{ margin: "14px -18px" }} />

      {/* yearly option — explicitly priced off the regular $20/month rate */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ color: "#fff", fontSize: 13.5, fontWeight: 600 }}>
            Or yearly · ${PRO_YEARLY} <span style={{ fontWeight: 400, color: "rgba(255,255,255,0.68)" }}>
              (≈ ${PRO_YEARLY_PER_MONTH}/mo)
            </span>
          </p>
          <p style={{ color: "rgba(255,255,255,0.62)", fontSize: 11.5, marginTop: 1.5 }}>
            Pay 8 months, get 12 — saves ${PRO_YEARLY_SAVE} vs ${PRO_MONTHLY}/month
          </p>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "rgba(255,255,255,0.85)",
            border: "1px solid rgba(255,255,255,0.24)",
            borderRadius: 999,
            padding: "5px 10px",
            whiteSpace: "nowrap",
          }}
        >
          Best value
        </span>
      </div>
    </div>
  );
}

/* --------------------------------- pages --------------------------------- */

/**
 * Page — one full-screen onboarding slide.
 * Content is measured and uniformly scaled down when it is taller than the
 * available space, so no slide can ever spill over the dots / CTA at the
 * bottom or get clipped at the top on small phones.
 */
function Page({ children }: { children: import("react").ReactNode }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;
    let raf = 0;
    const fit = () => {
      raf = 0;
      const avail = box.clientHeight;
      const natural = inner.scrollHeight;
      if (!avail || !natural) return;
      const next = Math.min(1, Math.max(0.8, (avail - 4) / natural));
      setScale((prev) => (Math.abs(prev - next) > 0.005 ? next : prev));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(fit);
    };
    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(inner);
    ro.observe(box);
    window.addEventListener("resize", schedule);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [children]);

  return (
    <section
      className="fs-page"
      style={{
        position: "relative",
        width: "100%",
        height: "100dvh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "40px 20px 128px",
      }}
    >
      <div
        ref={boxRef}
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div
          ref={innerRef}
          style={{
            transform: scale < 1 ? `scale(${scale})` : undefined,
            transformOrigin: "center center",
            willChange: scale < 1 ? "transform" : undefined,
          }}
        >
          {children}
        </div>
      </div>
    </section>
  );
}


const PAGES = [
  <Page key="chat">
    <Title heading="Tell Megsy once. It does the whole job." />
    <AgentStoryStage />
  </Page>,
  <Page key="services">
    <Title heading="One app, every AI workflow" />
    <ServicesStage />
  </Page>,
  <Page key="pricing">
    <Title heading="Everything unlocked for $7" />
    <PricingCard />
  </Page>,
  <Page key="community">
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
      <div className="fs-up" style={{ animationDelay: "0.08s", marginBottom: 28 }}>
        <RatingBadge rating={5} title="Loved by millions" subtitle="4.9 average rating" theme="light" />
      </div>

      <div
        className="fs-up"
        style={{
          animationDelay: "0.16s",
          color: "#fff",
          fontSize: 76,
          fontWeight: 600,
          letterSpacing: "-0.06em",
          lineHeight: 0.95,
        }}
      >
        <CountUp value="30M+" duration={1600} />
      </div>

      <h2
        className="fs-up"
        style={{
          animationDelay: "0.22s",
          color: "#fff",
          fontSize: 26,
          fontWeight: 400,
          letterSpacing: "-0.03em",
          lineHeight: 1.15,
          marginTop: 14,
          maxWidth: 300,
        }}
      >
        people are already using Megsy
      </h2>

      <p
        className="fs-up"
        style={{
          animationDelay: "0.27s",
          color: "rgba(255,255,255,0.65)",
          fontSize: 15,
          lineHeight: 1.5,
          marginTop: 12,
          maxWidth: 290,
        }}
      >
        Join them now and try Megsy for yourself — it only takes a few seconds.
      </p>

      <div
        className="fs-up"
        style={{
          animationDelay: "0.32s",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 8,
          marginTop: 26,
        }}
      >
        {["150+ countries", "1.2B messages", "60+ models"].map((t) => (
          <span
            key={t}
            className="fs-glass"
            style={{
              borderRadius: 999,
              padding: "9px 14px",
              fontSize: 13,
              color: "rgba(255,255,255,0.85)",
            }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  </Page>,


];

/**
 * CTA copy is intentionally escalating:
 * 1) frictionless start  2) commitment / loss aversion
 * 3) reactance + "you were warned"  4) final low-effort command
 */
const CTA_LABELS = [
  "Start now",
  "Yes — I want the best",
  "I've been warned, let me in",
  "Tap now to enter",
];


/* ---------------------------------- shell --------------------------------- */

export default function FeatureShowcase({ onFinish }: { onFinish?: () => void }) {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<"next" | "prev">("next");
  // Region (language + billing gateway) is detected automatically from the
  // visitor's browser language / country / timezone — no manual slide.
  const [region] = useState<PayRegion>(() => getPayRegionOrGuess());
  useEffect(() => {
    setPayRegion(region);
    void setUserLang(region === "arab" ? "ar-eg" : "en", { syncRemote: false });
  }, [region]);
  const pages = PAGES;
  const ctaLabels = CTA_LABELS;

  const last = index >= pages.length - 1;

  useEffect(() => {
    const el = document.createElement("style");
    el.textContent = CSS;
    document.head.appendChild(el);
    const prev = document.body.style.overflow;
    const prevBodyBg = document.body.style.backgroundColor;
    const prevHtmlBg = document.documentElement.style.backgroundColor;
    document.body.style.overflow = "hidden";
    // Keep the page canvas dark so no light strip shows through the safe area
    // or during overscroll on mobile.
    document.body.style.backgroundColor = "#0a0a0a";
    document.documentElement.style.backgroundColor = "#0a0a0a";
    return () => {
      el.remove();
      document.body.style.overflow = prev;
      document.body.style.backgroundColor = prevBodyBg;
      document.documentElement.style.backgroundColor = prevHtmlBg;
    };
  }, []);

  const goTo = (target: number) => {
    setIndex((i) => {
      const clamped = Math.max(0, Math.min(pages.length - 1, target));
      if (clamped === i) return i;
      setDir(clamped > i ? "next" : "prev");
      return clamped;
    });
  };

  const next = () => {
    if (last) {
      onFinish?.();
      return;
    }
    goTo(index + 1);
  };

  const back = () => goTo(index - 1);

  // keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, last]);

  // interactive swipe: the page follows the finger, with resistance at the edges
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const touch = useRef({ x: 0, y: 0, active: false, axis: "" as "" | "x" | "y" }).current;

  const onTouchStart = (e: import("react").TouchEvent) => {
    touch.x = e.touches[0].clientX;
    touch.y = e.touches[0].clientY;
    touch.active = true;
    touch.axis = "";
    setDragging(true);
  };
  const onTouchMove = (e: import("react").TouchEvent) => {
    if (!touch.active) return;
    const dx = e.touches[0].clientX - touch.x;
    const dy = e.touches[0].clientY - touch.y;
    if (!touch.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      touch.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (touch.axis !== "x") return;
    const atEdge = (dx > 0 && index === 0) || (dx < 0 && last);
    setDragX(atEdge ? dx * 0.25 : dx * 0.75);
  };
  const onTouchEnd = (e: import("react").TouchEvent) => {
    if (!touch.active) return;
    touch.active = false;
    setDragging(false);
    const dx = e.changedTouches[0].clientX - touch.x;
    setDragX(0);
    if (touch.axis !== "x" || Math.abs(dx) < 56) return;
    if (dx < 0) goTo(index + 1);
    else back();
  };

  // tactile CTA press: ripple from the touch point + a short haptic tick
  const [ripple, setRipple] = useState<{ id: number; x: number; y: number } | null>(null);
  const press = (e: import("react").MouseEvent<HTMLButtonElement>, run: () => void) => {
    const r = e.currentTarget.getBoundingClientRect();
    setRipple({ id: Date.now(), x: e.clientX - r.left, y: e.clientY - r.top });
    navigator.vibrate?.(8);
    run();
  };

  return (
    <div
      role="main"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        // Fixed + inset:0 so the panel covers the whole viewport (including the
        // safe-area strip at the top). Any ancestor padding used to leave a
        // light-coloured band above the hero on mobile.
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100dvh",
        minHeight: "100svh",
        overflow: "hidden",
        background: "#0a0a0a",
        fontFamily: FONT,
        touchAction: "pan-y",
        zIndex: 0,
      }}
    >
      {/* Screen-reader-only page heading: the slides only carry h2 headlines. */}
      <h1 className="sr-only">Megsy — Welcome</h1>
      <img
        src={BG}
        alt=""
        aria-hidden
        className="fs-bg"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "blur(12px)",
          transform: `scale(${1.1 + index * 0.035}) translate3d(${index * -8}px, 0, 0)`,
        }}
      />
      <video
        src={PAGE_VIDEO}
        poster={BG}
        aria-hidden
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "blur(8px)",
          transform: "scale(1.12)",
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "absolute", inset: 0, background: "rgba(138,154,170,0.3)" }} />


      <div
        className={dragging ? "fs-drag" : "fs-drag fs-drag-settle"}
        style={{
          position: "relative",
          height: "100%",
          transform: dragX ? `translate3d(${dragX}px,0,0)` : undefined,
        }}
      >
        <div
          key={index}
          className={dir === "next" ? "fs-slide-next" : "fs-slide-prev"}
          style={{ position: "relative", height: "100%" }}
        >
          {pages[index]}
        </div>
      </div>



      {/* dots */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 104,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 6,
          zIndex: 30,
        }}
      >
        {pages.map((_, i) => (
          <button
            key={i}
            type="button"
            className="fs-dot"
            aria-label={`Go to step ${i + 1}`}
            aria-current={i === index}
            onClick={() => goTo(i)}
          >
            <span
              style={{
                width: i === index ? 20 : 6,
                background: i === index ? "#fff" : "rgba(255,255,255,0.35)",
              }}
            />
          </button>
        ))}
      </div>

      {/* continue */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 40,
          padding: "16px 24px calc(24px + env(safe-area-inset-bottom))",
          background: "linear-gradient(180deg, rgba(10,10,10,0) 0%, rgba(10,10,10,0.85) 60%)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        {index > 0 && (
          <button
            type="button"
            aria-label="Back"
            onClick={(e) => press(e, back)}
            className="fs-glass fs-cta fs-back"
            style={{
              width: 56,
              height: 56,
              flex: "0 0 auto",
              borderRadius: 999,
              display: "grid",
              placeItems: "center",
            }}
          >
            <ChevronLeft size={22} strokeWidth={1.8} />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => press(e, next)}
          className="fs-glass fs-cta"
          style={{
            flex: 1,
            height: 56,
            borderRadius: 999,
            fontSize: 16,
            fontWeight: 600,
          }}
        >
          {ripple && (
            <span
              key={ripple.id}
              className="fs-ripple"
              aria-hidden
              onAnimationEnd={() => setRipple(null)}
              style={{ left: ripple.x, top: ripple.y }}
            />
          )}
          <span key={`label-${index}`} className="fs-label">
            {ctaLabels[index] || "Continue"}
          </span>
        </button>

      </div>

    </div>
  );
}
