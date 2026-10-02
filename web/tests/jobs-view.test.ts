import { describe, expect, it } from "vitest";
import type { Job, JobStatus } from "@/lib/csv";
import { DEFAULT_SORT, filterJobs, sortJobs, statusCounts } from "@/lib/jobs-view";

function j(id: string, fields: Partial<Record<string, string>> = {}): Job {
  return {
    job_id: id,
    title: "",
    company: "",
    location: "",
    date_posted: "",
    is_remote: "False",
    status: "",
    ...fields,
  } as unknown as Job;
}

const ids = (jobs: Job[]) => jobs.map((x) => x.job_id);
const none = { query: "", statuses: new Set<JobStatus>(), remoteOnly: false };

describe("sortJobs", () => {
  it("default sort is posted date, newest first", () => {
    const jobs = [j("a", { date_posted: "2026-08-21" }), j("b", { date_posted: "2026-09-06" }), j("c", { date_posted: "2026-09-05" })];
    expect(DEFAULT_SORT).toEqual({ key: "posted", dir: "desc" });
    expect(ids(sortJobs(jobs, DEFAULT_SORT.key, DEFAULT_SORT.dir))).toEqual(["b", "c", "a"]);
  });

  it("jobs with an empty posted date sort last in both directions", () => {
    const jobs = [j("e1"), j("a", { date_posted: "2026-08-21" }), j("e2"), j("b", { date_posted: "2026-09-06" })];
    expect(ids(sortJobs(jobs, "posted", "desc"))).toEqual(["b", "a", "e1", "e2"]);
    expect(ids(sortJobs(jobs, "posted", "asc"))).toEqual(["a", "b", "e1", "e2"]);
  });

  it("ties keep the original order (stable)", () => {
    const jobs = ["a", "b", "c", "d"].map((id) => j(id, { company: "Same" }));
    expect(ids(sortJobs(jobs, "company", "asc"))).toEqual(["a", "b", "c", "d"]);
    expect(ids(sortJobs(jobs, "company", "desc"))).toEqual(["a", "b", "c", "d"]);
  });

  it("sorts by title, company and location, ascending and descending, ignoring case", () => {
    for (const [key, field] of [["title", "title"], ["company", "company"], ["location", "location"]] as const) {
      const jobs = [j("1", { [field]: "banana" }), j("2", { [field]: "Apple" }), j("3", { [field]: "cherry" })];
      expect(ids(sortJobs(jobs, key, "asc"))).toEqual(["2", "1", "3"]);
      expect(ids(sortJobs(jobs, key, "desc"))).toEqual(["3", "1", "2"]);
    }
  });

  it("sorts by status in pipeline order", () => {
    const order: JobStatus[] = ["skipped", "offer", "", "rejected", "applied", "interview", "shortlisted"];
    const jobs = order.map((s, i) => j(String(i), { status: s }));
    expect(sortJobs(jobs, "status", "asc").map((x) => x.status)).toEqual([
      "",
      "shortlisted",
      "applied",
      "interview",
      "offer",
      "rejected",
      "skipped",
    ]);
  });

  it("does not change the input array", () => {
    const jobs = [j("a", { title: "b" }), j("b", { title: "a" })];
    const copy = [...jobs];
    sortJobs(jobs, "title", "asc");
    expect(jobs).toEqual(copy);
  });
});

describe("filterJobs", () => {
  const jobs = [
    j("1", { title: "Data Scientist", company: "Acme", location: "Hanoi, Vietnam", status: "" }),
    j("2", { title: "ML Engineer", company: "Hanoi Labs", location: "Sydney", status: "shortlisted", is_remote: "True" }),
    j("3", { title: "AI Engineer", company: "Beta", location: "Remote, Australia", status: "skipped", is_remote: "yes" }),
    j("4", { title: "Data Engineer", company: "Gamma", location: "Perth", status: "applied" }),
  ];

  it("query matches title, company and location, ignoring case and surrounding spaces", () => {
    expect(ids(filterJobs(jobs, { ...none, query: "  HANOI " }))).toEqual(["1", "2"]);
    expect(ids(filterJobs(jobs, { ...none, query: "engineer" }))).toEqual(["2", "3", "4"]);
    expect(ids(filterJobs(jobs, { ...none, query: "remote" }))).toEqual(["3"]);
  });

  it("a query with several words needs every word to match", () => {
    expect(ids(filterJobs(jobs, { ...none, query: "data  engineer" }))).toEqual(["4"]);
    expect(ids(filterJobs(jobs, { ...none, query: "data perth" }))).toEqual(["4"]);
  });

  it("an empty status set shows all jobs", () => {
    expect(ids(filterJobs(jobs, none))).toEqual(["1", "2", "3", "4"]);
  });

  it("the empty-string status selects new jobs", () => {
    expect(ids(filterJobs(jobs, { ...none, statuses: new Set<JobStatus>([""]) }))).toEqual(["1"]);
  });

  it("several statuses in the set show the union", () => {
    expect(ids(filterJobs(jobs, { ...none, statuses: new Set<JobStatus>(["", "applied"]) }))).toEqual(["1", "4"]);
  });

  it("remote only keeps remote jobs", () => {
    expect(ids(filterJobs(jobs, { ...none, remoteOnly: true }))).toEqual(["2", "3"]);
  });

  it("filters combine", () => {
    expect(
      ids(filterJobs(jobs, { query: "engineer", statuses: new Set<JobStatus>(["skipped", "applied"]), remoteOnly: true }))
    ).toEqual(["3"]);
  });

  it("status counts ignore the status filter but respect the query and the remote filter", () => {
    const counts = statusCounts(jobs, { query: "engineer", statuses: new Set<JobStatus>(["applied"]), remoteOnly: false });
    expect(counts).toEqual({ all: 3, "": 0, shortlisted: 1, applied: 1, interview: 0, offer: 0, rejected: 0, skipped: 1 });
    const remote = statusCounts(jobs, { ...none, remoteOnly: true });
    expect(remote.all).toBe(2);
    expect(remote.skipped).toBe(1);
  });
});
