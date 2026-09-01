/**
 * MediaGenerationSkeleton — the placeholder shown while an image / video is
 * being generated.
 *
 * Design goals (rewritten):
 *  - Reserve the exact frame the finished media will occupy (square for
 *    images, 9:16 for video) so the transcript never jumps when it lands.
 *  - Calm, premium surface: soft tinted gradient, a single diagonal sheen
 *    sweeping across, the Megsy star breathing in the centre.
 *  - One quiet caption line, no counters, no borders, no progress theatre.
 *
 * Motion is skipped on low-end devices and when the user prefers reduced
 * motion — the static frame still reserves the correct space.
 */

import MegsyStar from "@/components/branding/MegsyStar";
import { isLowEndDevice } from "@/lib/deviceCapability";
import { useUserLang } from "@/lib/authI18n";

type Kind = "images" | "video";

interface MediaGenerationSkeletonProps {
  kind: Kind;
  /** Kept for call-site compatibility. */
  count?: number;
  className?: string;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function MediaGenerationSkeleton({
  kind,
  className = "",
}: MediaGenerationSkeletonProps) {
  const lang = useUserLang();
  const isAr = lang.startsWith("ar");
  const still = isLowEndDevice() || prefersReducedMotion();

  const label =
    kind === "video"
      ? isAr
        ? "بنجهّز الفيديو"
        : "Creating your video"
      : isAr
        ? "بنرسم الصورة"
        : "Creating your image";

  const aspect = kind === "video" ? "aspect-[9/16]" : "aspect-square";
  const width = kind === "video" ? "max-w-[220px]" : "max-w-[320px]";

  return (
    <div
      className={`mb-3 w-full ${width} ${className}`}
      role="status"
      aria-live="polite"
      aria-label={label}
      dir={isAr ? "rtl" : undefined}
    >
      <div
        className={`relative w-full overflow-hidden rounded-3xl ${aspect} bg-gradient-to-br from-foreground/[0.07] via-foreground/[0.03] to-foreground/[0.06]`}
      >
        {/* Diagonal sheen sweep */}
        {!still && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 rotate-12 bg-gradient-to-r from-transparent via-foreground/[0.10] to-transparent animate-[media-sheen_2.2s_ease-in-out_infinite]"
          />
        )}

        {/* Centre mark */}
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-background/50 backdrop-blur-sm">
              <MegsyStar
                className={`h-5 w-5 text-[var(--megsy-blue)] ${
                  still ? "" : "motion-safe:animate-[media-breathe_1.8s_ease-in-out_infinite]"
                }`}
              />
            </span>
            <span className="px-4 text-center text-[12.5px] font-medium text-muted-foreground">
              {label}
            </span>
          </div>
        </div>
      </div>

      {!still && (
        <style>{`
          @keyframes media-sheen {
            0%   { transform: translateX(0) rotate(12deg); opacity: 0; }
            20%  { opacity: 1; }
            80%  { opacity: 1; }
            100% { transform: translateX(320%) rotate(12deg); opacity: 0; }
          }
          @keyframes media-breathe {
            0%, 100% { transform: scale(1); opacity: 0.75; }
            50%      { transform: scale(1.14); opacity: 1; }
          }
        `}</style>
      )}
    </div>
  );
}

export default MediaGenerationSkeleton;
