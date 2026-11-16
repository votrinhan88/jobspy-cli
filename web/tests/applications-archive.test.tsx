import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ApplicationsPage from "@/app/applications/page";

function job(overrides: Record<string, string> = {}) {
  return {
    job_id: "job-1",
    title: "Applied Job",
    company: "Acme",
    location: "Sydney, Australia",
    date_posted: "2026-08-01",
    is_remote: "False",
    status: "applied",
    status_updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [
        job(),
        job({ job_id: "job-2", title: "Skipped Job", status: "skipped" }),
      ],
    }))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("Applications page", () => {
  it("does not show skipped jobs", async () => {
    render(<ApplicationsPage />);

    expect(await screen.findByText("Applied Job")).toBeInTheDocument();
    expect(screen.queryByText("Skipped Job")).not.toBeInTheDocument();
  });

  it("does not show skipped jobs in the Gantt view", async () => {
    window.localStorage.setItem("applications_view", "gantt");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/api/jobs/log")) {
          return {
            ok: true,
            status: 200,
            json: async () => [
              { job_id: "job-1", from: "", to: "applied", at: "2026-09-01T00:00:00Z" },
              { job_id: "job-2", from: "", to: "skipped", at: "2026-09-01T00:00:00Z" },
            ],
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => [
            job(),
            job({ job_id: "job-2", title: "Skipped Job", status: "skipped" }),
          ],
        };
      })
    );

    render(<ApplicationsPage />);

    await screen.findByRole("region", { name: "Status history by job" });
    expect(screen.getByText("Applied Job")).toBeInTheDocument();
    expect(screen.queryByText("Skipped Job")).not.toBeInTheDocument();
  });
});
