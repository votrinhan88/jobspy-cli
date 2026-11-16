import { describe, expect, it } from "vitest";
import type { Job, JobStatus } from "@/lib/csv";
import { DEFAULT_SORT, filterJobs, formatLocation, groupByLocation, sortJobs, splitLocation, statusCounts } from "@/lib/jobs-view";

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

  it("sorts by last seen, newest first and oldest first", () => {
    const jobs = [
      j("old", { last_seen_at: "2026-08-01T00:00:00Z" }),
      j("none"),
      j("new", { last_seen_at: "2026-09-01T00:00:00Z" }),
    ];
    expect(ids(sortJobs(jobs, "seen", "desc"))).toEqual(["new", "old", "none"]);
    expect(ids(sortJobs(jobs, "seen", "asc"))).toEqual(["old", "new", "none"]);
  });

  it("breaks last seen ties by the posted date, newest first", () => {
    const run = "2026-09-15T13:00:00Z";
    const jobs = [
      j("older-post", { last_seen_at: run, date_posted: "2026-08-01" }),
      j("newer-post", { last_seen_at: run, date_posted: "2026-09-10" }),
      j("none", {}),
    ];
    expect(ids(sortJobs(jobs, "seen", "desc"))).toEqual([
      "newer-post",
      "older-post",
      "none",
    ]);
    expect(ids(sortJobs(jobs, "seen", "asc"))).toEqual([
      "newer-post",
      "older-post",
      "none",
    ]);
  });

  it("sorts by salary by the top of the range", () => {
    const jobs = [
      j("low", { min_amount: "50000", max_amount: "60000" }),
      j("none"),
      j("high", { min_amount: "150000", max_amount: "200000" }),
      j("open", { min_amount: "90000" }),
    ];
    expect(ids(sortJobs(jobs, "salary", "desc"))).toEqual(["high", "open", "low", "none"]);
    expect(ids(sortJobs(jobs, "salary", "asc"))).toEqual(["low", "open", "high", "none"]);
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
    expect(counts).toEqual({ all: 3, new: 0, "": 0, shortlisted: 1, applied: 1, interview: 0, offer: 0, accepted: 0, rejected: 0, skipped: 1 });
    const remote = statusCounts(jobs, { ...none, remoteOnly: true });
    expect(remote.all).toBe(2);
    expect(remote.skipped).toBe(1);
  });
});

describe("splitLocation", () => {
  it("returns the region without the Vietnamese rank prefix", () => {
    expect(splitLocation(j("1", { location: "Ấp Củ Chi, Việt Nam", region: "Thành phố Hồ Chí Minh" })).region).toBe(
      "Hồ Chí Minh"
    );
  });

  it("takes the country from the last part, the city from the first part and the region from the region column", () => {
    expect(splitLocation(j("1", { location: "Sydney, Australia", region: "New South Wales" }))).toEqual({
      country: "Australia",
      region: "New South Wales",
      city: "Sydney",
    });
  });

  it("trims spaces and handles a location with more than two parts", () => {
    expect(splitLocation(j("1", { location: " Surry Hills ,  Sydney , Australia " }))).toEqual({
      country: "Australia",
      region: "",
      city: "Surry Hills",
    });
  });

  it("treats a single part as the country", () => {
    expect(splitLocation(j("1", { location: "Australia" }))).toEqual({ country: "Australia", region: "", city: "" });
  });

  it("returns empty parts for an empty location or a job without a region column", () => {
    expect(splitLocation(j("1"))).toEqual({ country: "", region: "", city: "" });
  });
});

describe("sortJobs by location tiers", () => {
  const jobs = [
    j("syd", { location: "Sydney, Australia", region: "New South Wales" }),
    j("mel", { location: "Melbourne, Australia", region: "Victoria" }),
    j("han", { location: "Hà Nội, Việt Nam", region: "Hà Nội" }),
    j("new", { location: "Newcastle, Australia", region: "New South Wales" }),
    j("car", { location: "Carlton, Australia", region: "Victoria" }),
    j("none"),
  ];

  it("sorts by country, then region, then city, and puts empty locations last", () => {
    expect(ids(sortJobs(jobs, "location", "asc"))).toEqual(["new", "syd", "car", "mel", "han", "none"]);
  });

  it("reverses the tiers in descending order and keeps empty locations last", () => {
    expect(ids(sortJobs(jobs, "location", "desc"))).toEqual(["han", "mel", "car", "syd", "new", "none"]);
  });

  it("puts a job without a region after the jobs with a region inside the same country", () => {
    const mixed = [
      j("a", { location: "Perth, Australia", region: "" }),
      j("b", { location: "Sydney, Australia", region: "New South Wales" }),
    ];
    expect(ids(sortJobs(mixed, "location", "asc"))).toEqual(["b", "a"]);
  });

  it("ignores case", () => {
    const mixed = [j("a", { location: "x, australia" }), j("b", { location: "y, Austria" }), j("c", { location: "z, Australia" })];
    expect(ids(sortJobs(mixed, "location", "asc"))).toEqual(["a", "c", "b"]);
  });
});

