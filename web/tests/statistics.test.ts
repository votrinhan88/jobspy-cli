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

  it("counts the five facets and uses display labels for work mode, seniority and employment type", () => {
    const mixed = [
      { country: "Australia", city: "Sydney", work_mode: "remote", seniority: "senior", employment_type: "full_time" },
      { country: "Australia", city: "Sydney", work_mode: "remote", seniority: "senior", employment_type: "contract" },
      { country: "Australia", city: "Melbourne", work_mode: "hybrid", seniority: "senior", employment_type: "full_time" },
      { country: "Vietnam", city: "Hanoi", work_mode: "onsite", seniority: "junior", employment_type: "full_time" },
    ] as Job[];
    const stats = computeStatistics(mixed);
    expect(stats.facets.countries).toEqual([
      { name: "Australia", count: 3 },
      { name: "Vietnam", count: 1 },
    ]);
    expect(stats.facets.cities).toEqual([
      { name: "Sydney", count: 2 },
      { name: "Melbourne", count: 1 },
      { name: "Hanoi", count: 1 },
    ]);
    expect(stats.facets.workModes).toEqual([
      { name: "Remote", count: 2 },
      { name: "Hybrid", count: 1 },
      { name: "On-site", count: 1 },
    ]);
    expect(stats.facets.seniorities).toEqual([
      { name: "Senior", count: 3 },
      { name: "Junior", count: 1 },
    ]);
    expect(stats.facets.employmentTypes).toEqual([
      { name: "Full-time", count: 3 },
      { name: "Contract", count: 1 },
    ]);
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
