/** @doc Server-only speech-to-text core: forwards recorded audio to the Lovable AI Gateway. */

export interface TranscribeResult {
  text: string;
  error?: string;
}

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/audio/transcriptions";
const MODEL = "openai/gpt-4o-mini-transcribe";

/**
 * Transcribes a recorded audio blob. Returns a plain `{ text }` payload so the
 * composer can append the words straight into the input.
 */
export async function transcribeAudio(
  file: Blob,
  opts: { language?: string; filename?: string } = {},
): Promise<{ status: number; body: TranscribeResult }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    return { status: 500, body: { text: "", error: "Speech-to-text is not configured" } };
  }
  if (!file || file.size === 0) {
    return { status: 400, body: { text: "", error: "Empty audio" } };
  }

  const form = new FormData();
  form.append("file", file, opts.filename || "audio.webm");
  form.append("model", MODEL);
  if (opts.language) form.append("language", opts.language);

  const resp = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const raw = await resp.text();
  if (!resp.ok) {
    // 429/5xx are transient; everything else is terminal. Surface the gateway's
    // own message so the UI can tell the user what actually went wrong.
    let message = raw.slice(0, 300);
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string }; message?: string };
      message = parsed?.error?.message || parsed?.message || message;
    } catch {
      /* keep raw text */
    }
    return { status: resp.status, body: { text: "", error: message || `HTTP ${resp.status}` } };
  }

  try {
    const parsed = JSON.parse(raw) as { text?: string };
    return { status: 200, body: { text: String(parsed?.text ?? "").trim() } };
  } catch {
    return { status: 502, body: { text: "", error: "Invalid transcription response" } };
  }
}
