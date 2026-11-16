import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import StatisticsPage from "@/app/statistics/page";

function job(overrides: Record<string, string> = {}) {
  return {
    job_id: "job-1",
    title: "Data Engineer",
    company: "Acme",
    location: "Sydney, Australia",
    date_posted: "2026-08-01",
    is_remote: "False",
    status: "applied",
    status_updated_at: "2026-08-02T00:00:00Z",
    ...overrides,
  };
}

function stubFetch(logOk: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/jobs/log")) {
        if (!logOk) return { ok: false, status: 500, json: async () => ({ error: "no" }) };
        return {
          ok: true,
          status: 200,
          json: async () => [
            { job_id: "job-1", from: "", to: "shortlisted", at: "2026-08-03T00:00:00Z" },
            { job_id: "job-1", from: "shortlisted", to: "applied", at: "2026-08-04T00:00:00Z" },
          ],
        };
      }
      return { ok: true, status: 200, json: async () => [job()] };
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Statistics flow", () => {
  it("draws the application flow from the status log", async () => {
    stubFetch(true);
    render(<StatisticsPage />);

    expect(await screen.findByRole("heading", { name: "Flow" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /application flow/i })).toBeInTheDocument();
    expect(screen.getByText("Scrape to Shortlisted: 1")).toBeInTheDocument();
    expect(screen.getByText(/backward moves are not shown/i)).toBeInTheDocument();
  });

  it("keeps the page when the status log fails", async () => {
    stubFetch(false);
    render(<StatisticsPage />);

    expect(await screen.findByRole("heading", { name: "Flow" })).toBeInTheDocument();
    expect(screen.getByText(/no status changes recorded/i)).toBeInTheDocument();
  });

  it("drops the pipeline bars and counts the jobs not yet reviewed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => ({
        ok: true,
        status: 200,
        json: async () =>
          String(input).includes("/api/jobs/log")
            ? []
            : [job(), job({ job_id: "job-2", status: "" }), job({ job_id: "job-3", status: "" })],
      }))
    );
    render(<StatisticsPage />);

    await screen.findByRole("heading", { name: "Flow" });
    expect(screen.queryByRole("heading", { name: "Pipeline" })).not.toBeInTheDocument();
    const tile = screen.getByText("Not yet reviewed").closest(".stat-card")!;
    expect(tile).toHaveTextContent("2");
  });
});
