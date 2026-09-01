/**
 * @doc Shared skills registry for every agent in the product.
 *
 * A "skill" is a markdown document with YAML-ish frontmatter (`name`,
 * `description`) whose body carries task-specific know-how. Skills are matched
 * against the current request by their description and only then injected into
 * the prompt, so the base prompt stays small.
 *
 * Both the Dev Agent (skills found inside the user's workspace) and the main
 * chat agent (skills stored per user) go through this module.
 */

export interface Skill {
  /** Stable slug, e.g. "freestyle". */
  name: string;
  /** One-liner that drives relevance matching. */
  description: string;
  /** Markdown body without the frontmatter. */
  body: string;
  /** Where the skill came from (path or storage id) — for debugging/events. */
  source?: string;
}

const FRONTMATTER = /^---\s*\n([\s\S]*?)\n---\s*\n?/;

/** Parses a SKILL.md document. Returns null when it has no usable frontmatter. */
export function parseSkill(raw: string, source?: string): Skill | null {
  if (!raw || !raw.trim()) return null;
  const match = FRONTMATTER.exec(raw);
  if (!match) return null;
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const kv = /^\s*([A-Za-z_-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    meta[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  const name = meta.name?.trim();
  if (!name) return null;
  const body = raw.slice(match[0].length).trim();
  if (!body) return null;
  return { name, description: meta.description ?? "", body, source };
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "your", "you",
  "use", "used", "when", "whenever", "any", "all", "app", "apps", "make",
  "create", "build", "add", "new", "please", "can", "how", "what",
]);

function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9\u0600-\u06ff]{3,}/g) ?? []).filter(
    (t) => !STOPWORDS.has(t),
  );
}

/**
 * Scores a skill against the request. Name hits weigh more than description
 * hits, because skill names are usually product/tool names ("freestyle").
 */
export function scoreSkill(skill: Skill, request: string): number {
  const req = new Set(tokens(request));
  if (!req.size) return 0;
  let score = 0;
  for (const t of tokens(skill.name)) if (req.has(t)) score += 3;
  for (const t of new Set(tokens(skill.description))) if (req.has(t)) score += 1;
  return score;
}

export interface SelectSkillsOptions {
  /** Skills explicitly turned on by the user — always injected. */
  forced?: string[];
  /** Maximum number of skills to inject. */
  max?: number;
  /** Minimum score for an automatic (non-forced) match. */
  minScore?: number;
}

/** Picks the skills worth injecting for one request. */
export function selectSkills(
  skills: Skill[],
  request: string,
  options: SelectSkillsOptions = {},
): Skill[] {
  const { forced = [], max = 2, minScore = 3 } = options;
  const forcedSet = new Set(forced.map((f) => f.toLowerCase()));
  const picked: Skill[] = skills.filter((s) => forcedSet.has(s.name.toLowerCase()));
  const rest = skills
    .filter((s) => !forcedSet.has(s.name.toLowerCase()))
    .map((skill) => ({ skill, score: scoreSkill(skill, request) }))
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.skill);
  return [...picked, ...rest].slice(0, max);
}

/** Renders selected skills as a prompt section, bounded in size. */
export function renderSkills(skills: Skill[], maxChars = 6000): string {
  if (!skills.length) return "";
  const budget = Math.max(1200, Math.floor(maxChars / skills.length));
  const parts = skills.map((skill) => {
    const body = skill.body.length > budget
      ? `${skill.body.slice(0, budget)}\n… (skill truncated)`
      : skill.body;
    return `### SKILL: ${skill.name}\n${skill.description ? `${skill.description}\n` : ""}${body}`;
  });
  return `## ACTIVE SKILLS\nApply these as authoritative instructions for this task.\n\n${parts.join("\n\n")}`;
}
