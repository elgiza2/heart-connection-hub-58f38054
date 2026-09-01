import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { failStaleJob } from "@/lib/jobs/client";
import { isStandardSlides, findSlidesTemplate } from "@/lib/slidesTemplates";
import { authorizePremiumSlide, FREE_PREMIUM_SLIDES_PER_DAY } from "@/lib/slidesQuota";
import type { SlideDeck } from "@/components/chat/SlidesDeckCard";
import type { Message } from "../chatConstants";
import { SLIDES_CLIENT_TIMEOUT_MS, SLIDES_TIMEOUT_MESSAGE } from "../chatUtils";

export interface RunSlidesTurnArgs {
  userInput: string;
  localTurnId: string;
  chatUserId: string | null | undefined;
  slidesTemplate: string;
  setChatMode: (m: any) => void;
  setSearchEnabled: (v: boolean) => void;
  setIsLoading: (v: boolean) => void;
  setIsThinking: (v: boolean) => void;
  resetToolUi: () => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setSearchStatus: (v: string) => void;
  createOrUpdateConversation: (title: string) => Promise<string | null>;
  saveMessage: (
    cid: string,
    role: string,
    content: string,
    modelId?: any,
    meta?: any,
  ) => Promise<string | undefined>;
  ownInsertedIdsRef: React.MutableRefObject<Set<string>>;
  fetchSlidesNarration: (p: any) => Promise<string>;
  insertAssistantNarration: (
    cid: string | null | undefined,
    text: string,
    clientId?: string,
    meta?: { slidesOutline?: import("@/lib/slidesOutlineParser").SlidesOutline } & Record<
      string,
      any
    >,
  ) => Promise<void>;
  clearSlidesTimeout: (jobId: string) => void;
  slidesTimeoutsRef: React.MutableRefObject<Record<string, number>>;
  slidesGenerationTokenRef: React.MutableRefObject<number>;
  /** Stop after the planning step and wait for the user to approve the plan. */
  planOnly?: boolean;
  /** Skip persisting the user message (used when resuming from the plan card). */
  skipUserSave?: boolean;
  /** Enriched brief (plan + research + imported data) sent to the generator. */
  brief?: string;
  /** The approved plan; when present the deck is built from its reviewed content. */
  plan?: import("@/lib/slides/planTypes").SlidesPlanState;
  /** Extracted text from files the user attached to this turn. */
  attachedFilesText?: string;
  /** Names/sizes of imported files, shown on the plan card. */
  attachedFileMeta?: { name: string; chars: number }[];
}


/**
 * Returns true if the slides turn was started successfully and the caller
 * should `return`. Returns false if validation prevented work (caller still
 * returns; isSubmittingRef is reset by caller).
 */
