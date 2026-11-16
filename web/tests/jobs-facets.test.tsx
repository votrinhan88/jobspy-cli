import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JobsPage from "@/app/jobs/page";

function job(overrides: Record<string, string> = {}) {
  return {
    job_id: "job-1",
    title: "Data Engineer",
    company: "Acme",
    location: "Sydney, Australia",
    date_posted: "2026-08-01",
    is_remote: "False",
    status: "",
    status_updated_at: "",
    first_seen_at: "2026-08-01T00:00:00Z",
    last_seen_at: "2026-08-01T00:00:00Z",
    closed_at: "",
    closed_reason: "",
    country: "Australia",
    city: "Sydney",
    work_mode: "remote",
    seniority: "senior",
    employment_type: "full_time",
    ...overrides,
  };
}

let jobs: ReturnType<typeof job>[] = [];

beforeEach(() => {
  jobs = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => jobs }))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Jobs facet filters", () => {
  it("filters by country", async () => {
    jobs = [
      job({ job_id: "1", title: "Data Engineer" }),
      job({
        job_id: "2",
        title: "ML Engineer",
        location: "Hanoi, Vietnam",
        country: "Vietnam",
        city: "Hanoi",
      }),
    ];

    render(<JobsPage />);

    expect(await screen.findByText("Data Engineer")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Country"), "Vietnam");
    expect(screen.queryByText("Data Engineer")).not.toBeInTheDocument();
    expect(screen.getByText("ML Engineer")).toBeInTheDocument();
  });

  it("shows the display labels in a facet select", async () => {
    jobs = [job({ work_mode: "onsite", seniority: "junior", employment_type: "part_time" })];

    render(<JobsPage />);

    expect(await screen.findByRole("option", { name: "On-site" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Junior" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Part-time" })).toBeInTheDocument();
  });

  it("clears all facet filters", async () => {
    jobs = [
      job({ job_id: "1", title: "Data Engineer" }),
      job({ job_id: "2", title: "ML Engineer", country: "Vietnam", city: "Hanoi", location: "Hanoi, Vietnam" }),
    ];

    render(<JobsPage />);

    await screen.findByText("Data Engineer");
    await userEvent.selectOptions(screen.getByLabelText("Country"), "Vietnam");
    expect(screen.queryByText("Data Engineer")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear facets" }));
    expect(screen.getByText("Data Engineer")).toBeInTheDocument();
  });
});
