/**
 * @doc Chat turn handler for the Dev Agent (@dev).
 *
 * The agent builds real React 18 + Vite projects inside a cloud VM. The chat
 * shows a short live progress log while it works, then the final summary.
 * A deployment is only performed when the user explicitly asked for it, and
 * in that case the reply ends with the live URL and a screenshot.
 */
import { toast } from "sonner";
import type { Message } from "../chatConstants";
import { driveDevRun, startDevRun, type DevState } from "@/lib/devagent/client";

export interface RunDevArgs {
  text: string;
  userMsg: Message;
  localTurnId: string;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setInput: (v: string) => void;
  setAttachedFiles: (v: any[]) => void;
  setIsLoading?: (v: boolean) => void;
  createOrUpdateConversation: (title: string) => Promise<string | null>;
  saveMessage: (
    cid: string,
    role: string,
    content: string,
    modelId?: any,
    meta?: any,
  ) => Promise<string | undefined>;
  ownInsertedIdsRef: React.MutableRefObject<Set<string>>;
}

export function stripDevMention(text: string): string {
  return text.replace(/@dev\b/gi, "").trim();
}

/**
 * Accumulating live trace. The server only returns the latest slice of events,
 * so the trace is kept in a stateful accumulator: task lines are updated in
 * place by id and activity lines are append-only, so nothing already shown to
 * the user is ever wiped.
 */
function createTraceAccumulator() {
  const tasks = new Map<string, string>();
  const taskOrder: string[] = [];
  const activity: string[] = [];
  const seenEvents = new Set<string>();

  return (state: DevState): string => {
    for (const t of state.tasks ?? []) {
      const mark =
        t.status === "done" ? "✅" : t.status === "running" ? "⏳" : t.status === "failed" ? "❌" : "•";
      const id = String((t as any).id ?? t.title);
      if (!tasks.has(id)) taskOrder.push(id);
      tasks.set(id, `${mark} ${t.title}`);
    }
    for (const e of state.events ?? []) {
      const id = String((e as any).id ?? `${e.type}:${e.title}`);
      if (seenEvents.has(id)) continue;
      seenEvents.add(id);
      if ((e.type === "tool" || e.type === "status" || e.type === "completeness") && e.title) {
        activity.push(e.title);
      }
    }
    return [...taskOrder.map((id) => tasks.get(id)!), ...activity.slice(-14)]
      .join("\n")
      .trim();
  };
}

/** Final answer body — only shown once the run finished. */
function renderFinal(state: DevState): string {
  const lines: string[] = [];
  const error = state.run?.error as string | undefined;
  const summary = state.run?.summary as string | undefined;
  if (state.run?.status === "error" && error) {
    return `تعذر إكمال مشروع البرمجة: ${error}`;
  }
  if (summary) lines.push(summary);
  const deployed = state.events?.find((e) => e.type === "deployed");
  const url = (deployed?.payload?.url as string) || state.project?.deploy_url;
  const shot = (deployed?.payload?.screenshot as string) || state.project?.screenshot_url;
  if (url) {
    lines.push("", `🔗 ${url}`);
    if (shot) lines.push("", `![preview](${shot})`);
  }
  return lines.join("\n").trim();
}

export async function runDevTurn({
  text,
  userMsg,
  localTurnId,
  setMessages,
  setInput,
  setAttachedFiles,
  setIsLoading,
  createOrUpdateConversation,
  saveMessage,
  ownInsertedIdsRef,
}: RunDevArgs) {
  const prompt = stripDevMention(text);
  const assistantClientId = `assistant-${localTurnId}`;

  setMessages((prev) => [
    ...prev,
    userMsg,
    { role: "assistant", content: "", reasoning: "", clientId: assistantClientId },
  ]);
  setInput("");
  setAttachedFiles([]);
  setIsLoading?.(true);

  const patch = (fields: Partial<Message>) =>
    setMessages((prev) =>
      prev.map((m) => (m.clientId === assistantClientId ? { ...m, ...fields } : m)),
    );

  try {
    const cid = await createOrUpdateConversation(prompt.slice(0, 60) || "Dev task");
    if (cid) {
      const userMessageId = await saveMessage(cid, "user", userMsg.content);
      if (userMessageId) ownInsertedIdsRef.current.add(userMessageId);
    }

    const started = await startDevRun(prompt, cid);
    let trace = "";
    const accumulateTrace = createTraceAccumulator();
    const final = await driveDevRun(started.run.id, (state) => {
      const t = accumulateTrace(state);
      if (t) trace = t;
      patch({ reasoning: trace });
    });

    const content = final
      ? renderFinal(final) || renderFinalFallback(trace)
      : "تعذر الحصول على الحالة النهائية لوكيل البرمجة.";
    patch({ content, reasoning: trace });
    setIsLoading?.(false);

    if (cid) {
      const assistantId = await saveMessage(cid, "assistant", content, undefined, {
        kind: "devRun",
        devRunId: started.run.id,
        reasoning: trace,
      });
      if (assistantId) ownInsertedIdsRef.current.add(assistantId);
    }
    window.dispatchEvent(new CustomEvent("megsy:conversations-changed"));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل تشغيل وكيل البرمجة";
    patch({ content: msg });
    toast.error(msg);
  } finally {
    setIsLoading?.(false);
  }
}

function renderFinalFallback(trace: string): string {
  return trace ? "تم." : "تم.";
}

