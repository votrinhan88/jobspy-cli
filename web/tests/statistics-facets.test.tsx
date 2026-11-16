import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import StatisticsPage from "@/app/statistics/page";

function job(overrides: Record<string, string> = {}) {
  return {
    job_id: "job-1",
    title: "Data Engineer",
    company: "Acme",
    location: "Sydney, Australia",
    date_posted: "2026-08-01",
    is_remote: "True",
    status: "applied",
    status_updated_at: "2026-08-02T00:00:00Z",
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

describe("Statistics facets", () => {
  it("shows counts for the five facets", async () => {
    jobs = [
      job(),
      job({
        job_id: "job-2",
        title: "ML Engineer",
        location: "Hanoi, Vietnam",
        is_remote: "False",
        country: "Vietnam",
        city: "Hanoi",
        work_mode: "hybrid",
        seniority: "junior",
        employment_type: "contract",
      }),
    ];

    render(<StatisticsPage />);

    const countries = (await screen.findByText("Top countries")).closest(".top-card") as HTMLElement;
    expect(within(countries).getByText("Australia")).toBeInTheDocument();
    expect(within(countries).getByText("Vietnam")).toBeInTheDocument();

    const workModes = screen.getByText("Work modes").closest(".top-card") as HTMLElement;
    expect(within(workModes).getByText("Remote")).toBeInTheDocument();
    expect(within(workModes).getByText("Hybrid")).toBeInTheDocument();

    const seniority = screen.getByText("Seniority").closest(".top-card") as HTMLElement;
    expect(within(seniority).getByText("Senior")).toBeInTheDocument();
    expect(within(seniority).getByText("Junior")).toBeInTheDocument();

    const employment = screen.getByText("Employment type").closest(".top-card") as HTMLElement;
    expect(within(employment).getByText("Full-time")).toBeInTheDocument();
    expect(within(employment).getByText("Contract")).toBeInTheDocument();
  });
});
