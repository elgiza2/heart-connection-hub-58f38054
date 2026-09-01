/**
 * @doc Server-only Dev Agent loop: Router → Planner → Coder → Verifier.
 *
 * Every invocation advances one bounded slice so it always fits inside a
 * serverless request; the client keeps calling `step` until the run is done.
 * State lives entirely in `dev_runs` / `dev_tasks` / `dev_events`, so a slice
 * can resume on a completely different worker.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { FreestyleClient } from "./freestyle";
import { DevWorkspace, runTool, screenshotUrl, type ToolCall } from "./tools";
import { askJson, askModel, lastModelError } from "./llm";
import { loadProjectContext } from "../agent/projectContext";

import {
  ensurePrivateGithubRepo,
  restoreWorkspaceFromGithub,
  saveFileToGithub,
  saveWorkspaceToGithub,
} from "./githubStorage";

// The coder model needs 50-130s per reply, so a slice must be able to hold
// at least one full call (the API route allows 300s).
const SLICE_MS = 240_000;
const MAX_TOOLS_PER_SLICE = 14;
const MAX_BUILD_FIXES = 5;


export type Intent = "create" | "edit" | "question" | "deploy";

const ROUTER_SYSTEM = `You classify a user's request to a coding agent. Reply with JSON only:
{"intent":"create|edit|question|deploy","title":"<short project title>","github_url":"<url or null>"}
- "create": a brand new app/project.
- "edit": change, add to, or fix an existing project.
- "deploy": the user explicitly asks to publish / deploy / go live.
- "question": they only ask something, no code change needed.
Set github_url when the user asks to import an existing GitHub repository.`;

/**
 * Shared design bar for planner + coder. Inspired by the motion-first
 * landing/app aesthetic (motionsites.ai): dark cinematic surfaces, glass,
 * gradient accents, real content, and framer-motion everywhere.
 */
const DESIGN_SYSTEM = `DESIGN BAR (non-negotiable):
- The result must look like a real, shipped product — never a placeholder page,
  never a single heading on an empty background.
- Motion-first: use framer-motion (already installed) for entrance animations,
  hover/tap states, staggered lists, scroll reveals and page transitions.
- Visual language: dark cinematic base, glassmorphism panels
  (backdrop-blur + white/5 borders), soft gradient accents, generous spacing,
  rounded-2xl cards, lucide-react icons, real typographic hierarchy.
- Never default Inter-on-white with purple gradients. Pick one distinctive
  palette per project and define it as CSS variables in src/index.css.
- src/index.css MUST start with the three lines "@tailwind base;",
  "@tailwind components;", "@tailwind utilities;" before anything else —
  removing them kills every Tailwind class in the app. Layout, spacing and
  color come from Tailwind classes, not from hand-written CSS rules.
- Full app, not a hero: navigation/sidebar, several routed screens or sections,
  interactive state (search, filters, playback, forms), empty/loading states,
  responsive down to 375px.
- Fill with realistic mock data (10-30 items with names, images via
  https://picsum.photos/seed/<slug>/400/400, durations, prices, etc.).
- Accessibility: semantic HTML, alt text, keyboard-focusable controls.`;

const PLANNER_SYSTEM = `You are the planner of an autonomous full-stack coding agent working in a real Linux VM
with a React 18 + Vite + TypeScript + Tailwind project.
Break the user's request into 8-14 concrete engineering tasks. Reply with JSON only:
{"tasks":["...","..."]}
Each task must be independently verifiable and touch real files. No task about deploying.
Plan a COMPLETE, multi-page product, in this order:
1. design tokens in src/index.css + shared layout shell (sidebar/header, routes in src/App.tsx)
2. shared data layer: src/data/*.ts with 20-40 realistic mock records
3. ONE task per page — at least 4 routed pages under src/pages (e.g. Home, Browse/Explore,
   Detail, Search, Library/Profile/Settings). Never merge two pages into one task.
4. reusable components (cards, lists, player/detail panel, empty + loading states)
5. polish: framer-motion transitions, responsive down to 375px, real <title>/meta.
A single landing page is a FAILED plan.

${DESIGN_SYSTEM}`;

