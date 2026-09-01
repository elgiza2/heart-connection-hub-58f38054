import { useEffect, useMemo, useRef, useState } from "react";

/**
 * AgentStoryStage — slide 1 of the onboarding showcase.
 *
 * Tells the whole Megsy story as one short looping animation instead of a
 * wall of text:
 *   1. a cute little robot walks over to the prompt box
 *   2. it types the user's request
 *   3. the request splits into clean task cards (Figma-ish)
 *   4. the tasks execute and the result is typed out live
 *
 * Everything is CSS + a tiny state machine, so it stays cheap on mobile.
 */

const PROMPT =
  "Build my website, publish it, connect Stripe, launch a Facebook ad and reply to customers.";

const TASKS = [
  { label: "Build & publish the site", meta: "live url" },
  { label: "Connect Stripe payments", meta: "checkout" },
  { label: "Launch a Facebook ad", meta: "creative" },
  { label: "Reply to customers", meta: "inbox" },
];

const OUTPUT = [
  "› opened the cloud computer",
  "› site deployed → megsy.shop",
  "› Stripe connected · first payment ready",
  "› ad live · 3 replies sent",
  "✓ all done — nothing left for you",
];

const CSS = `
@keyframes asWalk {
  0%   { transform: translateX(-8px); }
  100% { transform: translateX(0); }
}
@keyframes asBob {
  0%,100% { transform: translateY(0) rotate(-1deg); }
  50%     { transform: translateY(-3px) rotate(1deg); }
}
@keyframes asBlink {
  0%,92%,100% { transform: scaleY(1); }
  96%         { transform: scaleY(0.1); }
}
@keyframes asCaret { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
@keyframes asPop {
  from { opacity: 0; transform: translateY(8px) scale(.96); }
  to   { opacity: 1; transform: none; }
}
@keyframes asLine {
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
}
@keyframes asSweep {
  from { transform: translateX(-100%); }
  to   { transform: translateX(240%); }
}
.as-robot { animation: asBob 2.4s ease-in-out infinite; }
.as-robot-in { animation: asWalk .5s cubic-bezier(0.22,1,0.36,1) both; }
.as-eye { animation: asBlink 4s ease-in-out infinite; transform-origin: center; }
.as-caret { animation: asCaret 1s steps(1) infinite; }
.as-pop { animation: asPop .38s cubic-bezier(0.22,1,0.36,1) both; }
.as-connector { transform-origin: left center; animation: asLine .4s cubic-bezier(0.22,1,0.36,1) both; }
.as-sweep {
  position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent);
  animation: asSweep 1.8s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .as-robot, .as-robot-in, .as-eye, .as-caret, .as-pop, .as-connector, .as-sweep {
    animation: none !important; opacity: 1 !important; transform: none !important;
  }
}
`;

/** Cute pastel robot with a little bow — the "Megsy" mascot. */
function Robot({ thinking }: { thinking: boolean }) {
  return (
    <span className="as-robot-in" style={{ flexShrink: 0, lineHeight: 0 }}>
      <span className="as-robot" style={{ display: "block" }}>
        <svg width="42" height="42" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          {/* antenna */}
          <line x1="24" y1="9" x2="24" y2="14" stroke="rgba(255,255,255,0.5)" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="24" cy="7.5" r="2.4" fill={thinking ? "#ffd6e7" : "#8ff0bb"} />
          {/* head */}
          <rect
            x="8" y="14" width="32" height="24" rx="11"
            fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.4)" strokeWidth="1.4"
          />
          {/* eyes */}
          <g className="as-eye">
            <circle cx="18.5" cy="25.5" r="2.7" fill="#fff" />
            <circle cx="29.5" cy="25.5" r="2.7" fill="#fff" />
          </g>
          {/* cheeks + smile */}
          <circle cx="14" cy="30" r="2" fill="rgba(255,170,200,0.55)" />
          <circle cx="34" cy="30" r="2" fill="rgba(255,170,200,0.55)" />
          <path d="M21 31.5c1.6 1.6 4.4 1.6 6 0" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" strokeLinecap="round" />
          {/* bow */}
          <path d="M34 15.5l4.5-2.6v5.2L34 15.5z" fill="#ffb6d0" />
          <path d="M34 15.5l-4.2-2.6v5.2L34 15.5z" fill="#ff9dc0" />
          <circle cx="34" cy="15.5" r="1.5" fill="#fff" />
        </svg>
      </span>
    </span>
  );
}

