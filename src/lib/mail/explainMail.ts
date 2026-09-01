/** @doc Ask the chat model to summarise / explain one email in the user's language. */
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_MODEL } from "@/lib/defaultModel";
import { getUserLang } from "@/lib/authI18n";

export interface ExplainInput {
  subject: string;
  from: string;
  body: string;
}

export async function explainMail(input: ExplainInput): Promise<string> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("not authenticated");

  const egyptian = getUserLang() === "ar-eg";
  const system = egyptian
    ? "انت مساعد بيشرح الإيميلات بالعامية المصرية. اشرح الرسالة باختصار: مين باعتها، هي عن ايه، وايه المطلوب مني. استخدم نقط قصيرة."
    : "You explain emails. Briefly cover: who sent it, what it is about, and what action is needed. Use short bullets.";

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-alibaba`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      chatMode: "normal",
      customSystem: system,
      messages: [
        {
          role: "user",
          content: `${system}\n\n---\n${egyptian ? "الرسالة دي جاتلي في البريد، اشرحهالي:" : "Explain this email I received:"}\n\nFrom: ${input.from}\nSubject: ${input.subject}\n\n${input.body.slice(0, 6000)}\n---\n${egyptian ? "اشرح الإيميل ده بس، متتكلمش عن حاجة تانية." : "Only explain the email above; do not talk about anything else."}`,
        },
      ],
    }),
  });
  if (!res.ok || !res.body) throw new Error(`explain failed (${res.status})`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        const j = JSON.parse(raw) as Record<string, unknown> & {
          choices?: { delta?: { content?: string } }[];
          delta?: string;
          content?: string;
        };
        out += j?.choices?.[0]?.delta?.content ?? j?.delta ?? j?.content ?? "";
      } catch {
        /* keepalive */
      }
    }
  }
  return out.trim();
}