const CODER_SYSTEM = `You are the coder of an autonomous agent working inside a real Linux VM on a
React 18 + Vite + TypeScript + Tailwind project at /app.

Reply with ONE tool call in this exact line format — never JSON, never markdown fences:

TOOL: write_file
PATH: src/components/Sidebar.tsx
BODY:
<the complete file content, raw code>
<<<END>>>

Other tools (single line each, no BODY):
TOOL: bash
CMD: npm install zustand
<<<END>>>

TOOL: read_file
PATH: src/App.tsx
<<<END>>>

TOOL: list_dir
PATH: src
<<<END>>>

TOOL: search_files
QUERY: useCart\(
PATH: src
<<<END>>>

TOOL: git
CMD: status
<<<END>>>

TOOL: delete_file
PATH: src/old.tsx
<<<END>>>

TOOL: typecheck
<<<END>>>

TOOL: run_tests
<<<END>>>

TOOL: build
<<<END>>>

TOOL: done
SUMMARY: <what you changed>
<<<END>>>


Always finish with the literal line <<<END>>>. If your reply gets cut off before it,
you will be asked to continue exactly where you stopped — continue with raw code only.

KNOWN SCAFFOLD (never read or inspect these — they are already correct):
package.json, index.html, vite.config.js, tailwind.config.cjs, postcss.config.cjs,
src/main.tsx (mounts <App/> and imports src/index.css), src/App.tsx, src/index.css.
Tailwind, framer-motion, lucide-react, clsx and react-router-dom are installed.

Rules:
- START WRITING IMMEDIATELY. Do not explore the project. read_file/list_dir are almost
  never needed, and never on the scaffold files above.
- ONE tool per reply. Keep every file under ~120 lines; split big screens into small
  components written over consecutive replies. App.tsx holds routes only.
- write_file always contains the COMPLETE final file, never a diff or placeholder.
- Every component file must have a \`export default\` at the end.
- <BrowserRouter> is mounted exactly once, in src/App.tsx. Never put a Router
  inside a screen, layout or component file.
- Only import files that already exist or that you have written in this task.
- Install any other package you import, with bash, before using it.
- Do not repeat a file you already wrote; move on or call done.
- Use search_files (not read_file) when you need to locate an existing symbol
  inside a project you did not scaffold yourself.
- Never touch credential files: .env, .npmrc, .ssh, git config. Never print
  environment variables.

- NEVER call done before you have written at least one real file for the CURRENT
  task. A page task is only done when the page renders a full screen of content
  (header, real mock data list/grid, interactive state) — not a heading.
- Pages live in src/pages/<Name>.tsx and are routed from src/App.tsx; shared mock
  data lives in src/data/*.ts so every page reads from it.
- Exception to the scaffold rule: rewrite index.html once to set a real
  <title> and <meta name="description"> for the product (keep the
  <div id="root"> and the /src/main.tsx script tag unchanged).
- Never delete the @tailwind directives at the top of src/index.css.

${DESIGN_SYSTEM}`;

interface RunRow {
  id: string;
  user_id: string;
  project_id: string | null;
  prompt: string;
  intent: string | null;
  status: string;
  step: number | null;
  allow_deploy: boolean | null;
  vm_id: string | null;
}

interface ProjectRow {
  id: string;
  vm_id: string | null;
  repo_id: string | null;
  preview_url: string | null;
  deploy_url: string | null;
  name: string | null;
  status: string | null;
  github_repo: string | null;
  deployed_commit: string | null;
}

async function event(
  db: SupabaseClient,
  run: RunRow,
  type: string,
  title: string,
  payload?: unknown,
) {
  await db.from("dev_events").insert({
    run_id: run.id,
    user_id: run.user_id,
    type,
    title: title.slice(0, 300),
    payload: payload ? (payload as Record<string, unknown>) : null,
  });
}

async function patchRun(db: SupabaseClient, run: RunRow, patch: Record<string, unknown>) {
  await db
    .from("dev_runs")
    .update({ ...patch, last_heartbeat_at: new Date().toISOString() })
    .eq("id", run.id);
}

/** Explicit deploy intent — deploying costs money, so we never guess. */
export function wantsDeploy(text: string): boolean {
  return /\b(deploy|publish|go\s*live|ship it)\b/i.test(text) ||
    /(انشر|أنشر|نشر|ارفع|إرفع|رفع الموقع|على الهوا|علي الهوا|لايف)/.test(text);
}

