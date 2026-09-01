import { supabase } from "@/integrations/supabase/client";
import { resumeJob, failStaleJob } from "@/lib/jobs/client";
import { findSlidesTemplate } from "@/lib/slidesTemplates";
import type { SlideDeck } from "@/components/chat/SlidesDeckCard";
import { SLIDES_CLIENT_TIMEOUT_MS, SLIDES_TIMEOUT_MESSAGE } from "../chatUtils";
import type { Message } from "../chatConstants";

interface Args {
  msgs: any[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  slidesTimeoutsRef: React.MutableRefObject<Record<string, number>>;
  clearSlidesTimeout: (jobId: string) => void;
}

/**
 * Re-attaches to any in-flight `slidesPending` background jobs found in
 * the freshly loaded messages. Each resumed job:
 *  - Streams narrative deltas into the placeholder bubble
 *  - On `onOutput` swaps in the finished deck + persists `slidesDeck`
 *  - Arms a hard client-side timeout to mark stalled jobs as errored
 *  - Reports onError / onStale into the UI and DB consistently
 * Best-effort — caller-side try/catch is enough; we never throw.
 */
export async function resumeSlidesJobs({
  msgs,
  setMessages,
  slidesTimeoutsRef,
  clearSlidesTimeout,
}: Args): Promise<void> {
  try {
    for (const m of msgs) {
      const meta = (m.metadata || {}) as any;
      if (meta?.kind !== "slidesPending" || !meta?.slidesJobId) continue;
      const jobId = meta.slidesJobId as string;
      const messageId = m.id as string;
      let narrative = "";
      clearSlidesTimeout(jobId);
      let unsubscribe: (() => void) | undefined;

      slidesTimeoutsRef.current[jobId] = window.setTimeout(() => {
        void failStaleJob(jobId, SLIDES_TIMEOUT_MESSAGE);
        void supabase
          .from("messages")
          .update({
            content: (narrative || SLIDES_TIMEOUT_MESSAGE).trim(),
            metadata: {
              kind: "slidesError",
              topic: meta.topic,
              templateId: meta.templateId,
            } as any,
          })
          .eq("id", messageId);
        unsubscribe?.();
        clearSlidesTimeout(jobId);
        setMessages((prev) =>
          prev.map((x) =>
            x.id === messageId
              ? {
                  ...x,
                  content: (narrative || SLIDES_TIMEOUT_MESSAGE).trim(),
                  slidesJobId: undefined,
                  mode: "slides",
                }
              : x,
          ),
        );
      }, SLIDES_CLIENT_TIMEOUT_MS);

      unsubscribe = resumeJob(jobId, {
        onDelta: (_chunk, full) => {
          narrative = full;
          setMessages((prev) =>
            prev.map((x) => (x.id === messageId ? { ...x, content: full } : x)),
          );
        },
        onOutput: async (out) => {
          clearSlidesTimeout(jobId);
          if (out?.standardSlides) {
            const ss = out.standardSlides as {
              title: string;
              templateName: string;
              url: string;
              colors: [string, string];
              slides?: string[];
              slideCount?: number;
            };
            setMessages((prev) =>
              prev.map((x) =>
                x.id === messageId
                  ? { ...x, standardSlides: ss, slidesJobId: undefined, mode: "slides" }
                  : x,
              ),
            );
            try {
              await supabase
                .from("messages")
                .update({
                  content:
                    narrative ||
                    `Generated ${ss.slideCount ?? ss.slides?.length ?? ""} slides`.trim(),
                  metadata: { kind: "standardSlides", standardSlides: ss } as any,
                })
                .eq("id", messageId);
            } catch {
              /* best-effort */
            }
            return;
          }
          if (!out?.deck) return;
          const tpl = findSlidesTemplate(out.deck.templateId || meta.templateId);
          const enrichedDeck: SlideDeck & { htmlSlug?: string; variant?: string } = tpl.htmlSlug
            ? {
                ...out.deck,
                templateId: tpl.id,
                htmlSlug: tpl.htmlSlug,
                variant: tpl.variant,
              }
            : out.deck;
          setMessages((prev) =>
            prev.map((x) =>
              x.id === messageId
                ? { ...x, slidesDeck: enrichedDeck, slidesJobId: undefined, mode: "slides" }
                : x,
            ),
          );
          try {
            await supabase
              .from("messages")
              .update({
                content: narrative || `Generated ${enrichedDeck.slides.length} slides`,
                metadata: { kind: "slidesDeck", slidesDeck: enrichedDeck } as any,
              })
              .eq("id", messageId);
          } catch {
            /* best-effort */
          }
        },
        onError: async (msg) => {
          clearSlidesTimeout(jobId);
          // Provider unavailable → render the deck locally instead of failing.
          try {
            const { buildLocalDeck } = await import("@/lib/slides/localDeck");
            const deck = await buildLocalDeck({
              topic: String(meta.topic || ""),
              templateId: meta.templateId,
            });
            if (deck) {
              setMessages((prev) =>
                prev.map((x) =>
                  x.id === messageId
                    ? { ...x, slidesDeck: deck, slidesJobId: undefined, mode: "slides" }
                    : x,
                ),
              );
              void supabase
                .from("messages")
                .update({
                  content: `Generated ${deck.slides.length} slides`,
                  metadata: { kind: "slidesDeck", slidesDeck: deck } as any,
                })
                .eq("id", messageId);
              return;
            }
          } catch {
            /* fall through to error state */
          }
          void supabase
            .from("messages")
            .update({
              content: `Could not create the presentation: ${msg}`,
              metadata: {
                kind: "slidesError",
                topic: meta.topic,
                templateId: meta.templateId,
              } as any,
            })
            .eq("id", messageId);
          setMessages((prev) =>
            prev.map((x) =>
              x.id === messageId
                ? {
                    ...x,
                    content: `Could not create the presentation: ${msg}`,
                    slidesJobId: undefined,
                    mode: "slides",
                  }
                : x,
            ),
          );
        },

        onStale: async (row) => {
          clearSlidesTimeout(jobId);
          try {
            await failStaleJob(jobId, "Slides generation stopped unexpectedly. Please try again.");
          } catch {
            /* ignore */
          }
          const partial = (row.stream_text || narrative || "").trim();
          void supabase
            .from("messages")
            .update({
              content: partial || "Slides generation stopped unexpectedly. Please try again.",
              metadata: {
                kind: "slidesError",
                topic: meta.topic,
                templateId: meta.templateId,
              } as any,
            })
            .eq("id", messageId);
          setMessages((prev) =>
            prev.map((x) =>
              x.id === messageId
                ? {
                    ...x,
                    content: partial || "Slides generation stopped unexpectedly. Please try again.",
                    slidesJobId: undefined,
                  }
                : x,
            ),
          );
        },
      });
    }
  } catch (e) {
    console.warn("[slides] resume failed", e);
  }
}
