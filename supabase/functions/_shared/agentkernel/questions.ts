/**
 * Pause -> ask the user -> continue.
 *
 * Detects the situations a human would never guess through (CAPTCHA, OTP/2FA,
 * login walls, payments, destructive actions, genuinely ambiguous pages), parks
 * the run in `needs_input`, and resumes it once the answer arrives.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export interface BlockSignal {
  question: string;
  reason: string;
  sensitive: boolean;
}

export function requiresBrowserHandoff(reason?: string | null): boolean {
  return reason === "captcha" || reason === "login" || reason === "otp";
}

const PATTERNS: { re: RegExp; question: string; reason: string; sensitive: boolean }[] = [
  {
    re: /\b(captcha|recaptcha|hcaptcha|cloudflare turnstile|i'?m not a robot|verify you are human)\b/i,
    question: "The site is showing a human-verification challenge (CAPTCHA). Please solve it in the live view, then tell me to continue.",
    reason: "captcha",
    sensitive: false,
  },
  {
    re: /\b(otp|one[- ]time (code|password)|verification code|2fa|two[- ]factor|authenticator code|sms code)\b/i,
    question: "The site needs one-time verification. Complete it yourself in the live browser, then resume the task.",
    reason: "otp",
    sensitive: true,
  },
  {
    re: /\b(sign in|log in|login) (required|needed)|enter your (password|credentials)|incorrect password|account locked\b/i,
    question: "Sign in yourself in the live browser so your credentials never pass through chat, then resume the task.",
    reason: "login",
    sensitive: true,
  },
  {
    re: /\b(confirm (the )?(payment|purchase|order)|place order|pay now|checkout total|card number|cvv)\b/i,
    question: "I've reached a payment/confirmation step. Should I go ahead, and with which payment method?",
    reason: "payment",
    sensitive: true,
  },
  {
    re: /\b(delete|permanently remove|cancel subscription|close account|wire transfer|transfer funds)\b/i,
    question: "This step would perform an irreversible action. Do you want me to continue?",
    reason: "destructive",
    sensitive: false,
  },
  {
    re: /\b(access denied|forbidden|blocked|rate limit|unusual activity|are you sure you're not)\b/i,
    question: "The site is blocking me. How would you like me to proceed?",
    reason: "blocked",
    sensitive: false,
  },
];

/** Scans the newest step text for something a human would stop and ask about. */
export function detectBlock(text: string): BlockSignal | null {
  if (!text) return null;
  for (const pattern of PATTERNS) {
    if (pattern.re.test(text)) {
      return { question: pattern.question, reason: pattern.reason, sensitive: pattern.sensitive };
    }
  }
  return null;
}

/** Large-amount guard: any money figure above the threshold needs a human OK. */
export function detectLargeAmount(text: string, threshold = 200): BlockSignal | null {
  const match = text.match(/(?:\$|usd|egp|eur|£|€)\s?([\d][\d,\.]*)/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount < threshold) return null;
  return {
    question: `This involves ${match[0]}, which is a large amount. Confirm before I continue?`,
    reason: "large_amount",
    sensitive: false,
  };
}

/** Returns the run's open question, if any. */
export async function openQuestion(supabase: SupabaseClient, runId: string) {
  const { data } = await supabase
    .from("agent_questions")
    .select("*")
    .eq("run_id", runId)
    .eq("status", "open")
    .order("asked_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/** Parks the run and records the question. Idempotent per open question. */
export async function askUser(
  supabase: SupabaseClient,
  run: { id: string; user_id: string },
  signal: BlockSignal & { options?: string[] },
): Promise<void> {
  if (await openQuestion(supabase, run.id)) return;
  await supabase.from("agent_questions").insert({
    run_id: run.id,
    user_id: run.user_id,
    question: signal.question,
    reason: signal.reason,
    options: signal.options ?? [],
    sensitive: signal.sensitive,
  });
  await supabase
    .from("long_runs")
    .update({
      needs_input: true,
      status: "paused",
      status_text: "Waiting for your answer",
      updated_at: new Date().toISOString(),
    })
    .eq("id", run.id);
  await supabase.from("long_run_events").insert({
    run_id: run.id,
    type: "question",
    title: signal.question,
    detail: signal.reason,
  });
}

/** Marks a question answered and clears the run's needs_input flag. */
export async function resolveQuestion(
  supabase: SupabaseClient,
  questionId: string,
  runId: string,
  answer: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { data: question } = await supabase
    .from("agent_questions")
    .select("sensitive,reason")
    .eq("id", questionId)
    .maybeSingle();
  const redact = Boolean(question?.sensitive) || requiresBrowserHandoff(question?.reason);
  await supabase
    .from("agent_questions")
    .update({ answer: redact ? null : answer, status: "answered", answered_at: now, updated_at: now })
    .eq("id", questionId);
  await supabase
    .from("long_runs")
    .update({ needs_input: false, loop_strikes: 0, status_text: "Continuing", updated_at: now })
    .eq("id", runId);
}
