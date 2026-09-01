import { useRef, useState } from "react";

export type StudyTimer = {
  id: string;
  totalSec: number;
  startedAt: number;
  paused: boolean;
  pausedRemaining: number | null;
};

export type UserTrack = {
  id: string;
  name: string;
  storage_path: string;
};

/**
 * Encapsulates state for the study/learn mode (focus music, read-aloud,
 * pomodoro timers, user-uploaded tracks). Extracted from ChatPage to
 * reduce re-render surface.
 */
export function useStudyMode() {
  const [studyMusic, setStudyMusic] = useState<{ kind: string | null }>({
    kind: null,
  });
  const [readAloud, setReadAloud] = useState(false);
  const [studyTimers, setStudyTimers] = useState<StudyTimer[]>([]);
  const [timerInputMin, setTimerInputMin] = useState<number>(25);
  const studyAudioRef = useRef<HTMLAudioElement | null>(null);
  const musicFileInputRef = useRef<HTMLInputElement | null>(null);

  return {
    studyMusic,
    setStudyMusic,
    readAloud,
    setReadAloud,
    studyTimers,
    setStudyTimers,
    timerInputMin,
    setTimerInputMin,
    studyAudioRef,
    musicFileInputRef,
  };
}
