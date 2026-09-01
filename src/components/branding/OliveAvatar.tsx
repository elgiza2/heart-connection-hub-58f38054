// Olive / oil-gradient avatar fallback — abstract painterly blends.
// 50+ deterministic palette + angle combos; no text, just an oily sheen.
import { useMemo } from "react";

interface Props {
  seed?: string;
  className?: string;
  /** Kept for backwards compat; not rendered. */
  initial?: string;
}

// 12 olive/oil palettes × variable angles + sheen rotations = 50+ unique looks.
const OLIVE_PALETTES: string[][] = [
  ["#3a3a1f", "#6b6a2c", "#a8a04a", "#d4c97a"],
  ["#2c2e15", "#555a26", "#8e9341", "#c2c184"],
  ["#1f2410", "#4a5621", "#7d8b3a", "#b8bd6e"],
  ["#33321a", "#605d28", "#9a9143", "#cfc486"],
  ["#262814", "#4f5722", "#869046", "#bcc278"],
  ["#1a1c0e", "#3e4418", "#727a2f", "#a8ad5a"],
  ["#2d2a10", "#5c5320", "#928540", "#c4b878"],
  ["#1e2208", "#414a1a", "#788238", "#aeb46a"],
  ["#2a2c1c", "#525632", "#888c52", "#bcc080"],
  ["#171a08", "#3a4016", "#6c7530", "#9ea35c"],
  ["#3b3a23", "#6e6a35", "#a59b58", "#d8cf86"],
  ["#21240f", "#4d521e", "#828a3c", "#b4ba70"],
];

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export const OliveAvatar = ({ seed = "", className = "" }: Props) => {
  const { background, sheen } = useMemo(() => {
    const h = hash(seed || "default");
    const stops = OLIVE_PALETTES[h % OLIVE_PALETTES.length];
    const angle = (h * 7) % 360;
    const sheenX = 15 + (h % 70);
    const sheenY = 10 + ((h >> 3) % 70);
    const shadowX = 100 - sheenX;
    const shadowY = 100 - sheenY;
    const stopShift = (h >> 5) % 15;
    return {
      background: `linear-gradient(${angle}deg, ${stops[0]} 0%, ${stops[1]} ${30 + stopShift}%, ${stops[2]} ${65 + stopShift}%, ${stops[3]} 100%)`,
      sheen: `radial-gradient(ellipse at ${sheenX}% ${sheenY}%, rgba(255,255,255,0.32), transparent 55%), radial-gradient(ellipse at ${shadowX}% ${shadowY}%, rgba(0,0,0,0.30), transparent 60%)`,
    };
  }, [seed]);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background }}
      aria-hidden="true"
    >
      <span
        className="absolute inset-0 pointer-events-none"
        style={{ background: sheen, mixBlendMode: "overlay" }}
      />
    </div>
  );
};

export default OliveAvatar;
