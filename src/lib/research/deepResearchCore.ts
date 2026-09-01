/** Server-only Deep Research proxy. The model plans, searches the live web,
 * cross-checks evidence, and writes the cited report in one streamed run. */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/responses";
const RESEARCH_MODEL = "openai/gpt-5.5";

type ResearchPayload = {
  query?: string;
  context?: string;
  depth?: string;
};

function errorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const record = data as Record<string, unknown>;
  const nested = record.error && typeof record.error === "object"
    ? (record.error as Record<string, unknown>).message
    : undefined;
  return String(record.message ?? nested ?? fallback);
}

function researchInstructions(query: string, depth: string): string {
  const Arabic = /[\u0600-\u06FF]/.test(query);
  const scale =
    depth === "pro"
      ? { searches: "at least 5", words: "at least 1,500 words", sections: "4-6" }
      : depth === "ultra8x" || depth === "ultra4x"
        ? { searches: "at least 12", words: "at least 4,000 words", sections: "8-12" }
        : depth === "ultra2x"
          ? { searches: "at least 8", words: "at least 2,800 words", sections: "6-9" }
          : { searches: "at least 6", words: "at least 2,200 words", sections: "5-8" };
  const depthGuide =
    depth === "ultra8x" || depth === "ultra4x"
      ? "Search exhaustively from many independent angles and prioritize primary sources."
      : depth === "ultra2x"
        ? "Search broadly, compare conflicting accounts, and prioritize primary sources."
        : "Search deeply enough to support every important factual claim.";

  return [
    "You are Megsy Deep Research, an autonomous research analyst.",
    depthGuide,
    `Run ${scale.searches} distinct live web searches before writing. Plan the investigation internally, follow promising leads, and cross-check dates, names, numbers, and disputed claims across independent sources.`,
    "Prefer primary, official, academic, and established editorial sources. Use secondary sources only when they add necessary context.",
    `Write a long-form, exhaustive report of ${scale.words}. A short or superficial answer is a failed task — never compress the findings into a brief summary.`,
    `Structure the report as: a single specific editorial # title written by you (never use "Deep Research" or "بحث عميق" in it), a short descriptive standfirst, then ${scale.sections} thematic ## sections with ### subsections where useful, and a comparison table whenever items, figures, or timelines are compared. Do not number headings.`,
    "Every section must contain specific facts: exact dates, names, numbers, quotes, and documented events. Never use generic filler, invented facts, placeholder prose, or unsupported conclusions.",
    "Cite factual claims using the citations returned by web search. Finish with a Sources section listing every source actually used as markdown links; the reader UI will move all links and citation markers out of the prose.",
    "When live search returns a direct, authentic, non-logo image URL that clearly depicts the exact subject, place exactly one markdown image immediately below the title. Never invent an image URL and never use a generic or decorative image.",
    "Explicitly identify uncertainty or disagreement between sources. If evidence is insufficient, say exactly what could not be verified instead of pretending the research succeeded.",
    `Write the complete report in ${Arabic ? "Arabic" : "the same language as the user's request"}.`,
  ].join("\n");
}

export async function streamDeepResearch(
  payload: ResearchPayload,
  request?: Request,
): Promise<Response> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Deep Research is not configured." }, { status: 500 });
  }

  const query = String(payload.query ?? "").trim();
  const context = String(payload.context ?? "").trim();
  const depth = String(payload.depth ?? "ultra");
  if (query.length < 3) {
    return Response.json({ error: "Enter a research topic." }, { status: 400 });
  }
  if (query.length > 20_000 || context.length > 20_000) {
    return Response.json({ error: "The research request is too large." }, { status: 400 });
  }

  const priorRunId = request?.headers.get("X-Lovable-AIG-Run-ID");
  const input = context
    ? `${query}\n\nConversation context for disambiguation only:\n${context}`
    : query;

  const upstream = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
      ...(priorRunId ? { "X-Lovable-AIG-Run-ID": priorRunId } : {}),
    },
    body: JSON.stringify({
      model: RESEARCH_MODEL,
      stream: true,
      instructions: researchInstructions(query, depth),
      input,
      tools: [{ type: "web_search_preview" }],
      reasoning: {
        effort:
          depth === "pro"
            ? "low"
            : depth === "ultra8x" || depth === "ultra4x"
              ? "high"
              : "medium",
        summary: "auto",
      },
      include: ["reasoning.encrypted_content"],
      store: false,
      max_output_tokens:
        depth === "pro"
          ? 10_000
          : depth === "ultra8x" || depth === "ultra4x"
            ? 48_000
            : depth === "ultra2x"
              ? 32_000
              : 24_000,
    }),
    signal: request?.signal,
  });

  if (!upstream.ok || !upstream.body) {
    const data = await upstream.json().catch(() => null);
    const message = errorMessage(data, `Deep Research failed (${upstream.status}).`);
    return Response.json(
      {
        error: message,
        retryable: upstream.status === 429 || upstream.status >= 500,
      },
      {
        status: upstream.status,
        headers: upstream.headers.get("Retry-After")
          ? { "Retry-After": String(upstream.headers.get("Retry-After")) }
          : undefined,
      },
    );
  }

  const runId = upstream.headers.get("X-Lovable-AIG-Run-ID") ?? priorRunId;
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      ...(runId ? { "X-Lovable-AIG-Run-ID": runId } : {}),
    },
  });
}