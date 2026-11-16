import { describe, expect, it } from "vitest";
import { groupByStatus } from "@/lib/kanban";
import type { Job } from "@/lib/csv";

function job(id: string, status: string, at: string): Job {
  return { job_id: id, status, status_updated_at: at } as Job;
}

describe("groupByStatus", () => {
  it("orders each column by the oldest status change first", () => {
    const jobs = [
      job("a", "applied", "2026-11-01T10:00:00Z"),
      job("b", "applied", "2026-11-05T10:00:00Z"),
      job("c", "applied", "2026-11-03T10:00:00Z"),
    ];
    expect(groupByStatus(jobs, ["applied"]).applied.map((j) => j.job_id)).toEqual(["a", "c", "b"]);
  });

  it("puts jobs without a valid timestamp last and keeps their order", () => {
    const jobs = [job("a", "applied", ""), job("b", "applied", "2026-11-05T10:00:00Z"), job("c", "applied", "bad")];
    expect(groupByStatus(jobs, ["applied"]).applied.map((j) => j.job_id)).toEqual(["b", "a", "c"]);
  });

  it("returns an empty list for a column with no jobs", () => {
    expect(groupByStatus([], ["offer"]).offer).toEqual([]);
  });

  it("does not change the input order", () => {
    const jobs = [job("a", "applied", "2026-11-01T10:00:00Z"), job("b", "applied", "2026-11-05T10:00:00Z")];
    groupByStatus(jobs, ["applied"]);
    expect(jobs.map((j) => j.job_id)).toEqual(["a", "b"]);
  });
});
