/**
 * @doc Specialist sub-agents.
 *
 * The main agent is a manager: instead of doing every kind of work itself with
 * one prompt, it delegates a bounded sub-task to a specialist that has its own
 * role prompt and its own slice of the tool catalog, then reads the specialist's
 * report and continues. This is what makes broad, open-ended requests finish:
 * research, coding, data and writing run as separate focused loops.
 *
 * Sub-agents are deliberately bounded (step cap, no nested spawning) so a run
 * can never fan out forever.
 */
import { askJson } from "@/lib/agentkernel/llm";
import type { ToolContext, ToolResult } from "@/lib/agentkernel/tools";
import { renderTools, searchCatalog } from "./catalog";
import { runCatalogTool, type RunToolOptions } from "./runtime";

export interface SubAgentSpec {
  slug: string;
  name: string;
  /** Plain-language description the manager matches a sub-task against. */
  purpose: string;
  /** Catalog search seeds used to build this specialist's starting toolbox. */
  toolSeeds: string[];
  system: string;
  maxSteps: number;
}

export const SUBAGENTS: SubAgentSpec[] = [
  {
    slug: "researcher",
    name: "Deep Researcher",
    purpose: "Multi-source web research, fact-checking, market and competitor intel, news timelines.",
    toolSeeds: ["web search", "news", "scrape extract", "wikipedia", "market_research"],
    system:
      "You are a deep research specialist. Search several angles, open the actual pages, cross-check every claim in at least two sources, and keep the publication date of each fact. Report findings with numbers, dates and URLs. Never present an older item as current.",
    maxSteps: 10,
  },
  {
    slug: "analyst",
    name: "Data Analyst",
    purpose: "Datasets, spreadsheets, SQL, statistics, forecasting, charts and metrics.",
    toolSeeds: ["dataframe", "sql query", "sheet", "kaggle", "worldbank"],
    system:
      "You are a data analyst. Load or reconstruct the data, compute with sandboxed code instead of guessing, state your method, and report concrete numbers with units and time ranges. Flag data quality problems explicitly.",
    maxSteps: 10,
  },
  {
    slug: "engineer",
    name: "Software Engineer",
    purpose: "Reading and changing code, GitHub repositories, builds, tests, debugging, deploys.",
    toolSeeds: ["devbox", "github", "sandbox run_js", "security dependency_scan", "vercel"],
    system:
      "You are a senior engineer. Read the real files before editing, make the smallest correct change, then run the build and tests and read the output. Never claim something works without evidence from a command you ran.",
    maxSteps: 14,
  },
  {
    slug: "operator",
    name: "Web Operator",
    purpose: "Doing things on websites: sign-ups, logins, forms, bookings, purchases, portals.",
    toolSeeds: ["identity login", "browser", "flights search", "gov form", "mail verify_code"],
    system:
      "You operate real websites through the cloud browser. Use login_identity for credentials and check_mail for verification codes. Report each screen you reached. Stop and ask only for payments, CAPTCHAs or irreversible actions.",
    maxSteps: 14,
  },
  {
    slug: "writer",
    name: "Editor & Writer",
    purpose: "Reports, articles, documents, slides, translation and final polish.",
    toolSeeds: ["writing draft", "content blog_post", "office write_doc", "translate"],
    system:
      "You are an editor. Produce finished, self-contained prose in the user's language with a clear title and sections. No filler, no meta-commentary, no repeated summaries, and never mix languages inside one document.",
    maxSteps: 8,
  },
  {
    slug: "growth",
    name: "Growth & SEO",
    purpose: "SEO audits, keywords, ads, funnels, analytics and campaign work.",
    toolSeeds: ["seo audit", "seo keywords", "ga4 report", "ads campaigns", "email_marketing"],
    system:
      "You are a growth specialist. Measure before recommending, quantify every recommendation with expected impact and effort, and prioritise a short ranked action list.",
    maxSteps: 10,
  },
  {
    slug: "finance",
    name: "Finance Analyst",
    purpose: "Markets, pricing, invoices, budgets, subscriptions and financial modelling.",
    toolSeeds: ["stocks quote", "crypto quote", "forex convert", "accounting pnl", "stripe invoices"],
    system:
      "You are a finance analyst. Always state currency, date and source for any figure, compute with code rather than estimating, and separate facts from assumptions in your model.",
    maxSteps: 10,
  },
  {
    slug: "reviewer",
    name: "Critic & QA",
    purpose: "Reviewing another agent's output for gaps, errors, stale facts and missing sources.",
    toolSeeds: ["evals score", "evals citation_check", "web fact_check"],
    system:
      "You are a strict reviewer. List concrete defects only: wrong or unsourced claims, stale dates, missing parts of the request, language mixing. End with VERDICT: PASS or VERDICT: REWORK plus the exact next actions.",
    maxSteps: 6,
  },
];

