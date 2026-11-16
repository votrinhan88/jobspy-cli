import { describe, expect, it } from "vitest";
import type { Job } from "@/lib/csv";
import { discoverBoards, extractBoard } from "@/lib/board-discovery";

function job(overrides: Record<string, string>): Job {
  return { job_id: "j", title: "t", company: "", ...overrides } as unknown as Job;
}

describe("extractBoard", () => {
  it("reads a Greenhouse board from either host", () => {
    expect(extractBoard("https://boards.greenhouse.io/acme/jobs/123")).toBe("greenhouse:acme");
    expect(extractBoard("https://job-boards.greenhouse.io/anthropic/jobs/9")).toBe("greenhouse:anthropic");
    expect(extractBoard("https://job-boards.eu.greenhouse.io/acme?gh_jid=1")).toBe("greenhouse:acme");
  });

  it("ignores the Greenhouse embed path", () => {
    expect(extractBoard("https://boards.greenhouse.io/embed/job_app?token=1")).toBeNull();
  });

  it("reads a Lever board", () => {
    expect(extractBoard("https://jobs.lever.co/q-ctrl/abc-123")).toBe("lever:q-ctrl");
    expect(extractBoard("https://jobs.eu.lever.co/acme/abc")).toBe("lever:acme");
  });

  it("reads an Ashby board", () => {
    expect(extractBoard("https://jobs.ashbyhq.com/xero/uuid")).toBe("ashby:xero");
  });

  it("reads a Workday board and skips the locale segment", () => {
    expect(
      extractBoard("https://dxc.wd1.myworkdayjobs.com/en-US/DXCJobs/job/Sydney/AI-Engineer_1")
    ).toBe("workday:dxc.wd1/DXCJobs");
    expect(extractBoard("https://acme.wd5.myworkdayjobs.com/External/job/x_1")).toBe(
      "workday:acme.wd5/External"
    );
  });

  it("returns null for other sites and bad input", () => {
    expect(extractBoard("https://www.linkedin.com/jobs/view/1")).toBeNull();
    expect(extractBoard("not a url")).toBeNull();
    expect(extractBoard("")).toBeNull();
    expect(extractBoard(undefined)).toBeNull();
  });

  it("returns null for a name the validator would reject", () => {
    expect(extractBoard("https://jobs.lever.co/a.b/1")).toBeNull();
  });
});

describe("discoverBoards", () => {
  const jobs = [
    job({ company: "Xero", job_url_direct: "https://jobs.ashbyhq.com/xero/1" }),
    job({ company: "Xero", job_url_direct: "https://jobs.ashbyhq.com/xero/2" }),
    job({ company: "Xero Ltd", job_url_direct: "https://jobs.ashbyhq.com/xero/3" }),
    job({ company: "Q-CTRL", job_url: "https://jobs.lever.co/q-ctrl/9" }),
    job({ company: "Other", job_url_direct: "https://example.com/careers/1" }),
  ];

  it("lists each board once with its job count and the most common company name", () => {
    expect(discoverBoards(jobs, { existing: [], dismissed: [] })).toEqual([
      { entry: "ashby:xero", name: "Xero", jobs: 3 },
      { entry: "lever:q-ctrl", name: "Q-CTRL", jobs: 1 },
    ]);
  });

  it("skips boards already in the company list, ignoring case and the name part", () => {
    const found = discoverBoards(jobs, { existing: ["Ashby:XERO:Xero Corp"], dismissed: [] });
    expect(found.map((b) => b.entry)).toEqual(["lever:q-ctrl"]);
  });

  it("skips dismissed boards", () => {
    const found = discoverBoards(jobs, { existing: [], dismissed: ["lever:q-ctrl"] });
    expect(found.map((b) => b.entry)).toEqual(["ashby:xero"]);
  });

  it("uses the same board once when two columns point at it", () => {
    const both = [
      job({
        company: "Acme",
        job_url: "https://jobs.lever.co/acme/1",
        job_url_direct: "https://jobs.lever.co/acme/1",
      }),
    ];
    expect(discoverBoards(both, { existing: [], dismissed: [] })).toEqual([
      { entry: "lever:acme", name: "Acme", jobs: 1 },
    ]);
  });

  it("returns an empty name when no job has a company", () => {
    const none = [job({ company: "", job_url_direct: "https://jobs.lever.co/acme/1" })];
    expect(discoverBoards(none, { existing: [], dismissed: [] })[0].name).toBe("");
  });
});
