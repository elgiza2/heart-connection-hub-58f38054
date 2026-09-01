/** @doc Tiny store holding the id of the computer run that is currently active,
 * so the composer can turn its send button into a stop button. */
import { useEffect, useState } from "react";

/** Placeholder id used while a computer turn is starting but has no run id yet. */
export const PENDING_COMPUTER_RUN = "__pending__";

let current: string | null = null;
const listeners = new Set<(v: string | null) => void>();

export function setActiveComputerRun(id: string | null) {
  if (current === id) return;
  current = id;
  listeners.forEach((l) => l(current));
}

export function clearActiveComputerRun(id: string) {
  if (current === id) setActiveComputerRun(null);
}

export function useActiveComputerRun(): string | null {
  const [value, setValue] = useState<string | null>(current);
  useEffect(() => {
    listeners.add(setValue);
    setValue(current);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
