// Custom Megsy nav icons — clean minimal geometric marks
// Each renders inline SVG, currentColor, props-controlled size & stroke.

type Props = { size?: number; className?: string; strokeWidth?: number };

export const ChatIcon = ({ size = 20, className, strokeWidth = 1.6 }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
  >
    {/* Soft squircle bubble with single tail */}
    <path
      d="M5 11a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v0a6 6 0 0 1-6 6H9.5L6.4 19.3a.5.5 0 0 1-.85-.36V16.6A6 6 0 0 1 5 11Z"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
  </svg>
);

export const MediaIcon = ({ size = 20, className, strokeWidth = 1.6 }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
  >
    {/* Stacked frames — gallery */}
    <rect
      x="7"
      y="3.5"
      width="13.5"
      height="13.5"
      rx="3"
      stroke="currentColor"
      strokeWidth={strokeWidth}
    />
    <path
      d="M16.5 17v.5a3 3 0 0 1-3 3H6a2.5 2.5 0 0 1-2.5-2.5V11a3 3 0 0 1 3-3H7"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
    />
    <circle cx="12" cy="8.5" r="1.3" stroke="currentColor" strokeWidth={strokeWidth} />
    <path
      d="m8 15 3.2-3.2a1 1 0 0 1 1.4 0L19 18"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const CodeIcon = ({ size = 20, className, strokeWidth = 1.6 }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
  >
    {/* Terminal window with chevron */}
    <rect
      x="3"
      y="4.5"
      width="18"
      height="15"
      rx="3"
      stroke="currentColor"
      strokeWidth={strokeWidth}
    />
    <path
      d="M7.5 10.5 10 13l-2.5 2.5M12 15.5h4.5"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const CornIcon = ({ size = 20, className, strokeWidth = 1.6 }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
  >
    {/* Four-point compass star */}
    <path
      d="M12 3v18M3 12h18M6 6l12 12M18 6 6 18"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      opacity="0.35"
    />
    <path
      d="M12 5.5 14 12l-2 6.5L10 12l2-6.5ZM5.5 12 12 10l6.5 2-6.5 2-6.5-2Z"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

export const EarnIcon = ({ size = 20, className, strokeWidth = 1.6 }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
  >
    {/* Gift / reward box */}
    <path
      d="M3.5 9.5h17v3.5a4 4 0 0 1-4 4h-9a4 4 0 0 1-4-4V9.5Z"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
    <path
      d="M12 9.5V17M9 9.5c-1.4 0-2.5-1-2.5-2.25S7.6 5 9 5c1.6 0 3 2 3 4.5C12 7 13.4 5 15 5c1.4 0 2.5 1 2.5 2.25S16.4 9.5 15 9.5"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  </svg>
);

export const HomeIcon = ({ size = 20, className, strokeWidth = 1.6 }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
  >
    {/* Soft squircle home with doorway — cleaner, more modern silhouette */}
    <path
      d="M3.8 10.9c0-.7.3-1.4.9-1.8l6-4.6a2.1 2.1 0 0 1 2.6 0l6 4.6c.6.4.9 1.1.9 1.8v6.4c0 1.3-1 2.3-2.3 2.3H6.1a2.3 2.3 0 0 1-2.3-2.3v-6.4Z"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
    <path
      d="M9.7 19.6v-3.9a2.3 2.3 0 0 1 4.6 0v3.9"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  </svg>
);
