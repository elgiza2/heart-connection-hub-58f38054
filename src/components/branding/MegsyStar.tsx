// Brand 8-point sparkle. Solid currentColor for Megsy.

type Props = { className?: string };

const PATH =
  "M12 1.5c.4 0 .76.28.87.69l1.55 5.93a3 3 0 0 0 2.1 2.1l5.94 1.55a.9.9 0 0 1 0 1.74l-5.93 1.55a3 3 0 0 0-2.1 2.1l-1.55 5.94a.9.9 0 0 1-1.74 0l-1.55-5.93a3 3 0 0 0-2.1-2.1L1.55 13.5a.9.9 0 0 1 0-1.74l5.93-1.55a3 3 0 0 0 2.1-2.1l1.55-5.94c.11-.4.46-.67.87-.67Z";

const MegsyStar = ({ className = "w-4 h-4" }: Props) => {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d={PATH} />
    </svg>
  );
};

export default MegsyStar;
