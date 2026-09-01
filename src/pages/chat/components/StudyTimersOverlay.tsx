import { Suspense } from "react";
import { AnimatePresence } from "framer-motion";
import { InChatTimerCard } from "../lazyComponents";

interface StudyTimer {
  id: string;
  totalSec: number;
  startedAt: number;
  paused: boolean;
  pausedRemaining: number | null;
}

interface StudyTimersOverlayProps {
  timers: StudyTimer[];
  setTimers: React.Dispatch<React.SetStateAction<StudyTimer[]>>;
}

export const StudyTimersOverlay = ({ timers, setTimers }: StudyTimersOverlayProps) => {
  if (timers.length === 0) return null;
  return (
    <div className="sticky top-16 z-30 flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {timers.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <Suspense fallback={null}>
              <InChatTimerCard
                id={t.id}
                totalSec={t.totalSec}
                startedAt={t.startedAt}
                paused={t.paused}
                pausedRemaining={t.pausedRemaining}
                onPauseToggle={(id) =>
                  setTimers((prev) =>
                    prev.map((x) => {
                      if (x.id !== id) return x;
                      if (x.paused) {
                        const remaining = x.pausedRemaining ?? x.totalSec;
                        return {
                          ...x,
                          paused: false,
                          startedAt: Date.now() - (x.totalSec - remaining) * 1000,
                          pausedRemaining: null,
                        };
                      }
                      const remaining = Math.max(
                        0,
                        x.totalSec - Math.floor((Date.now() - x.startedAt) / 1000),
                      );
                      return { ...x, paused: true, pausedRemaining: remaining };
                    }),
                  )
                }
                onCancel={(id) => setTimers((prev) => prev.filter((x) => x.id !== id))}
              />
            </Suspense>
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default StudyTimersOverlay;
