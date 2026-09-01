// Tests the Realtime resume helper in src/lib/jobs/client.ts.
// We mock the Supabase client so we can simulate a row hydrating from the DB
// and successive Realtime updates, then assert the JobHandlers fire correctly
// (deltas are incremental, terminal status fires onDone exactly once, etc).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (payload: { new: any }) => void;
const captured: { listener: Listener | null; rowOnFetch: any } = {
  listener: null,
  rowOnFetch: null,
};

vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      channel: (_name: string) => {
        const chain: any = {
          on: (_evt: string, _filter: any, cb: Listener) => {
            captured.listener = cb;
            return chain;
          },
          subscribe: () => chain,
        };
        return chain;
      },
      removeChannel: () => {},
      from: (_table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: captured.rowOnFetch, error: null }),
          }),
        }),
        update: () => ({ eq: async () => ({ data: null, error: null }) }),
      }),
      auth: {
        getSession: async () => ({ data: { session: null } }),
        getUser: async () => ({ data: { user: null } }),
      },
    },
  };
});

import { subscribeJob } from "@/lib/jobs/client";

const baseRow = (over: Partial<any> = {}) => ({
  id: "j1",
  user_id: "u1",
  conversation_id: null,
  message_id: null,
  kind: "chat",
  status: "running",
  phase: null,
  progress: 0,
  status_text: null,
  input: {},
  output: {},
  stream_text: "",
  meta: {},
  clarify: null,
  error: null,
  ...over,
});

describe("subscribeJob", () => {
  beforeEach(() => {
    captured.listener = null;
    captured.rowOnFetch = null;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("hydrates initial row and emits delta + done", async () => {
    captured.rowOnFetch = baseRow({ stream_text: "hello" });
    const onDelta = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    const unsub = subscribeJob("j1", { onDelta, onDone, onError });
    // Wait microtasks for the hydration promise.
    await new Promise((r) => setTimeout(r, 0));

    expect(onDelta).toHaveBeenCalledWith("hello", "hello");

    // Simulate Realtime update extending the stream.
    captured.listener?.({ new: baseRow({ stream_text: "hello world" }) });
    expect(onDelta).toHaveBeenLastCalledWith(" world", "hello world");

    // Terminal "done" update — should fire onDone once and stop further events.
    captured.listener?.({ new: baseRow({ stream_text: "hello world", status: "done" }) });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();

    unsub();
  });

  it("fires onError for status=error and onError('canceled') for canceled", () => {
    const onError = vi.fn();
    subscribeJob("j2", { onError });
    captured.listener?.({ new: baseRow({ status: "error", error: "boom" }) });
    expect(onError).toHaveBeenCalledWith("boom");

    const onCancel = vi.fn();
    subscribeJob("j3", { onError: onCancel });
    captured.listener?.({ new: baseRow({ status: "canceled" }) });
    expect(onCancel).toHaveBeenCalledWith("canceled");
  });

  it("emits onMeta/onOutput only when their JSON changes", () => {
    const onMeta = vi.fn();
    const onOutput = vi.fn();
    subscribeJob("j4", { onMeta, onOutput });
    captured.listener?.({ new: baseRow({ meta: { a: 1 }, output: { x: 1 } }) });
    captured.listener?.({ new: baseRow({ meta: { a: 1 }, output: { x: 1 } }) });
    captured.listener?.({ new: baseRow({ meta: { a: 2 }, output: { x: 1 } }) });
    expect(onMeta).toHaveBeenCalledTimes(2);
    expect(onOutput).toHaveBeenCalledTimes(1);
  });

  it("treats needs_input as a terminal-ish event (onDone fires)", () => {
    const onDone = vi.fn();
    subscribeJob("j5", { onDone });
    captured.listener?.({ new: baseRow({ status: "needs_input", clarify: { question: "?" } }) });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