describe("groupByLocation", () => {
  const jobs = [
    j("mel", { location: "Melbourne, Australia", region: "Victoria" }),
    j("han", { location: "Hà Nội, Việt Nam", region: "Hà Nội" }),
    j("syd", { location: "Sydney, Australia", region: "New South Wales" }),
    j("car", { location: "Carlton, Australia", region: "Victoria" }),
    j("per", { location: "Perth, Australia" }),
    j("none"),
  ];
  const groups = groupByLocation(jobs);

  it("lists countries alphabetically with the unknown group last, each with a job count", () => {
    expect(groups.map((g) => [g.country, g.count])).toEqual([
      ["Australia", 4],
      ["Việt Nam", 1],
      ["", 1],
    ]);
  });

  it("lists regions alphabetically inside a country with the job count and puts jobs without a region last", () => {
    const australia = groups[0];
    expect(australia.regions.map((r) => [r.region, r.count])).toEqual([
      ["New South Wales", 1],
      ["Victoria", 2],
      ["", 1],
    ]);
  });

  it("keeps the order of the input jobs inside a region", () => {
    expect(ids(groups[0].regions[1].jobs)).toEqual(["mel", "car"]);
  });

  it("returns an empty list for no jobs and never drops or repeats a job", () => {
    expect(groupByLocation([])).toEqual([]);
    const all = groups.flatMap((g) => g.regions.flatMap((r) => r.jobs));
    expect(ids(all).sort()).toEqual(ids(jobs).sort());
  });
});

describe("formatLocation", () => {
  it("shows country, region and city, widest place first", () => {
    expect(formatLocation(j("1", { location: "Melbourne, Australia", region: "Victoria" }))).toBe(
      "Australia, Victoria, Melbourne"
    );
  });

  it("shows the stored location when there is no region", () => {
    expect(formatLocation(j("1", { location: "Melbourne, Australia" }))).toBe("Australia, Melbourne");
    expect(formatLocation(j("1", { location: "Melbourne, Australia", region: "  " }))).toBe("Australia, Melbourne");
  });

  it("does not repeat a region that is already part of the location, in any letter case", () => {
    expect(formatLocation(j("1", { location: "Hà Nội, Việt Nam", region: "Hà Nội" }))).toBe("Việt Nam, Hà Nội");
    expect(formatLocation(j("1", { location: "Victoria, Australia", region: "victoria" }))).toBe("Australia, Victoria");
    expect(formatLocation(j("1", { location: "Singapore, Singapore", region: "Singapore" }))).toBe("Singapore, Singapore");
  });

  it("does not repeat a region whose name contains a stored part, such as a Vietnamese city prefix", () => {
    expect(formatLocation(j("1", { location: "Hà Nội, Việt Nam", region: "Thành phố Hà Nội" }))).toBe("Việt Nam, Hà Nội");
    expect(
      formatLocation(j("1", { location: "Ấp Củ Chi, Việt Nam", region: "Thành phố Hồ Chí Minh" }))
    ).toBe("Việt Nam, Hồ Chí Minh, Ấp Củ Chi");
  });

  it("drops the Vietnamese rank prefix from the region, as it does from the city", () => {
    expect(formatLocation(j("1", { location: "Ấp Củ Chi, Việt Nam", region: "TP. Hồ Chí Minh" }))).toBe(
      "Việt Nam, Hồ Chí Minh, Ấp Củ Chi"
    );
    expect(formatLocation(j("1", { location: "Đà Nẵng, Việt Nam", region: "Thành phố Đà Nẵng" }))).toBe(
      "Việt Nam, Đà Nẵng"
    );
  });

  it("keeps a region that only contains the country name", () => {
    expect(
      formatLocation(j("1", { location: "Canberra, Australia", region: "Australian Capital Territory" }))
    ).toBe("Australia, Australian Capital Territory, Canberra");
  });

  it("keeps every stored part and puts the country first, then the region, then the stored places from wide to narrow", () => {
    expect(formatLocation(j("1", { location: "Surry Hills, Sydney, Australia", region: "New South Wales" }))).toBe(
      "Australia, New South Wales, Sydney, Surry Hills"
    );
  });

  it("puts the region after a country that stands alone", () => {
    expect(formatLocation(j("1", { location: "Australia", region: "Victoria" }))).toBe("Australia, Victoria");
  });

  it("returns an empty text for an empty location", () => {
    expect(formatLocation(j("1"))).toBe("");
    expect(formatLocation(j("1", { region: "Victoria" }))).toBe("");
  });
});

