import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic } from "lucide-react";
import { toast } from "sonner";
import { authenticatedFetch } from "@/lib/authenticatedFetch";

interface Props {
  /** Appends recognized speech to the composer value. */
  onTranscript: (text: string) => void;
  /** Notifies the composer so it can switch to the recording animation. */
  onListeningChange?: (listening: boolean) => void;
  lang?: string;
}

function pickMimeType(): string | undefined {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

/**
 * Dictation button. Records real audio with MediaRecorder and transcribes it
 * on the server, so it works in every browser and inside the Android/iOS
 * webview shells — unlike the Web Speech API, which is Chrome-desktop only.
 */
export function ComposerMicButton({ onTranscript, onListeningChange, lang = "ar" }: Props) {
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cbRef = useRef(onTranscript);
  cbRef.current = onTranscript;

  useEffect(() => {
    onListeningChange?.(listening);
  }, [listening, onListeningChange]);

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const send = useCallback(
    async (blob: Blob, mime: string) => {
      if (blob.size < 1200) {
        toast.error("Recording too short — hold the mic and speak");
        return;
      }
      setBusy(true);
      try {
        const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
        const form = new FormData();
        form.append("file", blob, `speech.${ext}`);
        form.append("language", (lang || "ar").slice(0, 2));
        const resp = await authenticatedFetch("/api/transcribe", { method: "POST", body: form });
        const data = (await resp.json().catch(() => null)) as
          | { text?: string; error?: string }
          | null;
        if (!resp.ok || !data || data.error) {
          toast.error(data?.error || "Transcription failed");
          return;
        }
        const text = (data.text || "").trim();
        if (!text) {
          toast.error("Didn't catch that — try again");
          return;
        }
        cbRef.current(text);
      } catch {
        toast.error("Transcription failed");
      } finally {
        setBusy(false);
      }
    },
    [lang],
  );

  const stop = useCallback(() => {
    try {
      recorderRef.current?.state === "recording" && recorderRef.current.stop();
    } catch {
      /* noop */
    }
    setListening(false);
  }, []);

  const start = useCallback(async () => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Your browser does not support voice input");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const mime = rec.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        chunksRef.current = [];
        cleanup();
        void send(blob, mime);
      };
      recorderRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      cleanup();
      setListening(false);
      toast.error("Couldn't start the microphone");
    }
  }, [cleanup, send]);

  useEffect(
    () => () => {
      try {
        recorderRef.current?.stop();
      } catch {
        /* noop */
      }
      cleanup();
    },
    [cleanup],
  );

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => (listening ? stop() : void start())}
      aria-label={listening ? "Stop recording" : "Voice input"}
      aria-pressed={listening}
      className="shrink-0 inline-flex w-11 h-11 md:w-10 md:h-10 items-center justify-center rounded-full border-0 bg-transparent outline-none transition-opacity hover:opacity-80 active:scale-95 disabled:opacity-60"
      style={{ background: "transparent", border: 0, boxShadow: "none" }}
    >
      {busy ? (
        <Loader2 className="w-[20px] h-[20px] animate-spin text-foreground/70" strokeWidth={1.9} />
      ) : (
        <Mic
          className={`w-[20px] h-[20px] transition-colors ${listening ? "text-primary" : "text-foreground/70"}`}
          strokeWidth={1.9}
        />
      )}
    </button>
  );
}

export default ComposerMicButton;
