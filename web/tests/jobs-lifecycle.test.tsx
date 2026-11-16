import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import JobsPage from "@/app/jobs/page";

function job(overrides: Record<string, string> = {}) {
  return {
    job_id: "job-1",
    title: "Old Job",
    company: "Acme",
    location: "Sydney, Australia",
    date_posted: "2026-08-01",
    is_remote: "False",
    status: "",
    status_updated_at: "",
    first_seen_at: "2000-01-01T00:00:00Z",
    last_seen_at: "2000-01-01T00:00:00Z",
    closed_at: "",
    closed_reason: "",
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

describe("Jobs lifecycle display", () => {
  it("shows the last seen date and a stale badge", async () => {
    jobs = [job()];

    render(<JobsPage />);

    expect(await screen.findByText("Old Job")).toBeInTheDocument();
    expect(screen.getByText("2000-01-01")).toBeInTheDocument();
    expect(screen.getByText("Stale")).toBeInTheDocument();
  });

  it("shows a closed badge instead of a stale badge", async () => {
    jobs = [job({ closed_at: "2026-08-10T00:00:00Z", closed_reason: "url_404" })];

    render(<JobsPage />);

    expect(await screen.findByText("Old Job")).toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(screen.queryByText("Stale")).not.toBeInTheDocument();
  });
});
