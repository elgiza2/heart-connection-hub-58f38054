import { useEffect, useRef, useState } from "react";

/**
 * Reveals incoming text progressively at ~60fps so streamed tokens
 * appear character-by-character (ChatGPT/Claude style) instead of in
 * sudden chunks. Catches up automatically if the source races ahead.
 *
 * @param target  The full text accumulated so far from the stream.
 * @param enabled When false, returns target immediately (no smoothing).
 * @param charsPerSecond Reveal speed. Default ~80 chars/sec, adapts up
 *        when the buffer grows so the text never lags far behind.
 */
export function useSmoothText(
  target: string,
  enabled: boolean = true,
  charsPerSecond: number = 42,
): string {
  const [displayed, setDisplayed] = useState(target);
  const targetRef = useRef(target);
  const displayedLenRef = useRef(target.length);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  // If smoothing turns off, snap to target.
  useEffect(() => {
    if (!enabled) {
      targetRef.current = target;
      displayedLenRef.current = target.length;
      setDisplayed(target);
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTsRef.current = null;
    }
  }, [enabled, target]);

  useEffect(() => {
    if (!enabled) return;
    targetRef.current = target;

    // If target shrank or fully changed (new message), reset.
    if (
      target.length < displayedLenRef.current ||
      !target.startsWith(displayed.slice(0, Math.min(displayed.length, 32)))
    ) {
      displayedLenRef.current = 0;
      setDisplayed("");
    }

    const tick = (ts: number) => {
      const last = lastTsRef.current ?? ts;
      const dt = Math.min(100, ts - last); // clamp to avoid huge jumps after tab switch
      lastTsRef.current = ts;

      const tgt = targetRef.current;
      const cur = displayedLenRef.current;
      const remaining = tgt.length - cur;

      if (remaining <= 0) {
        rafRef.current = null;
        lastTsRef.current = null;
        return;
      }

      // Adaptive speed: if we're far behind, accelerate gently so we never lag > ~900ms,
      // but cap the catch-up so reading speed stays comfortable (no firehose).
      const baseRate = charsPerSecond;
      const catchUp = Math.max(1, remaining / 0.9); // chars/sec to clear in ~900ms
      const rate = Math.max(baseRate, Math.min(catchUp, 180));

      const step = Math.max(1, Math.round((rate * dt) / 1000));
      let nextLen = Math.min(tgt.length, cur + step);

      // Word-boundary snap (Claude-style): extend nextLen forward to the
      // next whitespace/punctuation so words appear whole, never mid-word.
      // Skip when we're about to fully catch up (final tail of message).
      if (nextLen < tgt.length) {
        const wordBoundary = /[\s,.\u060c\u061b\u061f!?;:)\]}"'\u2019\u201d\n]/;
        let probe = nextLen;
        // Cap the look-ahead so we never block on very long tokens (e.g. URLs).
        const maxLook = Math.min(tgt.length, nextLen + 24);
        while (probe < maxLook && !wordBoundary.test(tgt[probe])) probe++;
        if (probe < maxLook) nextLen = probe + 1;
      }

      displayedLenRef.current = nextLen;
      setDisplayed(tgt.slice(0, nextLen));

      rafRef.current = requestAnimationFrame(tick);
    };

    if (rafRef.current == null && target.length > displayedLenRef.current) {
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTsRef.current = null;
    };
  }, [target, enabled, charsPerSecond]);

  // When streaming ends, ensure full text is shown.
  useEffect(() => {
    if (!enabled) return;
    // no-op; tick will catch up.
  }, [enabled]);

  return enabled ? displayed : target;
}
