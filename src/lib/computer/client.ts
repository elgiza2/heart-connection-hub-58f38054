/** @doc Browser client for the Computer Agent (Supabase edge function `computer-agent`). */
import { supabase } from "@/integrations/supabase/client";

export interface ComputerFile {
  name: string;
  url: string;
  type?: string;
}

export interface ComputerTask {
  id: string;
  status: "pending" | "running" | "done" | "failed" | string;
  progress: string | null;
  result_text: string | null;
  files: ComputerFile[];
  error: string | null;
  prompt: string;
}

export interface ComputerEvent {
  id: string;
  title: string;
  detail: string | null;
  url: string | null;
  created_at: string;
}

const SIGN_IN_MESSAGE = "سجّل الدخول أولاً لتشغيل مهام الكمبيوتر. / Please sign in to run computer tasks.";

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const COMPUTER_AGENT_URL = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/computer-agent`;


async function call<T>(body: Record<string, unknown>): Promise<T> {
  let { data: sess } = await supabase.auth.getSession();
  let token = sess.session?.access_token;
  if (!token) {
    // Session may still be rehydrating or the access token expired.
    const { data: refreshed } = await supabase.auth.refreshSession();
    token = refreshed.session?.access_token;
  }
  if (!token) throw new Error(SIGN_IN_MESSAGE);

  const resp = await fetch(COMPUTER_AGENT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ ...body, token }),
  });
  const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  if (resp.status === 401) throw new Error(SIGN_IN_MESSAGE);
  if (!resp.ok) throw new Error((data.error as string) || `HTTP ${resp.status}`);
  return data as T;

}

export function createComputerTask(input: {
  prompt: string;
  conversation_id?: string | null;
  message_id?: string | null;
  attachments?: string[];
}) {
  return call<{ task_id: string; status: string; error?: string }>({
    action: "create",
    ...input,
  });
}

export function pollComputerTask(taskId: string) {
  return call<{ task: ComputerTask; events: ComputerEvent[] }>({ action: "poll", task_id: taskId });
}

export function stopComputerTask(taskId: string) {
  return call<{ ok: boolean }>({ action: "stop", task_id: taskId });
}

/** Human-friendly message for backend failure codes (no provider names). */
export function computerErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case "no_capacity":
      return "Computer agent is unavailable right now. Please try again shortly.";
    case "rate_limited":
      return "Too many computer tasks at once — try again in a minute.";
    case "stopped":
      return "Task stopped.";
    case "provider_error":
      return "The computer task couldn't be started. Please try again.";
    default:
      return code ? "The computer task failed." : "";
  }
}
