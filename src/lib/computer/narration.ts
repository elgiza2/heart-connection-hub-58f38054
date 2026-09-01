/**
 * @doc Model-written narration for computer runs: the short step plan shown
 * before execution, and the plain-language wrap-up shown after it. Nothing here
 * is canned — on any failure the caller simply renders less, never a template.
 */
import { streamChat } from "@/lib/streamChat";
import { DEFAULT_MODEL } from "@/lib/defaultModel";

async function ask(prompt: string, conversationId?: string | null): Promise<string> {
  let out = "";
  try {
    await streamChat({
      messages: [{ role: "user", content: prompt }],
      model: DEFAULT_MODEL,
      searchEnabled: false,
      chatMode: "normal",
      conversation_id: conversationId || undefined,
      onDelta: (d) => {
        out += d || "";
      },
      onDone: () => {},
      onError: () => {},
    });
  } catch {
    return out.trim();
  }
  return out.trim();
}

/** 3–5 short imperative steps describing how the agent will attack the task. */
export async function generateRunPlan(
  task: string,
  conversationId?: string | null,
): Promise<string[]> {
  const text = await ask(
    [
      "The assistant is about to perform this task on a real cloud computer (browser + terminal).",
      "List 3 to 5 very short steps it will take, one per line, no numbering, no markdown, no intro.",
      "Each step max 8 words. Use the exact same language and dialect as the request.",
      "",
      `Task: ${task}`,
    ].join("\n"),
    conversationId,
  );
  return text
    .split("\n")
    .map((l) => l.replace(/^[\s\-*•\d.)]+/, "").trim())
    .filter(Boolean)
    .slice(0, 5);
}

/** Plain-language wrap-up of what actually happened during the run. */
export async function generateRunSummary(params: {
  task: string;
  steps: string[];
  output?: string | null;
  failed?: boolean;
  conversationId?: string | null;
}): Promise<string> {
  const { task, steps, output, failed, conversationId } = params;
  return ask(
    [
      failed
        ? "A computer task did NOT finish. Explain briefly what was attempted, where it stopped, and one concrete next step."
        : "A computer task just finished. Tell the user what was done and what the outcome is.",
      "Write 2-4 sentences of plain text: no markdown, no headings, no bullets, no emojis.",
      "Use the exact same language and dialect as the request.",
      "",
      `Request: ${task}`,
      steps.length ? `Steps performed:\n${steps.slice(-20).join("\n")}` : "",
      output ? `Raw agent output:\n${String(output).slice(0, 4000)}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    conversationId,
  );
}
