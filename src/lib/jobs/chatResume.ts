// Tracks in-flight deep-research chat jobs.
//
// The chat function itself runs on the server (background_jobs row) once the
// page sends `background: true`. The job persists regardless of the tab — we
// just need a pointer to find it again.
//
// Persistence: in-memory Map (per page load), hydrated from Supabase
// `background_jobs` on chat mount. No localStorage — DB is the source of truth.
import { supabase } from "@/integrations/supabase/client";

export interface ActiveChatJob {
  jobId: string;
  conversationId: string;
  clientId: string;
  userInput: string;
  startedAt: number;
}

const TTL_MS = 30 * 60 * 1000; // 30 min — jobs older than this are abandoned
const jobs = new Map<string, ActiveChatJob>();

function prune(): void {
  const now = Date.now();
  for (const [id, j] of jobs) {
    if (now - j.startedAt >= TTL_MS) jobs.delete(id);
  }
}

export function addActiveChatJob(job: ActiveChatJob): void {
  jobs.set(job.jobId, job);
}

export function removeActiveChatJob(jobId: string): void {
  jobs.delete(jobId);
}

/** Test-only: wipe in-memory state between tests. */
export function _resetActiveChatJobsForTests(): void {
  jobs.clear();
}

export function getActiveChatJobs(conversationId: string): ActiveChatJob[] {
  prune();
  return Array.from(jobs.values()).filter((j) => j.conversationId === conversationId);
}

/**
 * Hydrate the in-memory active-jobs map from `background_jobs` so that after
 * a tab reload we can re-attach to running deep-research jobs.
 * Called once when the chat page mounts.
 */
export async function hydrateActiveChatJobs(conversationId: string): Promise<void> {
  const since = new Date(Date.now() - TTL_MS).toISOString();
  const { data } = await supabase
    .from("background_jobs")
    .select("id, conversation_id, status, created_at, input")
    .eq("conversation_id", conversationId)
    .in("status", ["queued", "running"])
    .is("finished_at", null)
    .gte("created_at", since);
  if (!data) return;
  for (const row of data as any[]) {
    const meta = (row.input as any) || {};
    jobs.set(row.id, {
      jobId: row.id,
      conversationId: row.conversation_id,
      clientId: meta.clientId || "",
      userInput: meta.userInput || meta.prompt || "",
      startedAt: new Date(row.created_at).getTime(),
    });
  }
}
