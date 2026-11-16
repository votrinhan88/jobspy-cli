import { describe, expect, it } from "vitest";
import type { Job } from "@/lib/csv";
import { FACET_FILTERS, facetOptions, facetValueLabel } from "@/lib/facets";

function j(fields: Partial<Record<string, string>> = {}): Job {
  return {
    job_id: "1",
    title: "",
    company: "",
    location: "",
    date_posted: "",
    is_remote: "False",
    status: "",
    country: "",
    city: "",
    work_mode: "",
    seniority: "",
    employment_type: "",
    ...fields,
  } as unknown as Job;
}

describe("facet labels", () => {
  it("lists the five filters in display order", () => {
    expect(FACET_FILTERS.map((f) => [f.key, f.label])).toEqual([
      ["country", "Country"],
      ["city", "City"],
      ["work_mode", "Work mode"],
      ["seniority", "Seniority"],
      ["employment_type", "Employment type"],
    ]);
  });

  it("gives display labels for the stored codes", () => {
    expect(facetValueLabel("work_mode", "remote")).toBe("Remote");
    expect(facetValueLabel("work_mode", "onsite")).toBe("On-site");
    expect(facetValueLabel("seniority", "lead")).toBe("Lead");
    expect(facetValueLabel("employment_type", "full_time")).toBe("Full-time");
  });

  it("keeps an unknown value as it is", () => {
    expect(facetValueLabel("work_mode", "shift")).toBe("shift");
    expect(facetValueLabel("country", "Australia")).toBe("Australia");
  });
});

describe("facetOptions", () => {
  it("removes empty values, removes repeats and sorts by display label", () => {
    const jobs = [
      j({ country: "Vietnam" }),
      j({ country: "" }),
      j({ country: "Australia" }),
      j({ country: "Australia" }),
    ];
    expect(facetOptions(jobs, "country")).toEqual(["Australia", "Vietnam"]);
  });

  it("sorts work modes by their display label, not their stored code", () => {
    const jobs = [j({ work_mode: "remote" }), j({ work_mode: "onsite" }), j({ work_mode: "hybrid" })];
    expect(facetOptions(jobs, "work_mode")).toEqual(["hybrid", "onsite", "remote"]);
  });
});

describe("facetOptions with a selection", () => {
  const jobs = [
    j({ country: "Australia", city: "Sydney", work_mode: "remote" }),
    j({ country: "Australia", city: "Melbourne", work_mode: "hybrid" }),
    j({ country: "Vietnam", city: "Hanoi", work_mode: "onsite" }),
  ];

  it("narrows city options to the selected countries", () => {
    expect(facetOptions(jobs, "city", { country: ["Vietnam"] })).toEqual(["Hanoi"]);
  });

  it("narrows country options to the selected cities", () => {
    expect(facetOptions(jobs, "country", { city: ["Melbourne"] })).toEqual(["Australia"]);
  });

  it("ignores the facet's own selection", () => {
    expect(facetOptions(jobs, "country", { country: ["Vietnam"] })).toEqual(["Australia", "Vietnam"]);
  });

  it("uses every other facet as context", () => {
    expect(facetOptions(jobs, "city", { country: ["Australia"], work_mode: ["hybrid"] })).toEqual([
      "Melbourne",
    ]);
  });

  it("returns no options when no job matches the other facets", () => {
    expect(facetOptions(jobs, "city", { country: ["Vietnam"], work_mode: ["remote"] })).toEqual([]);
  });
});
