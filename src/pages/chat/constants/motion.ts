/**
 * Shared iOS-flavored spring transition used across the Chat surface.
 * Lives in its own module so callers don't recreate the object on every
 * render — Framer Motion treats identity changes as new transitions.
 */
export const IOS_SPRING = {
  type: "spring" as const,
  damping: 22,
  stiffness: 350,
};
