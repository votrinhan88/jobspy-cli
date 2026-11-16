import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ArchivedPage from "@/app/archived/page";

function job(overrides: Record<string, string> = {}) {
  return {
    job_id: "job-1",
    title: "Data Engineer",
    company: "Acme",
    location: "Sydney, Australia",
    date_posted: "2026-08-01",
    job_url: "https://example.com/job/1",
    is_remote: "False",
    status: "skipped",
    status_updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

let jobs: ReturnType<typeof job>[] = [];

beforeEach(() => {
  jobs = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Archived page", () => {
  it("shows only skipped jobs", async () => {
    jobs = [job(), job({ job_id: "job-2", title: "ML Engineer", status: "applied" })];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => jobs }))
    );

    render(<ArchivedPage />);

    expect(await screen.findByText("Data Engineer")).toBeInTheDocument();
    expect(screen.queryByText("ML Engineer")).not.toBeInTheDocument();
  });

  it("restores a job and removes it from the list", async () => {
    jobs = [job()];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...jobs[0], status: "", status_updated_at: "2026-09-02T00:00:00Z" }),
        };
      }
      return { ok: true, status: 200, json: async () => jobs };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ArchivedPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Restore Data Engineer" }));

    await waitFor(() => expect(screen.queryByText("Data Engineer")).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/jobs/job-1",
      expect.objectContaining({ method: "PATCH" })
    );
    expect(screen.getByText("No archived jobs.")).toBeInTheDocument();
  });
});
