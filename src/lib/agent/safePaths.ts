/**
 * @doc Guard rails for the agent's shell and delete tools.
 *
 * The coder runs unrestricted `bash` inside the project VM. That VM also holds
 * the generated app's `.env`, npm credentials and the SSH/agent environment, so
 * a prompt-injected reply could trivially read or exfiltrate them. These checks
 * are a cheap, deterministic denylist applied before any command runs.
 */

const DENY_PATHS = [
  /(^|[\s"'/])\.env(\.[\w-]+)?($|[\s"'])/i,
  /\.ssh(\/|$)/i,
  /\.aws(\/|$)/i,
  /\.npmrc/i,
  /\.git\/config/i,
  /\/proc\/self\/environ/i,
  /id_rsa|id_ed25519/i,
];

/** Commands that dump the whole environment (where the API keys live). */
const DENY_COMMANDS = [
  /(^|[;&|]\s*)(env|printenv|set)\s*($|[;&|])/,
  /echo\s+\$\{?[A-Z_]*(KEY|TOKEN|SECRET|PASSWORD)/i,
  /\$\{?[A-Z_]*(KEY|TOKEN|SECRET)\}?/,
  /curl[^\n]*\$\{?[A-Z_]*(KEY|TOKEN|SECRET)/i,
  /rm\s+-rf\s+\/($|\s)/,
];

export interface GuardResult {
  allowed: boolean;
  reason?: string;
}

/** Checks a shell command the model wants to run inside the project VM. */
export function guardCommand(command: string): GuardResult {
  const cmd = command.trim();
  if (!cmd) return { allowed: false, reason: "empty command" };
  for (const pattern of DENY_COMMANDS) {
    if (pattern.test(cmd)) {
      return {
        allowed: false,
        reason:
          "Blocked: this command reads or forwards environment secrets. Work on project files only.",
      };
    }
  }
  for (const pattern of DENY_PATHS) {
    if (pattern.test(cmd)) {
      return {
        allowed: false,
        reason: "Blocked: credential files (.env, .ssh, .npmrc, …) are off limits to the agent.",
      };
    }
  }
  return { allowed: true };
}

/** Checks a project-relative path for read/write/delete tools. */
export function guardPath(path: string): GuardResult {
  const clean = path.trim();
  if (!clean) return { allowed: false, reason: "empty path" };
  if (clean.startsWith("/") || clean.split("/").includes("..")) {
    return { allowed: false, reason: "Path must stay inside the project." };
  }
  for (const pattern of DENY_PATHS) {
    if (pattern.test(clean)) {
      return { allowed: false, reason: "Blocked: credential files are off limits to the agent." };
    }
  }
  return { allowed: true };
}
