/**
 * Plays a brief, polite "ding" using the WebAudio API. Used to alert the
 * user about new realtime messages when their tab is in focus. Wrapped in
 * try/catch since WebAudio can throw on locked-down browsers (e.g. before
 * the first user gesture).
 */
export function playNotificationSound(): void {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    o.type = "sine";
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    o.start();
    o.stop(ctx.currentTime + 0.26);
    setTimeout(() => ctx.close(), 400);
  } catch {
    /* noop — audio unavailable (e.g. before first user gesture) */
  }
}
