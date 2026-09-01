/** Shared (client-safe) types for long-running computer/agent runs. */

export type LongRunStatus = "queued" | "running" | "paused" | "done" | "error" | "canceled";

export interface LongRun {
  id: string;
  user_id: string;
  conversation_id: string | null;
  kind: string;
  goal: string;
  status: LongRunStatus;
  phase: string | null;
  status_text: string | null;
  provider: string | null;
  external_run_id: string | null;
  sandbox_id: string | null;
  live_view_url: string | null;
  expires_at: string | null;
  last_heartbeat_at: string;
  result: any;
  error: string | null;
  /** Kernel fields — plan / review / pause-and-ask / loop state. */
  plan_id?: string | null;
  review_round?: number | null;
  budget_ms?: number | null;
  needs_input?: boolean | null;
  loop_strikes?: number | null;
  step_count?: number | null;
  sandbox_generation?: number | null;
  /** Plan-approval gate: the agent waits for Continue, then proceeds itself. */
  awaiting_plan_ack?: boolean | null;
  auto_continue_at?: string | null;
  /** Notes the user queued mid-run; folded into the agent's next decision. */
  pending_guidance?: string[] | null;
  /** Immediate steering is consumed at the next safe tool boundary. */
  pending_steering?: string[] | null;
  /** Safety metadata is decided server-side and cannot be downgraded by the model. */
  risk_level?: "low" | "medium" | "high" | null;
  auto_continue_allowed?: boolean | null;
  stop_requested?: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface LongRunEvent {
  id: string;
  run_id: string;
  type: string;
  title: string;
  detail: string | null;
  screenshot_url: string | null;
  created_at: string;
  /** Structured activity fields written by the kernel (all optional/legacy-safe). */
  event_type?: string | null;
  step_id?: string | null;
  tool?: string | null;
  action?: string | null;
  status?: string | null;
  summary?: string | null;
  progress?: number | null;
  metadata?: Record<string, unknown> | null;
}

/** A question the agent paused on, waiting for the user. */
export interface AgentQuestion {
  id: string;
  run_id: string;
  question: string;
  reason: string | null;
  options: string[];
  sensitive: boolean;
  answer: string | null;
  status: string;
  asked_at: string;
}


/** How long a single sandbox lease lasts before the keep-alive extends it. */
export const LEASE_SECONDS = 15 * 60;
/** Client/watchdog keep-alive cadence — comfortably inside the lease. */
export const KEEPALIVE_MS = 4 * 60_000;
/** Hard ceiling for a single run (24h) so a runaway task always ends. */
export const MAX_RUN_MS = 24 * 60 * 60 * 1000;
