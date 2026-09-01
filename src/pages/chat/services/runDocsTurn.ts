import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { friendlyUserMessage, reportError } from "@/lib/errors";
import type { Message } from "../chatConstants";

export interface RunDocsTurnArgs {
  userInput: string;
  localTurnId: string;
  chatUserId: string | null | undefined;
  navigate: (path: string) => void;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setSearchStatus: (v: string) => void;
  setIsLoading: (v: boolean) => void;
  setIsThinking: (v: boolean) => void;
  resetToolUi: () => void;
  startDocsStatusFallback: () => void;
  stopDocsStatusFallback: () => void;
  createOrUpdateConversation: (title: string) => Promise<string | null>;
  saveMessage: (
    cid: string,
    role: string,
    content: string,
    modelId?: any,
    meta?: any,
  ) => Promise<string | undefined>;
  ownInsertedIdsRef: React.MutableRefObject<Set<string>>;
  /** Step 1 only: produce an editable plan card instead of the final file. */
  planOnly?: boolean;
  /** Fully-built brief from an approved plan (skips the clarify wizard). */
  brief?: string;
  /** Text extracted from files the user attached to this turn. */
  attachedFilesText?: string;
  attachedFileMeta?: { name: string; chars: number }[];
  /** Previous version of the document when the user asks for a revision. */
  previousHtml?: string;
  /** Skip saving the user message (already saved by the caller). */
  skipUserSave?: boolean;
}


/**
 * Returns `true` if the docs flow handled the request and the caller should
 * `return`. Returns `false` only if the user must be redirected (caller is
 * responsible for clearing `isSubmittingRef`).
 */
