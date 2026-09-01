import { Suspense } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { friendlyUserMessage, reportError } from "@/lib/errors";
import { DocsClarifyCard } from "../lazyComponents";
import type { Message } from "../chatConstants";

type SaveMessageFn = (
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  images?: string[],
  metadata?: Record<string, unknown>,
) => Promise<string | undefined>;

interface Props {
  msg: Message;
  conversationId: string | null;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setIsLoading: (v: boolean) => void;
  setIsThinking: (v: boolean) => void;
  setSearchStatus: (v: string) => void;
  resetToolUi: () => void;
  startDocsStatusFallback: () => void;
  stopDocsStatusFallback: () => void;
  saveMessage: SaveMessageFn;
}

export default function AssistantDocsClarifyBlock({
  msg,
  conversationId,
  setMessages,
  setIsLoading,
  setIsThinking,
  setSearchStatus,
  resetToolUi,
  startDocsStatusFallback,
  stopDocsStatusFallback,
  saveMessage,
}: Props) {
  if (!msg.docsClarify) return null;
  const targetKey = msg.id ?? msg.clientId;
  const matchesTarget = (mm: Message) =>
    targetKey ? mm.id === targetKey || mm.clientId === targetKey : mm === msg;

  return (
    <div className="px-3 md:px-12">
      <Suspense fallback={null}>
        <DocsClarifyCard
          key={`${msg.id ?? msg.clientId ?? "c"}::${msg.docsClarify.questions.length}::${msg.docsClarify.questions[0]?.id ?? ""}::${msg.docsClarify.reason.slice(0, 32)}`}
          reason={msg.docsClarify.reason}
          questions={msg.docsClarify.questions}
          ui={msg.docsClarify.ui}
          onSubmit={async (answers) => {
            try {
              setIsLoading(true);
              setIsThinking(true);
              startDocsStatusFallback();
              const [{ streamDoc }, { saveDocHtml, newArtifactId }] = await Promise.all([
                import("@/lib/agent/docs/docsGenerator"),
                import("@/lib/agent/docs/htmlCache"),
              ]);
              const artifactId = newArtifactId();
              let meta: { title: string; doc_type: string } | null = null;
              let lastFlush = 0;
              let generatedMessageId = msg.id ?? null;
              const flush = (full: string, force = false) => {
                const now = Date.now();
                if (!force && now - lastFlush < 250) return;
                lastFlush = now;
                setMessages((prev) =>
                  prev.map((mm) =>
                    matchesTarget(mm)
                      ? {
                          ...mm,
                          docsClarify: undefined,
                          content: "",
                          docsArtifact: {
                            artifactId,
                            title: meta?.title ?? "Document",
                            docType: meta?.doc_type ?? "document",
                            html: full,
                          },
                        }
                      : mm,
                  ),
                );
              };
              let finalHtml = "";
              let finalFriendly = "";
              await streamDoc(
                {
                  prompt: msg.docsClarify!.originalPrompt,
                  clarifications: answers,
                  conversationId: conversationId ?? null,
                  messageId: msg.id ?? null,
                },
                {
                  onStatus: (text) => {
                    stopDocsStatusFallback();
                    setSearchStatus(text);
                  },
                  onMeta: (m) => {
                    meta = m;
                    flush("<!DOCTYPE html><html><body></body></html>", true);
                  },
                  onHtmlDelta: (_c, full) => {
                    finalHtml = full;
                    flush(full);
                  },
                  onHtmlDone: (full, friendly) => {
                    finalHtml = full;
                    if (friendly) finalFriendly = friendly;
                    flush(full, true);
                  },
                  onClarify: (c) => {
                    setMessages((prev) =>
                      prev.map((mm) =>
                        matchesTarget(mm)
                          ? {
                              ...mm,
                              docsArtifact: undefined,
                              docsClarify: {
                                reason: c.reason,
                                questions: c.questions,
                                ui: c.ui,
                                originalPrompt: msg.docsClarify!.originalPrompt,
                              },
                            }
                          : mm,
                      ),
                    );
                  },
                  onError: (msg2) => {
                    throw new Error(msg2);
                  },
                },
              );
              if (finalHtml && finalHtml.length > 400 && meta) {
                saveDocHtml(artifactId, finalHtml);
                const mm0 = meta as { title: string; doc_type: string };
                let friendly = finalFriendly;
                if (!friendly) {
                  const { buildDocReadyMessageAI } = await import("@/lib/agent/docs/readyMessage");
                  friendly = await buildDocReadyMessageAI({
                    title: mm0.title,
                    html: finalHtml,
                    docType: mm0.doc_type,
                    prompt: msg.docsClarify!.originalPrompt,
                  });
                }
                setMessages((prev) =>
                  prev.map((mm) =>
                    matchesTarget(mm)
                      ? {
                          ...mm,
                          content: friendly,
                          docsClarify: undefined,
                          docsArtifact: {
                            artifactId,
                            title: mm0.title,
                            docType: mm0.doc_type,
                            html: finalHtml,
                          },
                        }
                      : mm,
                  ),
                );
                if (conversationId) {
                  const metadata = {
                    kind: "docsArtifact",
                    docsArtifact: {
                      artifactId,
                      title: mm0.title,
                      docType: mm0.doc_type,
                      html: finalHtml,
                    },
                  };
                  if (generatedMessageId) {
                    try {
                      await supabase
                        .from("messages")
                        .update({ content: friendly, metadata })
                        .eq("id", generatedMessageId);
                    } catch {
                      /* best-effort */
                    }
                  } else {
                    generatedMessageId =
                      (await saveMessage(
                        conversationId,
                        "assistant",
                        friendly,
                        undefined,
                        metadata,
                      ).catch(() => undefined)) ?? null;
                  }
                }
              } else {
                setMessages((prev) =>
                  prev.map((mm) =>
                    matchesTarget(mm)
                      ? {
                          ...mm,
                          docsArtifact: undefined,
                          content:
                            "Could not create the document this time. Try rephrasing or try again.",
                        }
                      : mm,
                  ),
                );
                toast.error("Document was not created — please try again");
              }
            } catch (e) {
              const safe = friendlyUserMessage(
                e,
                "We couldn't create the document. Please try again.",
              );
              void reportError(e, { source: "docs-regenerate" });
              toast.error(safe);
              setMessages((prev) =>
                prev.map((mm) =>
                  matchesTarget(mm)
                    ? {
                        ...mm,
                        docsArtifact: undefined,
                        content: safe,
                      }
                    : mm,
                ),
              );
            } finally {
              stopDocsStatusFallback();
              setIsLoading(false);
              setIsThinking(false);
              resetToolUi();
            }
          }}
        />
      </Suspense>
    </div>
  );
}