export async function runSlidesTurn(args: RunSlidesTurnArgs): Promise<void> {
  const {
    userInput,
    localTurnId,
    chatUserId,
    slidesTemplate,
    setChatMode,
    setSearchEnabled,
    setIsLoading,
    setIsThinking,
    resetToolUi,
    setMessages,
    setSearchStatus,
    createOrUpdateConversation,
    saveMessage,
    ownInsertedIdsRef,
    fetchSlidesNarration,
    insertAssistantNarration,
    clearSlidesTimeout,
    slidesTimeoutsRef,
    slidesGenerationTokenRef,
    planOnly,
    skipUserSave,
    brief,
    plan,
    attachedFilesText,
    attachedFileMeta,
  } = args;


  const slidesRequestToken = ++slidesGenerationTokenRef.current;
  const isSlidesRequestCancelled = () => slidesGenerationTokenRef.current !== slidesRequestToken;

  const slidesTopic = (userInput || "").trim();
  const genericSlideAsks =
    /^(Build|Build me|I want|make|create|generate|build|do)\s*(for me|me)?\s*(slides|presentation|deck)\s*[!.??]*$/i;
  if (!slidesTopic || slidesTopic.length < 6 || genericSlideAsks.test(slidesTopic)) {
    toast.error(
      'Please describe the slides topic clearly, e.g.: "Create slides about ancient Egyptian history in 10 slides"',
    );
    setChatMode("normal");
    setSearchEnabled(true);
    setIsLoading(false);
    setIsThinking(false);
    resetToolUi();
    setMessages((prev) =>
      prev[prev.length - 1]?.role === "assistant" && !prev[prev.length - 1]?.content
        ? prev.slice(0, -1)
        : prev,
    );
    return;
  }

  const conversationPromise = createOrUpdateConversation(userInput || "Slides").catch(() => null);
  const userSavePromise = conversationPromise.then(async (cid) => {
    if (skipUserSave) return;
    if (!cid) return;
    const insertedId = await saveMessage(cid, "user", userInput);
    if (insertedId) {
      ownInsertedIdsRef.current.add(insertedId);
      window.dispatchEvent(new CustomEvent("megsy:conversations-changed"));
    }
  });

  const tplPicked = findSlidesTemplate(slidesTemplate);
  if (tplPicked.category === "premium" && chatUserId) {
    const auth = await authorizePremiumSlide(chatUserId);
    if (!auth.ok) {
      toast.error((auth as { reason?: string }).reason || "Could not start premium slides");
      setIsLoading(false);
      setIsThinking(false);
      resetToolUi();
      return;
    }
    if (auth.charged) {
      toast.info(`Used 1 credit (daily ${FREE_PREMIUM_SLIDES_PER_DAY} free premium slides used)`);
    } else if (auth.remainingFree === 0) {
      toast.info("Last free premium slide today — next ones cost 1 credit");
    }
  }

  try {
    const cid = await conversationPromise;
    await userSavePromise.catch(() => {});

    const isArabic = /[\u0600-\u06FF]/.test(userInput) || !!navigator?.language?.startsWith("ar");
    let introContent = "";

    // ── Step 1: planning (+ imported file data) ──────────────────────────
    if (planOnly) {
      const { generateSlidesOutline, buildFallbackSlidesOutline } = await import("@/lib/slides/generateOutline");
      const [narration, plan] = await Promise.all([
        fetchSlidesNarration({
          mode: "plan",
          topic: slidesTopic,
          kind: "slides",
          title: slidesTopic.slice(0, 80),
          language: isArabic ? "ar" : "en",
        }).catch(() => null),
        generateSlidesOutline({
          topic: slidesTopic,
          language: isArabic ? "ar" : "en",
          userId: chatUserId || undefined,
          sourceText: attachedFilesText,
        }).catch(() => null),
      ]);

      if (isSlidesRequestCancelled()) return;

      const resolvedPlan = plan ?? {
        text: "",
        outline: buildFallbackSlidesOutline(slidesTopic, isArabic ? "ar" : "en"),
      };

      const planState: import("@/lib/slides/planTypes").SlidesPlanState = {
        topic: slidesTopic,
        templateId: slidesTemplate,
        language: isArabic ? "ar" : "en",
        outline: resolvedPlan.outline,
        stage: "planning",
        sourceText: attachedFilesText || undefined,
        sourceFiles: attachedFileMeta?.length ? attachedFileMeta : undefined,
      };

      const introText =
        narration ||
        ("Here's the outline — review or edit it, then press Generate slides.");

      let planMessageId: string | undefined;
      if (cid) {
        planMessageId = await saveMessage(cid, "assistant", introText, undefined, {
          kind: "slidesPlan",
          slidesPlan: planState,
        });
        if (planMessageId) ownInsertedIdsRef.current.add(planMessageId);
        await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString(), mode: "slides" } as any)
          .eq("id", cid);
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.clientId === `assistant-${localTurnId}`
            ? {
                ...m,
                id: planMessageId ?? m.id,
                content: introText,
                slidesPlan: planState,
                slidesOutline: resolvedPlan.outline,
                mode: "slides",
              }
            : m,
        ),
      );
      setIsLoading(false);
      setIsThinking(false);
      resetToolUi();
      return;
    }

    if (isSlidesRequestCancelled()) return;

    let placeholderId: string | null = null;
    if (cid) {
      placeholderId =
        (await saveMessage(cid, "assistant", "", undefined, {
          kind: "slidesPending",
          topic: userInput,
          templateId: slidesTemplate,
        })) ?? null;
      if (placeholderId) ownInsertedIdsRef.current.add(placeholderId);
      if (placeholderId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.clientId === `assistant-${localTurnId}`
              ? { ...m, id: placeholderId ?? undefined, slidesPendingTopic: userInput }
              : m,
          ),
        );
      }
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString(), mode: "slides" } as any)
        .eq("id", cid);
    }
    if (isSlidesRequestCancelled()) return;

    try {
      const { generateTurnPreamble } = await import("./turnPreamble");
      await generateTurnPreamble({
        kind: "slides",
        userText: slidesTopic,
        chatUserId,
        conversationId: cid || undefined,
        onDelta: (delta) => {
          introContent += delta;
          setMessages((prev) =>
            prev.map((m) =>
              m.clientId === `assistant-${localTurnId}` ||
              (!!placeholderId && m.id === placeholderId)
                ? { ...m, content: introContent }
                : m,
            ),
          );
        },
      });
      if (placeholderId && introContent.trim()) {
        void supabase
          .from("messages")
          .update({ content: introContent.trim() } as any)
          .eq("id", placeholderId);
      }
    } catch {
      /* no preamble — start generating right away */
    }

    // Every deck is produced by the Plus AI Presentations API. Our own chat /
    // research agent writes the content first, and that written deck content is
    // handed to Plus AI as the brief so decks are rich instead of 2 slides.
    const { subscribeJob, startPlusAIPresentation } = await import("@/lib/jobs/client");
    void isStandardSlides; // kept import for tree-shake friendliness; no longer used to branch

    const lang: "ar" | "en" = plan?.language || (isArabic ? "ar" : "en");
    const requestedCount = (() => {
      const m = (userInput || "").match(/(\d{1,2})\s*(slides?|شريحة|شرائح|سلايد)/i);
      const n = m ? parseInt(m[1], 10) : NaN;
      return Number.isFinite(n) && n >= 3 && n <= 30 ? n : undefined;
    })();
    const targetCount = plan?.outline?.steps?.length || requestedCount || 10;

    setSearchStatus("Writing slides");
    let agentBrief = brief || "";
    if (!plan?.outline?.steps?.length) {
      try {
        const { generateSlidesOutline, generateSlidesContent } = await import(
          "@/lib/slides/generateOutline"
        );
        const built = await generateSlidesOutline({
          topic: slidesTopic,
          slideCount: targetCount,
          language: lang,
          userId: chatUserId || undefined,
          sourceText: attachedFilesText,
        });
        if (built?.outline?.steps?.length) {
          const content = await generateSlidesContent({
            outline: built.outline,
            topic: slidesTopic,
            language: lang,
            userId: chatUserId || undefined,
            sourceText: attachedFilesText,
          }).catch(() => null);
          const body = (content?.length
            ? content.map((s, i) => `Slide ${i + 1}: ${s.title}\n${s.body}`)
            : built.outline.steps.map(
                (s, i) => `Slide ${i + 1}: ${s.title}\n${(s.items || []).join("\n")}`,
              )
          ).join("\n\n");
          const n = content?.length || built.outline.steps.length;
          agentBrief = [
            slidesTopic,
            "",
            `--- Deck content (use exactly these ${n} slides, in this exact order) ---`,
            body,
            "",
            "--- Rules ---",
            `1. Produce exactly ${n} slides, numbered 1..${n}, in the same order as above. Do not reorder, merge, split, or skip slides.`,
            "2. Slide 1 is the title/intro slide; the final slide is the conclusion of the content above.",
            "3. Do NOT add any extra slide after the last content slide: no credits, no sources, no references, no graphics/icon library, no thank-you, no template or provider branding slide.",
            "4. Never mention the generation tool, template author, or any provider name anywhere in the deck.",
            "5. Keep every slide strictly on-topic and consistent with the flow above.",
          ].join("\n");
        }
      } catch {
        /* fall back to the raw topic */
      }
    }

    const { jobId } = await startPlusAIPresentation({
      topic: agentBrief || brief || userInput,
      templateId: plan?.templateId || slidesTemplate,
      conversation_id: cid,
      message_id: placeholderId,
      language: lang,
      numberOfSlides: targetCount,
    });

    if (isSlidesRequestCancelled()) {
      clearSlidesTimeout(jobId);
      void failStaleJob(jobId, "Slides generation was cancelled.").catch(() => {});
      return;
    }

    if (placeholderId) {
      try {
        await supabase
          .from("messages")
          .update({
            metadata: {
              kind: "slidesPending",
              topic: userInput,
              templateId: slidesTemplate,
              slidesJobId: jobId,
            } as any,
          })
          .eq("id", placeholderId);
      } catch {
        /* best-effort */
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderId || m.clientId === `assistant-${localTurnId}`
            ? {
                ...m,
                id: placeholderId || m.id,
                slidesJobId: jobId,
                slidesPendingTopic: userInput,
                mode: "slides",
              }
            : m,
        ),
      );
    }

    let narrative = introContent;
    let finalDeck: any = null;
    let finalStandardSlides: any = null;
    setSearchStatus("Starting…");

    await new Promise<void>((resolve) => {
      let unsub: (() => void) | undefined;
      clearSlidesTimeout(jobId);

      // Idle timeout: only fire if the job goes silent for this long with no
      // progress / narrative / output events. A long-but-still-streaming job
      // must not be killed just because the absolute clock ran out.
      const IDLE_TIMEOUT_MS = Math.min(SLIDES_CLIENT_TIMEOUT_MS, 240_000); // 4 min of silence
      const scheduleIdleTimeout = () => {
        clearSlidesTimeout(jobId);
        slidesTimeoutsRef.current[jobId] = window.setTimeout(() => {
          void failStaleJob(jobId, SLIDES_TIMEOUT_MESSAGE);
          if (placeholderId) {
            void supabase
              .from("messages")
              .update({
                content: (narrative || SLIDES_TIMEOUT_MESSAGE).trim(),
                metadata: {
                  kind: "slidesError",
                  topic: userInput,
                  templateId: slidesTemplate,
                } as any,
              })
              .eq("id", placeholderId);
          }
          unsub?.();
          clearSlidesTimeout(jobId);
          setMessages((prev) =>
            prev.map((m) =>
              m.clientId === `assistant-${localTurnId}` ||
              (!!placeholderId && m.id === placeholderId)
                ? {
                    ...m,
                    content: (narrative || SLIDES_TIMEOUT_MESSAGE).trim(),
                    slidesJobId: undefined,
                    mode: "slides",
                  }
                : m,
            ),
          );
          toast.error("Slides generation took too long. Please try again.");
          resolve();
        }, IDLE_TIMEOUT_MS);
      };
      scheduleIdleTimeout();

      unsub = subscribeJob(jobId, {
        onProgress: (_p, phase) => {
          scheduleIdleTimeout();
          if (isSlidesRequestCancelled()) return;
          if (!phase) return;
          const phaseLabels: Record<string, string> = {
            search: "Searching the web",
            findings: "Reviewing findings",
            outline: "Drafting outline",
            content: "Writing slides",
            images: "Selecting images",
            review: "Polishing deck",
            finalize: "Finalizing deck",
          };
          const lbl = phaseLabels[phase];
          setSearchStatus(lbl || "Preparing your deck");
          if (!narrative) setIsThinking(true);
        },
        onDelta: (_chunk, full) => {
          scheduleIdleTimeout();
          if (isSlidesRequestCancelled()) return;
          narrative = full;
          setMessages((prev) =>
            prev.map((m) =>
              m.clientId === `assistant-${localTurnId}` ||
              (!!placeholderId && m.id === placeholderId)
                ? { ...m, content: narrative }
                : m,
            ),
          );
        },
        onOutput: (out) => {
          scheduleIdleTimeout();
          if (isSlidesRequestCancelled()) return;
          if (out?.deck) finalDeck = out.deck;
          if (out?.standardSlides) finalStandardSlides = out.standardSlides;
        },

        onDone: async () => {
          if (isSlidesRequestCancelled()) {
            clearSlidesTimeout(jobId);
            unsub?.();
            resolve();
            return;
          }
          clearSlidesTimeout(jobId);
          if (finalStandardSlides) {
            const ss = finalStandardSlides as {
              title: string;
              templateName: string;
              url: string;
              colors: [string, string];
              slides?: string[];
              slideCount?: number;
            };
            const summaryText = await fetchSlidesNarration({
              mode: "summary",
              topic: slidesTopic,
              kind: "slides",
              title: ss.title,
              slideCount: ss.slideCount ?? ss.slides?.length,
            });
            const finalContent = (narrative || summaryText || "").trim();
            setMessages((prev) =>
              prev.map((m) =>
                m.clientId === `assistant-${localTurnId}` ||
                (!!placeholderId && m.id === placeholderId)
                  ? {
                      ...m,
                      content: finalContent || m.content,
                      standardSlides: ss,
                      slidesJobId: undefined,
                      mode: "slides",
                    }
                  : m,
              ),
            );
            if (placeholderId) {
              try {
                await supabase
                  .from("messages")
                  .update({
                    content: finalContent,
                    metadata: { kind: "standardSlides", standardSlides: ss } as any,
                  })
                  .eq("id", placeholderId);
              } catch {
                /* best-effort */
              }
            }
          } else if (finalDeck) {
            const tpl = findSlidesTemplate(finalDeck.templateId || slidesTemplate);
            const enrichedDeck: SlideDeck & { htmlSlug?: string; variant?: string } = tpl.htmlSlug
              ? { ...finalDeck, templateId: tpl.id, htmlSlug: tpl.htmlSlug, variant: tpl.variant }
              : finalDeck;
            const summaryText = await fetchSlidesNarration({
              mode: "summary",
              topic: slidesTopic,
              kind: "slides",
              title: enrichedDeck.title || slidesTopic.slice(0, 80),
              slideCount: enrichedDeck.slides?.length,
            });
            const finalContent = (narrative || summaryText || "").trim();
            setMessages((prev) =>
              prev.map((m) =>
                m.clientId === `assistant-${localTurnId}` ||
                (!!placeholderId && m.id === placeholderId)
                  ? {
                      ...m,
                      content: finalContent || m.content,
                      slidesDeck: enrichedDeck,
                      slidesJobId: undefined,
                      mode: "slides",
                    }
                  : m,
              ),
            );
            if (placeholderId) {
              try {
                await supabase
                  .from("messages")
                  .update({
                    content: finalContent,
                    metadata: { kind: "slidesDeck", slidesDeck: enrichedDeck } as any,
                  })
                  .eq("id", placeholderId);
              } catch {
                /* best-effort */
              }
            }
          } else {
            if (placeholderId) {
              void supabase
                .from("messages")
                .update({
                  content: "Slides generation finished without a deck. Please try again.",
                  metadata: {
                    kind: "slidesError",
                    topic: userInput,
                    templateId: slidesTemplate,
                  } as any,
                })
                .eq("id", placeholderId);
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.clientId === `assistant-${localTurnId}` ||
                (!!placeholderId && m.id === placeholderId)
                  ? {
                      ...m,
                      content: "Slides generation finished without a deck. Please try again.",
                      slidesJobId: undefined,
                      mode: "slides",
                    }
                  : m,
              ),
            );
            toast.error("Slides generation failed");
          }
          unsub?.();
          resolve();
        },
        onError: async (msg) => {
          if (isSlidesRequestCancelled()) {
            clearSlidesTimeout(jobId);
            unsub?.();
            resolve();
            return;
          }
          clearSlidesTimeout(jobId);

          // The external presentation provider can be unavailable (401 / quota).
          // Fall back to rendering the approved plan locally so the user still
          // gets a deck instead of a dead end.
          let fallbackDeck: SlideDeck | null = null;
          try {
            const { buildLocalDeck, buildDeckFromPlan } = await import("@/lib/slides/localDeck");
            fallbackDeck = plan?.outline?.steps?.length ? buildDeckFromPlan(plan) : null;
            if (!fallbackDeck) {
              fallbackDeck = await buildLocalDeck({
                topic: slidesTopic,
                brief,
                templateId: slidesTemplate,
                language: isArabic ? "ar" : "en",
                userId: chatUserId || undefined,
              });
            }
          } catch {
            fallbackDeck = null;
          }


          if (fallbackDeck) {
            const tpl = findSlidesTemplate(fallbackDeck.templateId || slidesTemplate);
            const enrichedDeck: SlideDeck & { htmlSlug?: string; variant?: string } = tpl.htmlSlug
              ? { ...fallbackDeck, templateId: tpl.id, htmlSlug: tpl.htmlSlug, variant: tpl.variant }
              : fallbackDeck;
            const finalContent = (
              narrative ||
              (`Generated ${enrichedDeck.slides.length} slides.`)
            ).trim();
            if (placeholderId) {
              void supabase
                .from("messages")
                .update({
                  content: finalContent,
                  metadata: { kind: "slidesDeck", slidesDeck: enrichedDeck } as any,
                })
                .eq("id", placeholderId);
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.clientId === `assistant-${localTurnId}` ||
                (!!placeholderId && m.id === placeholderId)
                  ? {
                      ...m,
                      content: finalContent,
                      slidesDeck: enrichedDeck,
                      slidesJobId: undefined,
                      mode: "slides",
                    }
                  : m,
              ),
            );
            unsub?.();
            resolve();
            return;
          }

          if (placeholderId) {
            void supabase
              .from("messages")
              .update({
                content: `Could not create the presentation: ${msg}`,
                metadata: {
                  kind: "slidesError",
                  topic: userInput,
                  templateId: slidesTemplate,
                } as any,
              })
              .eq("id", placeholderId);
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.clientId === `assistant-${localTurnId}` ||
              (!!placeholderId && m.id === placeholderId)
                ? {
                    ...m,
                    content: `Could not create the presentation: ${msg}`,
                    slidesJobId: undefined,
                    mode: "slides",
                  }
                : m,
            ),
          );
          toast.error(`Slides error: ${msg}`);
          unsub?.();
          resolve();
        },

        onStale: async (row) => {
          if (isSlidesRequestCancelled()) {
            clearSlidesTimeout(jobId);
            unsub?.();
            resolve();
            return;
          }
          clearSlidesTimeout(jobId);
          try {
            await failStaleJob(jobId, "Slides generation stopped unexpectedly. Please try again.");
          } catch {
            /* ignore */
          }
          const partial = (row.stream_text || narrative || "").trim();
          if (placeholderId) {
            void supabase
              .from("messages")
              .update({
                content: partial || "Slides generation stopped unexpectedly. Please try again.",
                metadata: {
                  kind: "slidesError",
                  topic: userInput,
                  templateId: slidesTemplate,
                } as any,
              })
              .eq("id", placeholderId);
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.clientId === `assistant-${localTurnId}`
                ? {
                    ...m,
                    content: partial || "Slides generation stopped unexpectedly. Please try again.",
                    slidesJobId: undefined,
                  }
                : m,
            ),
          );
          toast.error("Slides generation stopped unexpectedly. Please try again.");
          unsub?.();
          resolve();
        },
      });
    });
  } catch (e) {
    console.error(e);
    toast.error("Slides generation error");
  } finally {
    setIsLoading(false);
    setIsThinking(false);
    resetToolUi();
  }
}
