/** @doc Chat turn handler that runs a request on the Computer Agent and renders
 * a live run card. The turn is split into clearly separate stages:
 *   1. a model-written intro saying what it is about to do,
 *   2. a short model-written step plan,
 *   3. the live run (screen + steps),
 *   4. a model-written wrap-up (rendered by the run card).
 */
import { toast } from "sonner";
import { stripComputerMention } from "@/lib/computer/shouldUseComputer";
import type { Message, ToolPart } from "../chatConstants";
import { PENDING_COMPUTER_RUN } from "@/lib/computer/activeRun";

export interface RunComputerArgs {
  text: string;
  userMsg: Message;
  localTurnId: string;
  attachments?: string[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setInput: (v: string) => void;
  setAttachedFiles: (v: any[]) => void;
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

export async function runComputerTurn({
  text,
  userMsg,
  localTurnId,
  setMessages,
  setInput,
  setAttachedFiles,
  createOrUpdateConversation,
  saveMessage,
  ownInsertedIdsRef,
}: RunComputerArgs) {
  const prompt = stripComputerMention(text);
  const assistantClientId = `assistant-${localTurnId}`;
  const computerTool: ToolPart = {
    id: `computer-${localTurnId}`,
    name: "megsy_computer",
    appSlug: "computer",
    target: prompt || text,
    state: "running",
  };

  setMessages((prev) => [
    ...prev,
    userMsg,
    { role: "assistant", content: "", clientId: assistantClientId, toolParts: [computerTool] },
  ]);
  setInput("");
  setAttachedFiles([]);

  // Flip the composer's send button into a stop button right away — the turn
  // is already in flight before the provider hands back a run id.
  const { setActiveComputerRun, clearActiveComputerRun } = await import(
    "@/lib/computer/activeRun"
  );
  setActiveComputerRun(PENDING_COMPUTER_RUN);

  try {
    const cid = await createOrUpdateConversation(prompt || "Computer task");
    if (cid) {
      const userMessageId = await saveMessage(cid, "user", userMsg.content);
      if (userMessageId) ownInsertedIdsRef.current.add(userMessageId);
    }

    // 1 — model-written intro streamed into the assistant bubble.
    let intro = "";
    try {
      const { generateTurnPreamble } = await import("./turnPreamble");
      await generateTurnPreamble({
        kind: "computer",
        userText: prompt || text,
        conversationId: cid,
        onDelta: (delta) => {
          intro += delta;
          setMessages((prev) =>
            prev.map((m) => (m.clientId === assistantClientId ? { ...m, content: intro } : m)),
          );
        },
      });
    } catch {
      /* no intro — start right away */
    }

    // 2 — short plan, shown above the live screen while the run starts.
    let plan: string[] = [];
    try {
      const { generateRunPlan } = await import("@/lib/computer/narration");
      plan = await generateRunPlan(prompt || text, cid);
      if (plan.length) {
        setMessages((prev) =>
          prev.map((m) =>
            m.clientId === assistantClientId ? { ...m, computerPlan: plan } : m,
          ),
        );
      }
    } catch {
      /* plan is optional */
    }

    // 3 — start the run.
    try {
      const { startLongRun } = await import("@/hooks/useLongRun");
      const run = await startLongRun(prompt, cid);
      if (!run?.id) throw new Error("تعذّر بدء المهمة على الكمبيوتر. حاول تاني.");
      setActiveComputerRun(run.id);
      let assistantId: string | undefined;
      if (cid) {
        assistantId = await saveMessage(cid, "assistant", intro, undefined, {
          kind: "longRun",
          longRunId: run.id,
          computerPlan: plan,
        });
        if (assistantId) ownInsertedIdsRef.current.add(assistantId);
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.clientId === assistantClientId
            ? {
                ...m,
                id: assistantId || m.id,
                content: intro,
                longRunId: run.id,
                computerPlan: plan,
                 toolParts: [{ ...computerTool, state: "done" }],
              }
            : m,
        ),
      );
      window.dispatchEvent(new CustomEvent("megsy:conversations-changed"));
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "تعذّر بدء المهمة على الكمبيوتر.";
      setMessages((prev) =>
        prev.map((m) =>
          m.clientId === assistantClientId
             ? {
                 ...m,
                 content: intro ? `${intro}\n\n${msg}` : msg,
                 toolParts: [{ ...computerTool, state: "error", result: msg }],
               }
            : m,
        ),
      );
      clearActiveComputerRun(PENDING_COMPUTER_RUN);
      toast.error(msg);
      return;
    }
  } catch (e) {
    clearActiveComputerRun(PENDING_COMPUTER_RUN);
    const msg = e instanceof Error ? e.message : "المهمة على الكمبيوتر فشلت";
    setMessages((prev) =>
      prev.map((m) =>
        m.clientId === assistantClientId
          ? { ...m, content: msg, toolParts: [{ ...computerTool, state: "error", result: msg }] }
          : m,
      ),
    );
    toast.error(msg);
  }
}
