/** @doc SplashTestPage — internal harness for previewing the splash animation. */
/**
 * SplashTestPage — prototype of the native Android splash (~2.6s).
 *
 * Beats (matching the reference video):
 *  0.00s  clean theme-colored screen (black in dark, white in light), logo centered
 *  0.70s  logo scales down and slides left while the "megsy" wordmark types out beside it
 *  1.70s  the whole lockup scales up and the screen floods with the brand purple
 *  2.40s  hold, then the app opens
 *
 * Route: /test (design preview only).
 */
import { useCallback, useEffect, useState } from "react";

const DURATION = 2600;

export default function SplashTestPage() {
  const [runId, setRunId] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDone(false);
    const t = setTimeout(() => setDone(true), DURATION + 150);
    return () => clearTimeout(t);
  }, [runId]);

  const replay = useCallback(() => setRunId((n) => n + 1), []);

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-background">
      <style>{`
        .ms-splash { --e: cubic-bezier(.16,1,.3,1); }

        /* brand color floods in at the end */
        @keyframes ms-flood {
          0%, 62%  { opacity: 0; transform: scale(.2); }
          78%      { opacity: 1; transform: scale(1.6); }
          100%     { opacity: 1; transform: scale(1.6); }
        }
        /* logo alone -> shrinks into the lockup -> whole lockup grows */
        @keyframes ms-lockup {
          0%   { transform: scale(1.9) translateX(0); opacity: 0; }
          10%  { transform: scale(1.75) translateX(0); opacity: 1; }
          26%  { transform: scale(1.7) translateX(0); opacity: 1; }
          46%  { transform: scale(1) translateX(0); opacity: 1; }
          64%  { transform: scale(1) translateX(0); opacity: 1; }
          82%  { transform: scale(1.24) translateX(0); opacity: 1; }
          100% { transform: scale(1.24) translateX(0); opacity: 1; }
        }
        /* the word takes its space only after the logo has shrunk */
        @keyframes ms-word-space {
          0%, 30%  { max-width: 0; opacity: 0; }
          52%      { max-width: 60vmin; opacity: 1; }
          100%     { max-width: 60vmin; opacity: 1; }
        }
        @keyframes ms-word-wipe {
          0%, 30%  { clip-path: inset(0 100% 0 0); }
          56%      { clip-path: inset(0 0% 0 0); }
          100%     { clip-path: inset(0 0% 0 0); }
        }
        /* ink flips to white once the purple has covered the screen */
        @keyframes ms-ink {
          0%, 68%  { color: var(--ms-ink); }
          78%      { color: #ffffff; }
          100%     { color: #ffffff; }
        }
        @keyframes ms-fill {
          0%, 68%  { fill: var(--ms-ink); }
          78%      { fill: #ffffff; }
          100%     { fill: #ffffff; }
        }
        .ms-word-text { -webkit-text-fill-color: currentColor !important; }
        @media (prefers-reduced-motion: reduce) {
          .ms-splash *, .ms-splash { animation-duration: .01ms !important; animation-delay: 0ms !important; }
        }
      `}</style>

      <div
        key={runId}
        className="ms-splash absolute inset-0 grid place-items-center"
        style={{ ["--ms-ink" as string]: "hsl(var(--foreground))" }}
      >
        {/* brand purple flood */}
        <div
          className="pointer-events-none absolute aspect-square w-[140vmax] rounded-full"
          style={{
            background:
              "radial-gradient(circle at 50% 45%, #E56BFF 0%, #C527ED 45%, #8A11AF 100%)",
            opacity: 0,
            animation: `ms-flood ${DURATION}ms var(--e) forwards`,
          }}
        />

        {/* lockup: mark + wordmark */}
        <div
          className="absolute flex items-center"
          style={{ animation: `ms-lockup ${DURATION}ms var(--e) forwards` }}
        >
          <svg
            viewBox="0 0 512 512"
            className="h-[14vmin] w-[14vmin] shrink-0"
            aria-hidden="true"
          >
            <g style={{ animation: `ms-fill ${DURATION}ms linear forwards` }}>
              <rect x="110" y="86" width="140" height="272" rx="34" />
              <rect x="266" y="146" width="140" height="288" rx="34" />
            </g>
          </svg>

          <div
            className="overflow-hidden"
            style={{
              maxWidth: 0,
              animation: `ms-word-space ${DURATION}ms var(--e) forwards`,
            }}
          >
            <span
              className="ms-word-text block select-none whitespace-nowrap px-[2.2vmin] pr-[0.6vmin]"
              style={{
                fontFamily: '"Space Grotesk", "Sora", system-ui, sans-serif',
                fontWeight: 700,
                fontSize: "10.5vmin",
                lineHeight: 1.35,
                letterSpacing: "-0.04em",
                animation: `ms-word-wipe ${DURATION}ms var(--e) forwards, ms-ink ${DURATION}ms linear forwards`,
              }}
            >
              Megsy
            </span>


          </div>
        </div>
      </div>

      {/* preview controls (test page only) */}
      <div className="absolute inset-x-0 bottom-6 z-10 flex flex-col items-center gap-2">
        <button
          onClick={replay}
          className="rounded-full bg-background/85 px-5 py-2 text-sm font-medium text-foreground shadow-lg backdrop-blur transition hover:opacity-90"
        >
          إعادة التشغيل
        </button>
        <span className="text-xs text-muted-foreground">
          {done ? "انتهى — التطبيق يفتح فورًا" : "جارٍ التشغيل…"} · 2.6s
        </span>
      </div>
    </div>
  );
}
