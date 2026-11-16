import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  it("shows a stale badge and no last seen date", async () => {
    jobs = [job()];

    render(<JobsPage />);

    expect(await screen.findByText("Old Job")).toBeInTheDocument();
    expect(screen.queryByText("2000-01-01")).not.toBeInTheDocument();
    expect(screen.getByText("Stale")).toBeInTheDocument();
  });

  it("does not show skipped jobs", async () => {
    jobs = [job({ status: "skipped" })];

    render(<JobsPage />);

    expect(await screen.findByText("No active jobs. Skipped jobs are in Archived.")).toBeInTheDocument();
    expect(screen.queryByText("Old Job")).not.toBeInTheDocument();
  });

  it("shows how long ago the job was first seen in the drawer", async () => {
    const first = new Date(Date.now() - 30.5 * 86_400_000).toISOString();
    jobs = [job({ first_seen_at: first, last_seen_at: first })];

    render(<JobsPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Old Job" }));
    expect(screen.getByText("First seen")).toBeInTheDocument();
    expect(screen.getByText("30 days ago")).toBeInTheDocument();
  });

  it("shows when the board date is later than the first sighting", async () => {
    jobs = [job({ first_seen_at: "2026-08-01T00:00:00Z", date_posted: "2026-08-05" })];

    render(<JobsPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Old Job" }));
    expect(screen.getByText("Later than the first sighting")).toBeInTheDocument();
  });

  it("shows no posting evidence for a row without a first sighting", async () => {
    jobs = [job({ first_seen_at: "", date_posted: "2026-08-05" })];

    render(<JobsPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Old Job" }));
    expect(screen.getByText("First seen")).toBeInTheDocument();
    expect(screen.queryByText(/days ago/)).not.toBeInTheDocument();
    expect(screen.queryByText("Later than the first sighting")).not.toBeInTheDocument();
  });

  it("shows a closed badge instead of a stale badge", async () => {
    jobs = [job({ closed_at: "2026-08-10T00:00:00Z", closed_reason: "url_404" })];

    render(<JobsPage />);

    expect(await screen.findByText("Old Job")).toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(screen.queryByText("Stale")).not.toBeInTheDocument();
  });
});