const BY_SLUG = new Map(SUBAGENTS.map((a) => [a.slug, a]));

export function getSubAgent(slug: string): SubAgentSpec | undefined {
  return BY_SLUG.get(slug.trim().toLowerCase());
}

/** Roster the manager sees in its system prompt. */
export function renderSubAgents(): string {
  return SUBAGENTS.map((a) => `- ${a.slug} (${a.name}): ${a.purpose}`).join("\n");
}

function toolbox(spec: SubAgentSpec): string {
  const seen = new Set<string>();
  const tools = spec.toolSeeds
    .flatMap((seed) => searchCatalog(seed, 6))
    .filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
  return renderTools(tools);
}

interface SubStep {
  thought?: string;
  tool?: string;
  args?: Record<string, any>;
  report?: string;
}

export interface SubAgentRun {
  slug: string;
  report: string;
  steps: { tool: string; ok: boolean; output: string }[];
}

/**
 * Runs one specialist to completion (or to its step cap) and returns its report
 * plus the trace, so the manager can judge the work instead of trusting it.
 */
export async function runSubAgent(
  slug: string,
  task: string,
  opts: RunToolOptions & { ctx: ToolContext; onStep?: (label: string, detail: string) => void },
): Promise<SubAgentRun> {
  const spec = getSubAgent(slug);
  if (!spec) {
    return {
      slug,
      report: `Unknown sub-agent "${slug}". Available: ${SUBAGENTS.map((a) => a.slug).join(", ")}.`,
      steps: [],
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const system = `${spec.system}

Today is ${today}. The current year is ${new Date().getUTCFullYear()} — never treat older material as current.
You work alone on ONE sub-task and cannot spawn other agents.
Reply with JSON only, one action at a time:
{"thought":"one short sentence","tool":"tool_search|<catalog tool id>","args":{...}}
or, when the sub-task is done:
{"report":"your findings/result, self-contained, with numbers, dates and sources"}
Use tool_search with a plain-language need when you don't know a tool id: {"tool":"tool_search","args":{"need":"..."}}
Your starting toolbox:
${toolbox(spec)}`;

  const trace: string[] = [`SUB-TASK: ${task}`];
  const steps: SubAgentRun["steps"] = [];

  for (let i = 0; i < spec.maxSteps; i++) {
    const action = await askJson<SubStep>(system, [
      { role: "user", content: `${trace.join("\n").slice(-12_000)}\n\nNext action?` },
    ]);
    if (!action) break;
    if (action.report) {
      return { slug: spec.slug, report: action.report, steps };
    }
    const tool = String(action.tool ?? "").trim();
    if (!tool) break;

    let result: ToolResult;
    if (tool === "tool_search") {
      const { searchToolsFor } = await import("./runtime");
      result = searchToolsFor(String(action.args?.need ?? task));
    } else {
      result = await runCatalogTool(tool, action.args ?? {}, opts);
    }

    steps.push({ tool, ok: result.ok, output: result.output.slice(0, 2_000) });
    opts.onStep?.(`${spec.name}: ${tool}`, result.output.slice(0, 1_200));
    trace.push(
      `STEP ${i + 1} ${tool} -> ${result.ok ? "ok" : "failed"}\n${result.output.slice(0, 4_000)}`,
    );
  }

  // Cap reached: force a report out of what was gathered rather than losing it.
  const forced = await askJson<SubStep>(
    `${spec.system}\nWrite the final report for this sub-task from the trace below. JSON only: {"report":"..."}`,
    [{ role: "user", content: trace.join("\n").slice(-12_000) }],
  );
  return {
    slug: spec.slug,
    report: forced?.report || trace.slice(-3).join("\n"),
    steps,
  };
}