export async function classify(token: string, prompt: string) {
  const res = await askJson<{ intent?: Intent; title?: string; github_url?: string | null }>(
    token,
    ROUTER_SYSTEM,
    [{ role: "user", content: prompt }],
  );
  return {
    intent: (res?.intent ?? "edit") as Intent,
    title: res?.title?.slice(0, 80) || "Project",
    githubUrl: res?.github_url && /^https?:\/\//.test(res.github_url) ? res.github_url : null,
  };
}

async function plan(token: string, prompt: string, tree: string): Promise<string[]> {
  const res = await askJson<{ tasks?: string[] }>(token, PLANNER_SYSTEM, [
    {
      role: "user",
      content: `REQUEST:\n${prompt}\n\nCURRENT PROJECT FILES:\n${tree || "(empty project)"}`,
    },
  ]);
  const tasks = (res?.tasks ?? []).filter((t) => typeof t === "string" && t.trim()).slice(0, 14);
  return tasks.length ? tasks : [prompt];
}

/**
 * Parses the coder's line protocol. Tolerates a missing trailing `<<<END>>>`
 * (a cut-off reply still yields the partial file, which is better than nothing),
 * stray markdown fences, and models that answer with a JSON tool call instead.
 *
 * The old 4-block cap silently dropped work when a model batched more calls;
 * the cap now matches the executor's per-slice budget.
 */