describe("filterJobs facets", () => {
  const jobs = [
    j("1", {
      country: "Australia",
      city: "Sydney",
      work_mode: "remote",
      seniority: "senior",
      employment_type: "full_time",
    }),
    j("2", {
      country: "Australia",
      city: "Melbourne",
      work_mode: "hybrid",
      seniority: "senior",
      employment_type: "contract",
    }),
    j("3", {
      country: "Vietnam",
      city: "Hanoi",
      work_mode: "onsite",
      seniority: "junior",
      employment_type: "full_time",
    }),
  ];

  it("filters by country and city", () => {
    expect(ids(filterJobs(jobs, { ...none, country: ["Australia"] }))).toEqual(["1", "2"]);
    expect(ids(filterJobs(jobs, { ...none, city: ["Hanoi"] }))).toEqual(["3"]);
  });

  it("several values in one facet show the union", () => {
    expect(ids(filterJobs(jobs, { ...none, country: ["Australia", "Vietnam"] }))).toEqual(["1", "2", "3"]);
    expect(ids(filterJobs(jobs, { ...none, city: ["Sydney", "Hanoi"] }))).toEqual(["1", "3"]);
  });

  it("different facets combine with AND", () => {
    expect(
      ids(filterJobs(jobs, { ...none, country: ["Australia"], city: ["Sydney", "Hanoi"] }))
    ).toEqual(["1"]);
  });

  it("filters by work mode, seniority and employment type", () => {
    expect(ids(filterJobs(jobs, { ...none, workMode: ["remote"] }))).toEqual(["1"]);
    expect(ids(filterJobs(jobs, { ...none, seniority: ["senior"] }))).toEqual(["1", "2"]);
    expect(ids(filterJobs(jobs, { ...none, employmentType: ["full_time"] }))).toEqual(["1", "3"]);
  });

  it("combines facet filters", () => {
    expect(
      ids(
        filterJobs(jobs, {
          ...none,
          country: ["Australia"],
          workMode: ["hybrid"],
          seniority: ["senior"],
        })
      )
    ).toEqual(["2"]);
  });

  it("an empty facet list does not filter", () => {
    expect(
      ids(
        filterJobs(jobs, {
          ...none,
          country: [],
          city: [],
          workMode: [],
          seniority: [],
          employmentType: [],
        })
      )
    ).toEqual(["1", "2", "3"]);
  });

  it("status counts respect the facet filters", () => {
    const counts = statusCounts(jobs, { ...none, country: ["Australia"] });
    expect(counts.all).toBe(2);
  });
});

describe("filterJobs latest run", () => {
  const run = "2026-09-15T12:00:00Z";
  const jobs = [
    j("old", { first_seen_at: "2026-08-01T00:00:00Z" }),
    j("new", { first_seen_at: "2026-09-15T13:00:00Z" }),
    j("same", { first_seen_at: run }),
    j("none"),
  ];

  it("keeps only jobs first seen in the latest run", () => {
    expect(ids(filterJobs(jobs, { ...none, newOnly: true, newSince: run }))).toEqual(["new", "same"]);
  });

  it("does not filter when the New chip is off", () => {
    expect(ids(filterJobs(jobs, { ...none, newSince: run }))).toEqual(["old", "new", "same", "none"]);
  });

  it("status counts include the latest-run count", () => {
    const counts = statusCounts(jobs, { ...none, newSince: run });
    expect(counts.new).toBe(2);
  });
});

describe("filterJobs query and region", () => {
  it("matches the region too", () => {
    const jobs = [j("a", { location: "Melbourne, Australia", region: "Victoria" }), j("b", { location: "Perth, Australia" })];
    expect(ids(filterJobs(jobs, { ...none, query: "victoria" }))).toEqual(["a"]);
  });
});
