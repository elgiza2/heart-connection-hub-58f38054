import { useState } from "react";

/**
 * Stable per-mount random greeting picks for the mobile chat landing.
 * Extracted from ChatPage so unrelated re-renders don't re-mount them.
 */
export function useMobileGreeting() {
  const [mobileGreeting] = useState(() => Math.floor(Math.random() * 8));
  const [mobileGreetingColor] = useState(() => Math.floor(Math.random() * 8));
  const [returningGreetingIdx] = useState(() => Math.floor(Math.random() * 4));

  return { mobileGreeting, mobileGreetingColor, returningGreetingIdx };
}