export default function AgentStoryStage() {
  // 0 typing → 1 splitting into tasks → 2 executing → loop
  const [phase, setPhase] = useState(0);
  const [typed, setTyped] = useState(0);
  const [taskCount, setTaskCount] = useState(0);
  const [outLines, setOutLines] = useState(0);
  const [loop, setLoop] = useState(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const t = (fn: () => void, ms: number) => {
      timers.current.push(window.setTimeout(fn, ms));
    };
    // reset
    setPhase(0);
    setTyped(0);
    setTaskCount(0);
    setOutLines(0);

    // 1. type the prompt
    const typeSpeed = 26;
    for (let i = 1; i <= PROMPT.length; i++) t(() => setTyped(i), 260 + i * typeSpeed);
    const typedDone = 260 + PROMPT.length * typeSpeed;

    // 2. split into tasks
    t(() => setPhase(1), typedDone + 420);
    TASKS.forEach((_, i) => t(() => setTaskCount(i + 1), typedDone + 640 + i * 260));
    const tasksDone = typedDone + 640 + TASKS.length * 260;

    // 3. execute + stream output
    t(() => setPhase(2), tasksDone + 260);
    OUTPUT.forEach((_, i) => t(() => setOutLines(i + 1), tasksDone + 480 + i * 620));
    const outDone = tasksDone + 480 + OUTPUT.length * 620;

    // 4. loop
    t(() => setLoop((v) => v + 1), outDone + 1900);

    const list = timers.current;
    return () => {
      list.forEach(clearTimeout);
      timers.current = [];
    };
  }, [loop]);

  const promptText = useMemo(() => PROMPT.slice(0, typed), [typed]);
  const doneTasks = phase === 2 ? Math.min(TASKS.length, outLines) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <style>{CSS}</style>

      {/* ── prompt box: robot walks in and types ─────────────────────────── */}
      <div className="fs-up fs-solid" style={{ animationDelay: "0.1s", borderRadius: 24, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Robot thinking={phase > 0} />
          <div
            style={{
              flex: 1,
              minWidth: 0,
              borderRadius: 14,
              padding: "11px 13px",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.16)",
              minHeight: 44,
              display: "flex",
              alignItems: "center",
            }}
          >
            <p
              style={{
                color: "#fff",
                fontSize: 13,
                lineHeight: 1.35,
                margin: 0,
                wordBreak: "break-word",
              }}
            >
              {promptText || <span style={{ color: "rgba(255,255,255,0.35)" }}>Ask Megsy anything…</span>}
              {phase === 0 && (
                <span
                  className="as-caret"
                  style={{
                    display: "inline-block",
                    width: 2,
                    height: 13,
                    marginLeft: 2,
                    verticalAlign: "-2px",
                    background: "#fff",
                  }}
                />
              )}
            </p>
          </div>
        </div>
      </div>

      {/* ── tasks: the request splits into a clean plan ──────────────────── */}
      <div
        className="fs-up fs-solid"
        style={{ animationDelay: "0.2s", borderRadius: 24, padding: "12px 14px" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ color: "rgba(255,255,255,0.72)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" }}>
            {phase === 0 ? "Waiting" : phase === 1 ? "Splitting into tasks" : "Running on its own computer"}
          </span>
          {phase === 2 && (
            <span style={{ color: "#8ff0bb", fontSize: 11, fontWeight: 600 }}>
              {doneTasks}/{TASKS.length}
            </span>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10, minHeight: 152 }}>
          {TASKS.map((task, i) => {
            const shown = i < taskCount;
            const done = i < doneTasks;
            const active = phase === 2 && i === doneTasks;
            if (!shown) {
              return <div key={task.label} style={{ height: 32 }} />;
            }
            return (
              <div
                key={task.label}
                className="as-pop"
                style={{
                  position: "relative",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  height: 32,
                  padding: "0 11px",
                  borderRadius: 12,
                  background: active ? "rgba(255,255,255,0.13)" : "rgba(255,255,255,0.06)",
                  border: `1px solid ${done ? "rgba(110,231,160,0.4)" : "rgba(255,255,255,0.14)"}`,
                  transition: "background .3s ease, border-color .3s ease",
                }}
              >
                {active && <span className="as-sweep" />}
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 999,
                    flexShrink: 0,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 9,
                    color: "#08281a",
                    background: done ? "#6ee7a0" : "transparent",
                    border: done ? "none" : "1.4px solid rgba(255,255,255,0.4)",
                  }}
                >
                  {done ? "✓" : ""}
                </span>
                <span
                  style={{
                    color: done ? "rgba(255,255,255,0.75)" : "#fff",
                    fontSize: 12.5,
                    fontWeight: 550,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {task.label}
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 10.5,
                    color: "rgba(255,255,255,0.45)",
                    flexShrink: 0,
                  }}
                >
                  {task.meta}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── live output: text typed in front of the user ─────────────────── */}
      <div
        className="fs-up fs-solid"
        style={{ animationDelay: "0.3s", borderRadius: 24, padding: "12px 14px", minHeight: 108 }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {OUTPUT.slice(0, outLines).map((line, i) => (
            <p
              key={line}
              className="as-pop"
              style={{
                margin: 0,
                fontSize: 12,
                lineHeight: 1.4,
                color: i === OUTPUT.length - 1 ? "#8ff0bb" : "rgba(255,255,255,0.72)",
                fontWeight: i === OUTPUT.length - 1 ? 600 : 450,
              }}
            >
              {line}
            </p>
          ))}
          {outLines === 0 && (
            <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
              Megsy writes the work in front of you.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
