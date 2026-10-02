import { describe, expect, it } from "vitest";
import type { Job } from "@/lib/csv";
import { computeStatistics } from "@/lib/statistics";

function jobs(spec: [string, number][], remote = "False"): Job[] {
  const out: Job[] = [];
  for (const [status, count] of spec) {
    for (let i = 0; i < count; i++) {
      out.push({ job_id: `${status}-${i}`, status, is_remote: remote, company: "c", location: "l" } as unknown as Job);
    }
  }
  return out;
}

const SEED = jobs([
  ["", 34],
  ["shortlisted", 9],
  ["applied", 8],
  ["interview", 4],
  ["offer", 1],
  ["rejected", 5],
  ["skipped", 4],
]);

describe("computeStatistics", () => {
  it("active counts only shortlisted, applied, interview and offer", () => {
    expect(computeStatistics(SEED).active).toBe(22);
  });

  it("archived counts rejected and skipped", () => {
    expect(computeStatistics(SEED).archived).toBe(9);
  });

  it("active + archived + new equals total", () => {
    const stats = computeStatistics(SEED);
    const fresh = SEED.filter((j) => j.status === "").length;
    expect(stats.active + stats.archived + fresh).toBe(stats.total);
  });

  it("remote count uses the shared isRemote", () => {
    const mixed = [
      ...jobs([["", 1]], "True"),
      ...jobs([["", 1]], "yes"),
      ...jobs([["", 1]], "1"),
      ...jobs([["", 1]], "False"),
      ...jobs([["", 1]], ""),
    ];
    expect(computeStatistics(mixed).remote).toBe(3);
  });
});