export function parseToolReply(
  raw: string,
  maxCalls = MAX_TOOLS_PER_SLICE,
): (ToolCall & { summary?: string })[] {
  if (!raw) return [];
  const text = raw.replace(/```[a-zA-Z]*\n?/g, "");
  const blocks = text.split("<<<END>>>").map((b) => b.trim()).filter(Boolean);
  const calls: (ToolCall & { summary?: string })[] = [];
  for (const block of blocks) {
    const toolMatch = block.match(/^\s*TOOL:\s*(\w+)\s*$/m);
    if (!toolMatch) continue;
    const tool = toolMatch[1] as ToolCall["tool"];
    const path = block.match(/^\s*PATH:\s*(.+)$/m)?.[1]?.trim();
    const command = block.match(/^\s*CMD:\s*(.+)$/m)?.[1]?.trim();
    const query = block.match(/^\s*QUERY:\s*(.+)$/m)?.[1]?.trim();
    const summary = block.match(/^\s*SUMMARY:\s*([\s\S]*)$/m)?.[1]?.trim();
    let content: string | undefined;
    const bodyIdx = block.indexOf("\nBODY:");
    if (bodyIdx !== -1) {
      content = block.slice(bodyIdx + "\nBODY:".length).replace(/^\n/, "");
    }
    if (tool === "write_file" && (!path || !content)) continue;
    calls.push({ tool, path, command, query, content, summary } as ToolCall & { summary?: string });
    if (calls.length >= maxCalls) break;
  }
  if (!calls.length) {
    const fromJson = parseJsonToolCalls(text);
    if (fromJson.length) return fromJson.slice(0, maxCalls);
  }
  return calls;
}

/** Fallback for models that emit `{"tool":"write_file", ...}` JSON objects. */
function parseJsonToolCalls(text: string): (ToolCall & { summary?: string })[] {
  const calls: (ToolCall & { summary?: string })[] = [];
  const candidates = text.match(/\{[\s\S]*?"tool"\s*:\s*"[\w_]+"[\s\S]*?\}/g) ?? [];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as ToolCall & { summary?: string };
      if (parsed && typeof parsed.tool === "string") calls.push(parsed);
    } catch {
      // Ignore partial/invalid JSON; the text protocol stays authoritative.
    }
  }
  return calls;
}


/**
 * Asks the coder for ONE repair tool call and executes it.
 * Shared by the typecheck, build and runtime-issue repair loops so all three
 * behave identically (continuation on cut-off replies, event logging).
 * Returns true when a tool actually ran.
 */
async function repairWithModel(
  db: SupabaseClient,
  run: RunRow,
  ws: DevWorkspace,
  token: string,
  system: string,
  instruction: string,
  label: string,
): Promise<boolean> {
  let raw = await askModel(token, system, [
    {
      role: "user",
      content: `${instruction}\n\nReply with ONE tool call in the line format, finishing with <<<END>>>.\n\nPROJECT FILES:\n${await ws.tree()}`,
    },
  ]);
  for (let c = 0; c < 4 && raw && !raw.includes("<<<END>>>"); c++) {
    const more = await askModel(token, system, [
      { role: "user", content: "Continue the cut-off reply exactly where it stopped, raw code only, finish with <<<END>>>." },
      { role: "assistant", content: raw.slice(-4000) },
    ]);
    if (!more) break;
    raw += more;
  }
  const fix = parseToolReply(raw)[0];
  if (!fix?.tool || fix.tool === "done") return false;
  const result = await runTool(ws, fix);
  await event(db, run, "tool", `${label} ${fix.tool} ${fix.path ?? ""}`.trim(), {
    ok: result.ok,
    output: result.output.slice(0, 2000),
  });
  return true;
}

/** Runs one bounded slice. Returns true when the whole run is finished. */

export async function advanceDevRun(
  db: SupabaseClient,
  run: RunRow,
  token: string,
): Promise<boolean> {
  const started = Date.now();
  const client = new FreestyleClient(db);

  // ---------------------------------------------------------------- project
  let project: ProjectRow | null = null;
  if (run.project_id) {
    const { data } = await db.from("dev_projects").select("*").eq("id", run.project_id).maybeSingle();
    project = (data as ProjectRow | null) ?? null;
  }
  if (!project) {
    await patchRun(db, run, { status: "error", error: "Project not found" });
    return true;
  }

  // ---------------------------------------------------------------- VM boot
  const boot = await DevWorkspace.boot(client, project.vm_id, project.preview_url);
  const ws = boot.ws;
  if (boot.vmId !== project.vm_id || !project.preview_url) {
    await db
      .from("dev_projects")
      .update({ vm_id: boot.vmId, preview_url: boot.previewUrl, updated_at: new Date().toISOString() })
      .eq("id", project.id);
    project.vm_id = boot.vmId;
    project.preview_url = boot.previewUrl;
  }
  if (!run.vm_id) await patchRun(db, run, { vm_id: boot.vmId });

  // ------------------------------------------------------ private GitHub repo
  if (!project.github_repo) {
    const githubRepo = await ensurePrivateGithubRepo(project.id, project.github_repo);
    await db.from("dev_projects").update({ github_repo: githubRepo }).eq("id", project.id);
    project.github_repo = githubRepo;
  }

  // ---------------------------------------------------------------- scaffold
  if (!(await ws.hasProject())) {
    await event(db, run, "status", "تجهيز المشروع (React 18 + Vite + Tailwind)");
    const meta = (run as unknown as { metadata?: { github_url?: string } }).metadata;
    const githubUrl = meta?.github_url;
    const restored = project.github_repo
      ? await restoreWorkspaceFromGithub(ws, project.github_repo)
      : false;
    // A restore that yields no actual project (e.g. the repo only has its
    // auto-generated README) must fall through to a real scaffold.
    let res: { exitCode: number; stdout: string; stderr: string };
    if (restored && (await ws.hasProject())) {
      res = { exitCode: 0, stdout: "restored from private GitHub storage", stderr: "" };
    } else {
      if (restored) await ws.bash("rm -rf ./* ./.[!.]* 2>/dev/null || true", 30_000);
      res = githubUrl ? await ws.importGithub(githubUrl) : await ws.scaffold();
    }
    if (res.exitCode !== 0 && !(await ws.hasProject())) {
      await event(db, run, "error", "فشل تجهيز المشروع", { output: res.stderr.slice(0, 2000) });
      await patchRun(db, run, { status: "error", error: "Scaffold failed" });
      return true;
    }
    await ws.bash("npm install", 300_000);
    await ws.startDevServer();
    const ready = await ws.isDevServerReady();
    await event(
      db,
      run,
      ready ? "status" : "error",
      ready ? "المشروع جاهز والمعاينة شغالة" : "خادم المعاينة لم يستجب",
      { preview: project.preview_url },
    );
    if (!ready) {
      await patchRun(db, run, { status: "error", error: "Dev server did not start" });
      return true;
    }
  } else {
    // VM reused — make sure dev server is alive and preview URL is current.
    const ready = await ws.isDevServerReady(4);
    if (!ready) {
      await ws.startDevServer();
      await ws.isDevServerReady();
    }
  }

  // ---------------------------------------------------------------- tasks
  const { data: taskRows } = await db
    .from("dev_tasks")
    .select("id,position,title,status")
    .eq("run_id", run.id)
    .order("position", { ascending: true });
  let tasks = (taskRows ?? []) as { id: string; position: number; title: string; status: string }[];

  if (tasks.length === 0) {
    const list = await plan(token, run.prompt, await ws.tree());
    const rows = list.map((title, i) => ({
      run_id: run.id,
      user_id: run.user_id,
      position: i,
      title,
      status: "pending",
    }));
    const { data: inserted } = await db.from("dev_tasks").insert(rows).select("id,position,title,status");
    tasks = (inserted ?? []) as typeof tasks;
    await event(db, run, "plan", `خطة من ${tasks.length} خطوات`, { tasks: list });
  }

  // ---------------------------------------------------------------- coding
  // The project can carry its own rules (AGENTS.md, .agents/skills/*). They
  // were previously ignored at runtime; load them once per slice and append
  // them to the coder system prompt so repo conventions win over defaults.
  let coderSystem = CODER_SYSTEM;
  try {
    const projectContext = await loadProjectContext(ws, run.prompt);
    if (projectContext.prompt) {
      coderSystem = `${CODER_SYSTEM}\n\n${projectContext.prompt}`;
      await event(db, run, "context", "قواعد المشروع محمّلة", {
        ruleFiles: projectContext.ruleFiles,
        skills: projectContext.skills.map((s) => s.name),
      });
    }
  } catch {
    // Context is a bonus, never a blocker.
  }
  const noToolCall = new Map<string, number>();
  /** Files already read this slice — re-reads are the classic stall loop. */
  const readOnce = new Set<string>();
  /** Files written per task — rewriting the same file forever is the other stall. */
  const written = new Map<string, string[]>();
  while (Date.now() - started < SLICE_MS) {

    const task = tasks.find((t) => t.status !== "done" && t.status !== "failed");
    if (!task) break;

    if (task.status === "pending") {
      await db.from("dev_tasks").update({ status: "running" }).eq("id", task.id);
      task.status = "running";
      await event(db, run, "task", task.title);
    }

    const { data: priorEvents } = await db
      .from("dev_events")
      .select("type,title,payload")
      .eq("run_id", run.id)
      .order("created_at", { ascending: true })
      .limit(120);
    const log = (priorEvents ?? [])
      .filter((e) => e.type === "tool")
      .slice(-10)
      .map((e) => {
        const p = (e.payload ?? {}) as { output?: string };
        return `- ${e.title}${p.output ? ` → ${String(p.output).slice(0, 160)}` : ""}`;
      });

    // The coder call itself can take up to ~40s — end the slice early
    // instead of blowing far past SLICE_MS and leaving the client silent.
    if (Date.now() - started > SLICE_MS - 40_000) break;

    const doneFiles = written.get(task.id) ?? [];
    const askCoder = (extra: string, assistantSoFar?: string) =>
      askModel(token, coderSystem, [
        {
          role: "user",
          content: [
            `USER REQUEST: ${run.prompt}`,
            `CURRENT TASK: ${task.title}`,
            `PROJECT FILES:\n${treeText}`,
            log.length ? `RECENT ACTIONS:\n${log.join("\n")}` : "RECENT ACTIONS: (none yet)",
            doneFiles.length
              ? `FILES ALREADY WRITTEN FOR THIS TASK (do NOT rewrite them):\n${doneFiles.join("\n")}`
              : "",
            extra,
          ].filter(Boolean).join("\n\n"),
        },
        ...(assistantSoFar
          ? ([{ role: "assistant", content: assistantSoFar }] as { role: "assistant"; content: string }[])
          : []),
      ]);

    const treeText = await ws.tree();
    let rawReply = await askCoder(
      "Reply with the next tool call in the line format. Finish with <<<END>>>.",
    );
    // Continuation: the model gets cut off mid-file, so ask it to resume from
    // exactly where it stopped instead of throwing the whole file away.
    for (let c = 0; c < 4 && rawReply && !rawReply.includes("<<<END>>>"); c++) {
      const more = await askCoder(
        "Your previous reply was cut off. Continue the file EXACTLY where it stopped — output raw code only, no repetition, no explanations — and finish with <<<END>>>.",
        rawReply.slice(-4000),
      );
      if (!more) break;
      rawReply += more;
    }

    const batch = parseToolReply(rawReply);

    if (batch.length === 0) {
      // A single malformed reply must not kill the whole task — retry a
      // couple of times before giving up on it.
      const misses = (noToolCall.get(task.id) ?? 0) + 1;
      noToolCall.set(task.id, misses);
      await event(db, run, "tool", `invalid model reply (${rawReply.length} chars)`, {
        ok: false,
        output: rawReply.slice(0, 1500) || `(empty response from model) ${lastModelError}`,
      });
      if (misses < 4) continue;
      await db.from("dev_tasks").update({ status: "failed", result: "no tool call" }).eq("id", task.id);
      task.status = "failed";
      continue;
    }
    noToolCall.delete(task.id);

    for (const call of batch) {
      if (call.tool === "done") {
        // Premature done is why generated apps end up as one page: the model
        // "finishes" a screen task without writing a single file. Reject once.
        if ((written.get(task.id) ?? []).length === 0) {
          const skips = (noToolCall.get(`done:${task.id}`) ?? 0) + 1;
          noToolCall.set(`done:${task.id}`, skips);
          if (skips <= 2) {
            await event(db, run, "tool", `rejected early done — ${task.title}`, {
              ok: false,
              output: "You called done without writing any file for this task. Write the real file(s) first.",
            });
            break;
          }
        }
        await db
          .from("dev_tasks")
          .update({ status: "done", result: (call.summary ?? "").slice(0, 1000) })
          .eq("id", task.id);
        task.status = "done";
        await event(db, run, "task_done", task.title, { summary: call.summary ?? null });
        break;
      }

      // Stall guard: the model loves to re-read the same file forever.
      if (call.tool === "read_file" && call.path) {
        if (readOnce.has(call.path)) {
          await event(db, run, "tool", `skip read_file ${call.path}`, {
            ok: false,
            output: "Already read this file in this session — write the file or call done instead.",
          });
          continue;
        }
        readOnce.add(call.path);
      }

      if (call.tool === "write_file" && call.path) {
        const list = written.get(task.id) ?? [];
        if (list.filter((p) => p === call.path).length >= 3) {
          // Fourth attempt at the same file in one task: the model is looping.
          await db
            .from("dev_tasks")
            .update({ status: "done", result: `wrote ${list.length} files` })
            .eq("id", task.id);
          task.status = "done";
          await event(db, run, "task_done", task.title, { summary: "auto-closed (repeat writes)" });
          break;
        }
        list.push(call.path);
        written.set(task.id, list);
      }
      const result = await runTool(ws, call);
      if (result.ok && project.github_repo && call.tool === "write_file" && call.path) {
        try {
          const savedCommit = await saveFileToGithub(
            ws,
            project.github_repo,
            call.path,
            `write_file ${call.path}`,
          );
          await db
            .from("dev_projects")
            .update({ head_commit: savedCommit, updated_at: new Date().toISOString() })
            .eq("id", project.id);
          result.output += `; synced to GitHub (${savedCommit.slice(0, 7)})`;
        } catch (error) {
          result.ok = false;
          result.output = `File was written in the workspace but GitHub sync failed: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      }
      await event(
        db,
        run,
        "tool",
        `${call.tool}${call.path ? ` ${call.path}` : call.command ? ` ${String(call.command).slice(0, 80)}` : ""}`,
        { ok: result.ok, output: result.output.slice(0, 3000), thought: null },
      );
      await patchRun(db, run, { step: (run.step ?? 0) + 1 });
      run.step = (run.step ?? 0) + 1;
    }

    if ((run.step ?? 0) > MAX_TOOLS_PER_SLICE * 40) break; // hard safety stop
  }


  const remaining = tasks.some((t) => t.status !== "done" && t.status !== "failed");
  if (remaining) {
    await patchRun(db, run, { status: "running" });
    return false;
  }

  // --------------------------------------------------- completeness gate
  // All tasks "done" but the app is still a skeleton? Queue one extra round
  // of real tasks instead of shipping a single page. Runs at most twice.
  const { data: gateEvents } = await db
    .from("dev_events")
    .select("id")
    .eq("run_id", run.id)
    .eq("type", "completeness");
  if ((gateEvents?.length ?? 0) < 2 && run.intent !== "question") {
    const gaps = await ws.completenessIssues();
    if (gaps.length) {
      await event(db, run, "completeness", `المشروع ناقص — ${gaps.length} فجوة`, { gaps });
      const extra = gaps.map((gap, i) => ({
        run_id: run.id,
        user_id: run.user_id,
        position: tasks.length + i,
        title: gap.slice(0, 200),
        status: "pending",
      }));
      await db.from("dev_tasks").insert(extra);
      await patchRun(db, run, { status: "running" });
      return false;
    }
  }


  // ---------------------------------------------------------------- verify
  // Stage 1: `tsc --noEmit` catches type errors the Vite build happily
  // ignores (esbuild strips types), and its messages are far more precise
  // than a bundler stack trace, so the repair loop starts here.
  await event(db, run, "status", "فحص الأنواع (TypeScript)");
  let typed = await ws.typecheck();
  for (let i = 0; typed.exitCode !== 0 && i < MAX_BUILD_FIXES; i++) {
    const fixed = await repairWithModel(
      db,
      run,
      ws,
      token,
      coderSystem,
      `TypeScript reported errors. Fix the FIRST one with ONE tool call.\n\nTSC OUTPUT:\n${typed.stdout.slice(-4000)}\n${typed.stderr.slice(-1500)}`,
      "tsc",
    );
    if (!fixed) break;
    typed = await ws.typecheck();
  }
  await event(
    db,
    run,
    "status",
    typed.exitCode === 0 ? "الأنواع سليمة" : "تبقّت أخطاء أنواع",
    { output: typed.stdout.slice(-1500) },
  );

  await event(db, run, "status", "التحقق من البناء");

  let build = await ws.build();
  for (let i = 0; build.exitCode !== 0 && i < MAX_BUILD_FIXES; i++) {
    let fixRaw = await askModel(token, CODER_SYSTEM, [
      {
        role: "user",
        content: `The build failed. Fix it with ONE tool call in the line format, finishing with <<<END>>>.\n\nBUILD OUTPUT:\n${build.stdout.slice(-4000)}\n${build.stderr.slice(-2000)}\n\nPROJECT FILES:\n${await ws.tree()}`,
      },
    ]);
    for (let c = 0; c < 4 && fixRaw && !fixRaw.includes("<<<END>>>"); c++) {
      const more = await askModel(token, CODER_SYSTEM, [
        { role: "user", content: "Continue the cut-off reply exactly where it stopped, raw code only, finish with <<<END>>>." },
        { role: "assistant", content: fixRaw.slice(-4000) },
      ]);
      if (!more) break;
      fixRaw += more;
    }
    const fix = parseToolReply(fixRaw)[0];
    if (!fix?.tool || fix.tool === "done") break;
    const r = await runTool(ws, fix);
    await event(db, run, "tool", `fix ${fix.tool} ${fix.path ?? ""}`.trim(), {
      ok: r.ok,
      output: r.output.slice(0, 2000),
    });
    build = await ws.build();
  }
  // Static runtime guard: a green build still blanks the page on duplicate
  // routers / missing files, so fix those with the same repair loop.
  await ws.normalizeEntrypoint();
  let issues = await ws.staticIssues();
  for (let i = 0; issues.length && i < MAX_BUILD_FIXES; i++) {
    await event(db, run, "status", `إصلاح ${issues.length} مشكلة تشغيل`, { output: issues.join("\n") });
    let raw = await askModel(token, CODER_SYSTEM, [
      {
        role: "user",
        content: `The app builds but breaks at runtime. Fix the FIRST issue with ONE tool call in the line format, finishing with <<<END>>>.\n\nISSUES:\n${issues.join("\n")}\n\nPROJECT FILES:\n${await ws.tree()}`,
      },
    ]);
    for (let c = 0; c < 4 && raw && !raw.includes("<<<END>>>"); c++) {
      const more = await askModel(token, CODER_SYSTEM, [
        { role: "user", content: "Continue the cut-off reply exactly where it stopped, raw code only, finish with <<<END>>>." },
        { role: "assistant", content: raw.slice(-4000) },
      ]);
      if (!more) break;
      raw += more;
    }
    const fix = parseToolReply(raw)[0];
    if (!fix?.tool || fix.tool === "done") break;
    const r = await runTool(ws, fix);
    await event(db, run, "tool", `fix ${fix.tool} ${fix.path ?? ""}`.trim(), {
      ok: r.ok,
      output: r.output.slice(0, 1500),
    });
    const next = await ws.staticIssues();
    // No progress: the model cannot fix it, stop burning slices on a loop.
    if (next.join("|") === issues.join("|")) {
      issues = next;
      break;
    }
    issues = next;
  }
  if (issues.length === 0) build = await ws.build();

  const buildOk = build.exitCode === 0;
  await event(db, run, buildOk ? "build_ok" : "build_failed", buildOk ? "البناء ناجح" : "البناء فشل", {
    output: build.stdout.slice(-2000),
  });

  // Stage 3: run the project's own tests when it has any. Failures are
  // reported, not fatal — a green build still ships, the user decides.
  if (buildOk) {
    const tests = await ws.runTests();
    const skipped = /no test script/.test(tests.stdout);
    if (!skipped) {
      await event(
        db,
        run,
        tests.exitCode === 0 ? "tests_ok" : "tests_failed",
        tests.exitCode === 0 ? "الاختبارات ناجحة" : "بعض الاختبارات فشلت",
        { output: `${tests.stdout}\n${tests.stderr}`.slice(-2000) },
      );
    }
  }


  // -------------------------------------------- private GitHub persistence
  await ws.startDevServer();
  let commit: string | null = null;
  if (project.github_repo) {
    commit = await saveWorkspaceToGithub(
      ws,
      project.github_repo,
      run.prompt.slice(0, 120) || "Update from Megsy",
    );
  }
  if (commit) {
    await db
      .from("dev_projects")
      .update({ head_commit: commit, updated_at: new Date().toISOString() })
      .eq("id", project.id);
  }

  // ---------------------------------------------------------------- deploy
  let deployUrl: string | null = null;
  let shot: string | null = null;
  if (run.allow_deploy && buildOk) {
    if (!project.github_repo) {
      await event(db, run, "error", "لا يمكن النشر بدون مستودع GitHub خاص", {
        reason: "github_repo missing",
      });
    } else if (project.deploy_url && commit && commit === project.deployed_commit) {
      deployUrl = project.deploy_url;
      await event(db, run, "status", "النسخة الحالية منشورة بالفعل", { url: deployUrl });
    } else {
      await event(db, run, "status", "جاري النشر");
      try {
        deployUrl = await ws.publishDist(`megsy-live-${project.id.replace(/-/g, "").slice(0, 12)}`);
        shot = deployUrl ? screenshotUrl(deployUrl) : null;
        await db.from("dev_deploys").insert({
          user_id: run.user_id,
          project_id: project.id,
          run_id: run.id,
          commit,
          deployment_id: null,
          url: deployUrl,
          screenshot_url: shot,
          status: "success",
        });
        await db
          .from("dev_projects")
          .update({
            deploy_url: deployUrl,
            screenshot_url: shot,
            deployed_commit: commit,
            updated_at: new Date().toISOString(),
          })
          .eq("id", project.id);
        await event(db, run, "deployed", "تم النشر", { url: deployUrl, screenshot: shot });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await db.from("dev_deploys").insert({
          user_id: run.user_id,
          project_id: project.id,
          run_id: run.id,
          commit,
          status: "failed",
          error: msg.slice(0, 500),
        });
        await event(db, run, "error", "فشل النشر", { error: msg.slice(0, 500) });
      }
    }
  }

  // ---------------------------------------------------------------- summary
  const summary = await askModel(
    token,
    "You summarize a coding agent's work for the user in the same language as the request. 2-4 short sentences, concrete, no fluff, no markdown headers.",
    [
      {
        role: "user",
        content: `REQUEST: ${run.prompt}\nTASKS: ${tasks.map((t) => `${t.title} [${t.status}]`).join("; ")}\nBUILD: ${buildOk ? "passed" : "failed"}\nPREVIEW: ${project.preview_url ?? "none"}\nDEPLOYED: ${deployUrl ?? "not deployed"}`,
      },
    ],
    60_000,
  );

  await patchRun(db, run, {
    status: buildOk ? "done" : "error",
    summary: (summary || "تم تنفيذ المطلوب.").slice(0, 4000),
    error: buildOk ? null : "Build failed",
    finished_at: new Date().toISOString(),
  });
  return true;
}
