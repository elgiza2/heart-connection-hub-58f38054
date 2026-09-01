import { useEffect, useState } from "react";

const DURATION_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export interface PromoCountdown {
  active: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
}

export function usePromoCountdown(): PromoCountdown {
  const [now, setNow] = useState<number>(() => Date.now());
  // Countdown starts fresh on every site visit/session; it is intentionally
  // NOT persisted to localStorage. Reloading the page restarts the timer.
  const [start] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const end = start + DURATION_MS;
  const totalMs = Math.max(0, end - now);
  const active = totalMs > 0;

  const totalSec = Math.floor(totalMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  return { active, days, hours, minutes, seconds, totalMs };
}