export async function runDocsTurn(args: RunDocsTurnArgs): Promise<boolean> {
  const {
    userInput,
    localTurnId,
    chatUserId,
    navigate,
    messages,
    setMessages,
    setSearchStatus,
    setIsLoading,
    setIsThinking,
    resetToolUi,
    startDocsStatusFallback,
    stopDocsStatusFallback,
    createOrUpdateConversation,
    saveMessage,
    ownInsertedIdsRef,
    planOnly,
    brief,
    attachedFilesText,
    attachedFileMeta,
    previousHtml,
    skipUserSave,
  } = args;

  if (!chatUserId) {
    toast.error("Please sign in to generate documents.");
    navigate(
      `/auth?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`,
    );
    return false;
  }

  const conversationPromise = createOrUpdateConversation(userInput || "Document").catch(() => null);

  if (!skipUserSave) {
    void conversationPromise.then(async (cid) => {
      if (!cid) return;
      const insertedId = await saveMessage(cid, "user", userInput);
      if (insertedId) {
        ownInsertedIdsRef.current.add(insertedId);
        window.dispatchEvent(new CustomEvent("megsy:conversations-changed"));
      }
    });
  }

  // ── Step 1: planning — build an editable outline instead of the file ────
  if (planOnly) {
    try {
      const { generateDocsOutline, detectDocLanguage } = await import("@/lib/docs/generatePlan");
      const language = detectDocLanguage(userInput);
      setSearchStatus(language === "ar" ? "جاري تخطيط المستند…" : "Planning the document…");
      const planned = await generateDocsOutline({
        topic: userInput,
        language,
        userId: chatUserId,
        sourceText: attachedFilesText,
      });
      const cid = await conversationPromise;
      if (!planned) {
        const failMsg =
          language === "ar"
            ? "تعذّر تخطيط المستند. جرّب إعادة الصياغة."
            : "Could not plan the document. Try rephrasing.";
        setMessages((prev) =>
          prev.map((m) =>
            m.clientId === `assistant-${localTurnId}` ? { ...m, content: failMsg } : m,
          ),
        );
        return true;
      }
      const docsPlan: import("@/lib/docs/planTypes").DocsPlanState = {
        topic: userInput,
        docType: planned.docType,
        language,
        sections: planned.sections,
        stage: "planning",
        sourceText: attachedFilesText || undefined,
        sourceFiles: attachedFileMeta,
      };
      const intro =
        language === "ar"
          ? "جهّزت مخطط المستند — راجعه أو عدّله، ويمكنك تشغيل الSearch العميق قبل الكتابة."
          : "Here's the document plan — review or edit it, and optionally run deep research before writing.";
      setMessages((prev) =>
        prev.map((m) =>
          m.clientId === `assistant-${localTurnId}` ? { ...m, content: intro, docsPlan } : m,
        ),
      );
      if (cid) {
        const savedId = await saveMessage(cid, "assistant", intro, undefined, {
          kind: "docsPlan",
          docsPlan,
        }).catch(() => undefined);
        if (savedId) {
          ownInsertedIdsRef.current.add(savedId);
          setMessages((prev) =>
            prev.map((m) =>
              m.clientId === `assistant-${localTurnId}` ? { ...m, id: savedId } : m,
            ),
          );
        }
      }
      return true;
    } catch (e) {
      const safe = friendlyUserMessage(e, "We couldn't plan the document. Please try again.");
      void reportError(e, { source: "docs-plan", context: { localTurnId } });
      setMessages((prev) =>
        prev.map((m) =>
          m.clientId === `assistant-${localTurnId}` ? { ...m, content: safe } : m,
        ),
      );
      return true;
    } finally {
      setSearchStatus("");
      setIsLoading(false);
      setIsThinking(false);
      resetToolUi();
    }
  }

  try {

    startDocsStatusFallback();
    const [{ streamDoc }, { saveDocHtml, newArtifactId }] = await Promise.all([
      import("@/lib/agent/docs/docsGenerator"),
      import("@/lib/agent/docs/htmlCache"),
    ]);
    const recentHistory = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
    const artifactId = newArtifactId();

    const cid = await conversationPromise;
    let introContent = "";
    try {
      const { generateTurnPreamble } = await import("./turnPreamble");
      await generateTurnPreamble({
        kind: "docs",
        userText: userInput,
        chatUserId,
        conversationId: cid || undefined,
        onDelta: (delta) => {
          introContent += delta;
          setMessages((prev) =>
            prev.map((m) =>
              m.clientId === `assistant-${localTurnId}` ? { ...m, content: introContent } : m,
            ),
          );
        },
      });
    } catch {
      /* no preamble — start generating right away */
    }

    let placeholderMessageId: string | null = null;
    if (cid) {
      placeholderMessageId =
        (await saveMessage(
          cid,
          "assistant",
          introContent.trim() || "Preparing the document on the server… you can close the tab and we'll save the result here.",
          undefined,
          {
            kind: "docsPending",
            originalPrompt: userInput,
            docsArtifact: { artifactId, title: "Document", docType: "document" },
          },
        )) ?? null;
      if (placeholderMessageId) {
        ownInsertedIdsRef.current.add(placeholderMessageId);
        setMessages((prev) =>
          prev.map((m) =>
            m.clientId === `assistant-${localTurnId}`
              ? { ...m, id: placeholderMessageId ?? undefined }
              : m,
          ),
        );
      }
    }

    let pendingMeta: { title: string; doc_type: string } | null = null;
    let lastFlush = 0;
    let isClarify = false;

    const flush = (full: string, force = false) => {
      const now = Date.now();
      if (!force && now - lastFlush < 250) return;
      lastFlush = now;
      setMessages((prev) =>
        prev.map((m) =>
          m.clientId === `assistant-${localTurnId}`
            ? {
                ...m,
                content: introContent,
                docsArtifact: {
                  artifactId,
                  title: pendingMeta?.title ?? "Document",
                  docType: pendingMeta?.doc_type ?? "document",
                  html: full,
                },
              }
            : m,
        ),
      );
    };

    let finalHtml = "";
    let finalMeta: { title: string; doc_type: string } | null = null;
    let finalFriendly = "";
    let clarifyPayload: { reason: string; questions: any[] } | null = null;
    let receivedJobId: string | null = null;

    // World-class docs directive — force the backend to run a proper
    // clarification wizard before generating. The model MUST ask a full
    // professional questionnaire covering every required and optional field
    // for the specific document type (CV, cover letter, employment contract,
    // NDA, invoice, business plan, report, proposal, meeting minutes,
    // certificate, memo, agreement, etc.) so the final document is complete
    // and personal — never generic filler and never placeholders like
    // "[Your Name]". The wizard should mark essential fields as required
    // and personal touches (photo, brand colors, signatures, extra sections)
    // as optional. After the user answers, produce a print-ready document
    // matching the visual quality of the world's best templates
    // (Canva Pro / Adobe / Notion / Novoresume / PandaDoc).
    const enhancedPrompt =
      `${userInput}\n\n` +
      `[DOCS DIRECTIVE]\n` +
      `1. First, ask a COMPLETE professional clarify questionnaire for the ` +
      `exact document type the user requested. Cover every field a top ` +
      `designer or lawyer would ask for: identity, contact info, dates, ` +
      `parties, terms, scope, deliverables, amounts, jurisdiction, ` +
      `signatures, sections, tone, language, and any type-specific fields ` +
      `(e.g. for a CV: full name, job title, summary, work history with ` +
      `dates and achievements, education, skills, languages, certifications, ` +
      `projects, links, photo; for a contract: parties, effective date, ` +
      `term, payment, IP, confidentiality, termination, governing law).\n` +
      `2. Mark truly essential fields as required and personal/branding ` +
      `fields as optional.\n` +
      `3. Group related questions and keep labels short and clear in the ` +
      `user's language.\n` +
      `4. Only after answers are collected, generate a print-ready, ` +
      `beautifully typeset HTML document that matches the visual quality ` +
      `of the world's best templates. Never emit placeholder brackets — ` +
      `always fill values from the answers. If an optional field was ` +
      `skipped, omit that section gracefully.`;

    // When the user approved a plan (step 4 = clean, consistent writing), the
    // brief already carries the outline, research references, imported data
    // and the previous version — so we skip the clarify wizard entirely.
    const finalPrompt = brief
      ? `${brief}\n\n[DOCS DIRECTIVE]\n` +
        `Do NOT ask any clarifying questions. Write the final print-ready HTML ` +
        `document now, following the approved plan exactly, in one consistent ` +
        `conservative voice. Never emit placeholder brackets. If a References ` +
        `section is required, list only the real sources given above.` +
        (previousHtml
          ? `\nApply the requested revision on top of the previous version and keep everything else identical.`
          : "")
      : `${enhancedPrompt}${
          attachedFilesText
            ? `\n\n[USER DATA FROM ATTACHED FILES — analyze and use real values]\n${attachedFilesText.slice(0, 12000)}`
            : ""
        }${
          previousHtml
            ? `\n\n[PREVIOUS VERSION — revise this document in place, keep design and untouched sections]\n${previousHtml.slice(0, 24000)}`
            : ""
        }`;

    await streamDoc(
      {
        prompt: finalPrompt,

        history: recentHistory,
        conversationId: cid ?? null,
        messageId: placeholderMessageId,
      },
      {





        onJobId: async (jobId) => {
          receivedJobId = jobId;
          if (placeholderMessageId) {
            try {
              await supabase
                .from("messages")
                .update({
                  metadata: {
                    kind: "docsPending",
                    originalPrompt: userInput,
                    docsJobId: jobId,
                    docsArtifact: { artifactId, title: "Document", docType: "document" },
                  },
                })
                .eq("id", placeholderMessageId);
            } catch {
              /* best-effort */
            }
          }
        },
        onStatus: (text) => {
          stopDocsStatusFallback();
          setSearchStatus(text);
        },
        onMeta: (m) => {
          pendingMeta = m;
          finalMeta = m;
          flush("<!DOCTYPE html><html><body></body></html>", true);
        },
        onHtmlDelta: (_chunk, full) => {
          finalHtml = full;
          flush(full);
        },
        onHtmlDone: (full, friendly) => {
          finalHtml = full;
          if (friendly) finalFriendly = friendly;
          flush(full, true);
        },
        onClarify: (c) => {
          isClarify = true;
          clarifyPayload = c;
          setMessages((prev) =>
            prev.map((m) =>
              m.clientId === `assistant-${localTurnId}`
                ? {
                    ...m,
                    content: c.reason,
                    docsArtifact: undefined,
                    docsClarify: {
                      reason: c.reason,
                      questions: c.questions,
                      ui: c.ui,
                      originalPrompt: userInput,
                    },
                  }
                : m,
            ),
          );
        },
        onError: (msg) => {
          throw new Error(msg);
        },
      },
    );

    if (isClarify && clarifyPayload && placeholderMessageId) {
      const cp = clarifyPayload as { reason: string; questions: any[] };
      await supabase
        .from("messages")
        .update({
          content: cp.reason,
          metadata: { kind: "docsClarify", docsClarify: { ...cp, originalPrompt: userInput } },
        })
        .eq("id", placeholderMessageId);
    } else if (finalHtml && finalHtml.length > 400 && finalMeta) {
      saveDocHtml(artifactId, finalHtml);
      const fm = finalMeta as { title: string; doc_type: string };
      let friendly = finalFriendly;
      if (!friendly) {
        const { buildDocReadyMessageAI } = await import("@/lib/agent/docs/readyMessage");
        friendly = await buildDocReadyMessageAI({
          title: fm.title,
          html: finalHtml,
          docType: fm.doc_type,
          prompt: userInput,
        });
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.clientId === `assistant-${localTurnId}`
            ? {
                ...m,
                content: friendly,
                docsArtifact: {
                  artifactId,
                  title: fm.title,
                  docType: fm.doc_type,
                  html: finalHtml,
                },
              }
            : m,
        ),
      );
      if (placeholderMessageId) {
        await supabase
          .from("messages")
          .update({
            content: friendly,
            metadata: {
              kind: "docsArtifact",
              docsArtifact: { artifactId, title: fm.title, docType: fm.doc_type, html: finalHtml },
            },
          })
          .eq("id", placeholderMessageId);
      }
    } else if (!receivedJobId) {
      toast.error("Document was not created — please try again");
      setMessages((prev) =>
        prev.map((m) =>
          m.clientId === `assistant-${localTurnId}`
            ? {
                ...m,
                docsArtifact: undefined,
                content: "Could not create the document this time. Try rephrasing or try again.",
              }
            : m,
        ),
      );
    }
  } catch (e) {
    console.error(e);
    const safe = friendlyUserMessage(e, "We couldn't create the document. Please try again.");
    void reportError(e, { source: "docs-generate", context: { localTurnId } });
    toast.error(safe);
    setMessages((prev) =>
      prev.map((m) =>
        m.clientId === `assistant-${localTurnId}`
          ? { ...m, docsArtifact: undefined, content: safe }
          : m,
      ),
    );
  } finally {
    stopDocsStatusFallback();
    setIsLoading(false);
    setIsThinking(false);
    resetToolUi();
  }

  return true;
}
