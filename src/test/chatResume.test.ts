import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addActiveChatJob,
  getActiveChatJobs,
  removeActiveChatJob,
  _resetActiveChatJobsForTests,
} from "@/lib/jobs/chatResume";

describe("chatResume (in-memory tracker)", () => {
  beforeEach(() => {
    _resetActiveChatJobsForTests();
    vi.useRealTimers();
  });

  it("persists a job and reads it back by conversation", () => {
    addActiveChatJob({
      jobId: "job-1",
      conversationId: "conv-A",
      clientId: "c1",
      userInput: "hi",
      startedAt: Date.now(),
    });
    const jobs = getActiveChatJobs("conv-A");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].jobId).toBe("job-1");
  });

  it("filters by conversation id", () => {
    addActiveChatJob({
      jobId: "j1",
      conversationId: "A",
      clientId: "x",
      userInput: "",
      startedAt: Date.now(),
    });
    addActiveChatJob({
      jobId: "j2",
      conversationId: "B",
      clientId: "x",
      userInput: "",
      startedAt: Date.now(),
    });
    expect(getActiveChatJobs("A").map((j) => j.jobId)).toEqual(["j1"]);
    expect(getActiveChatJobs("B").map((j) => j.jobId)).toEqual(["j2"]);
  });

  it("removes a job by id", () => {
    addActiveChatJob({
      jobId: "j1",
      conversationId: "A",
      clientId: "x",
      userInput: "",
      startedAt: Date.now(),
    });
    addActiveChatJob({
      jobId: "j2",
      conversationId: "A",
      clientId: "x",
      userInput: "",
      startedAt: Date.now(),
    });
    removeActiveChatJob("j1");
    expect(getActiveChatJobs("A").map((j) => j.jobId)).toEqual(["j2"]);
  });

  it("does not duplicate when re-adding the same jobId", () => {
    const base = {
      jobId: "dup",
      conversationId: "A",
      clientId: "x",
      userInput: "first",
      startedAt: Date.now(),
    };
    addActiveChatJob(base);
    addActiveChatJob({ ...base, userInput: "second" });
    const jobs = getActiveChatJobs("A");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].userInput).toBe("second");
  });

  it("drops jobs older than the 30-minute TTL", () => {
    const old = Date.now() - 31 * 60 * 1000;
    addActiveChatJob({
      jobId: "old",
      conversationId: "A",
      clientId: "x",
      userInput: "",
      startedAt: old,
    });
    addActiveChatJob({
      jobId: "new",
      conversationId: "A",
      clientId: "x",
      userInput: "",
      startedAt: Date.now(),
    });
    expect(getActiveChatJobs("A").map((j) => j.jobId)).toEqual(["new"]);
  });

  it("empties storage entirely when last job is removed", () => {
    addActiveChatJob({
      jobId: "only",
      conversationId: "A",
      clientId: "x",
      userInput: "",
      startedAt: Date.now(),
    });
    removeActiveChatJob("only");
    expect(getActiveChatJobs("A")).toEqual([]);
  });
});
