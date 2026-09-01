/**
 * @doc Runtime project-context injection for the coding agent.
 *
 * Before this module the agent ignored every rule file that lived inside the
 * user's own project: an imported GitHub repo could ship an AGENTS.md, a
 * CONTRIBUTING guide or `.agents/skills/*` and the model never saw any of it.
 *
 * `loadProjectContext` reads those files from the live workspace, budgets them
 * and returns a single prompt block plus the parsed skills, so both the coder
 * and the verifier can honour the project's own conventions.
 */
import { parseSkill, renderSkills, selectSkills, type Skill } from "./skills";

/** Minimal workspace surface this module needs (DevWorkspace satisfies it). */
export interface ContextWorkspace {
  bash(command: string, timeoutMs?: number): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  readFile(path: string): Promise<string>;
}

/** Rule files honoured at runtime, highest priority first. */
export const RULE_FILES = [
  "AGENTS.md",
  ".agents/AGENTS.md",
  "CLAUDE.md",
  ".cursorrules",
  ".github/copilot-instructions.md",
  "CONTRIBUTING.md",
] as const;

const RULES_BUDGET = 6000;

export interface ProjectContext {
  /** Prompt block to append to the coder system prompt (may be empty). */
  prompt: string;
  /** Rule files that were actually found. */
  ruleFiles: string[];
  /** Skills discovered inside the project. */
  skills: Skill[];
}

async function safeRead(ws: ContextWorkspace, path: string): Promise<string | null> {
  try {
    const content = await ws.readFile(path);
    return content && content.trim() ? content : null;
  } catch {
    return null;
  }
}

/** Lists `.agents/skills/<name>/SKILL.md` files present in the workspace. */
async function listSkillFiles(ws: ContextWorkspace): Promise<string[]> {
  try {
    const res = await ws.bash(
      "find .agents/skills .claude/skills -maxdepth 3 -name 'SKILL.md' 2>/dev/null | sed 's#^./##' | head -20",
      20_000,
    );
    return res.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Reads the project's own rules and skills from the workspace.
 * Never throws — a missing file simply means less context.
 */
export async function loadProjectContext(
  ws: ContextWorkspace,
  request: string,
  options: { forcedSkills?: string[] } = {},
): Promise<ProjectContext> {
  const ruleFiles: string[] = [];
  const chunks: string[] = [];
  let spent = 0;

  for (const file of RULE_FILES) {
    if (spent >= RULES_BUDGET) break;
    const content = await safeRead(ws, file);
    if (!content) continue;
    const room = RULES_BUDGET - spent;
    const text = content.length > room ? `${content.slice(0, room)}\n… (truncated)` : content;
    spent += text.length;
    ruleFiles.push(file);
    chunks.push(`### ${file}\n${text.trim()}`);
  }

  const skills: Skill[] = [];
  for (const path of await listSkillFiles(ws)) {
    const raw = await safeRead(ws, path);
    if (!raw) continue;
    const skill = parseSkill(raw, path);
    if (skill) skills.push(skill);
  }
  const selected = selectSkills(skills, request, { forced: options.forcedSkills, max: 2 });

  const sections: string[] = [];
  if (chunks.length) {
    sections.push(
      `## PROJECT RULES (from the repository itself — they override your defaults)\n\n${chunks.join("\n\n")}`,
    );
  }
  const skillBlock = renderSkills(selected);
  if (skillBlock) sections.push(skillBlock);

  return { prompt: sections.join("\n\n"), ruleFiles, skills: selected };
}
