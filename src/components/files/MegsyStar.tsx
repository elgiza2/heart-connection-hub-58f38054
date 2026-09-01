import { memo } from "react";
import { m as motion } from "framer-motion";

/**
 * Brand sparkle — 8-point star.
 * - Solid `currentColor` (text-primary by default), or outline-only mode.
 * Sized via the `size` prop (px). Pass `static` to render without animation.
 */
const STAR_PATH = "M50 5 L60 40 L95 50 L60 60 L50 95 L40 60 L5 50 L40 40 Z";

const MegsyStar = ({
  size = 16,
  static: isStatic = false,
  className = "text-primary",
  outline = false,
  strokeWidth = 6,
  style,
}: {
  size?: number;
  static?: boolean;
  className?: string;
  outline?: boolean;
  strokeWidth?: number;
  style?: React.CSSProperties;
}) => {
  const svgProps = {
    width: size,
    height: size,
    viewBox: "0 0 100 100",
    xmlns: "http://www.w3.org/2000/svg",
    className: `shrink-0 ${className}`,
    style,
  };

  const pathProps = outline
    ? {
        d: STAR_PATH,
        fill: "none",
        stroke: "currentColor",
        strokeWidth,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
      }
    : { d: STAR_PATH, fill: "currentColor" };

  if (isStatic) {
    return (
      <svg {...svgProps}>
        <path {...pathProps} />
      </svg>
    );
  }
  return (
    <motion.svg {...svgProps} animate={{ rotate: [0, 180, 360], scale: [1, 1.1, 1] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}>
      <path {...pathProps} />
    </motion.svg>
  );
};

export default memo(MegsyStar);
