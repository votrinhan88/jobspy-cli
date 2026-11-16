import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JobsPage from "@/app/jobs/page";

const NOW = "2026-09-15T14:00:00Z";

function job(overrides: Record<string, string> = {}) {
  return {
    job_id: "job-1",
    title: "New Job",
    company: "Acme",
    location: "Sydney, Australia",
    date_posted: "2026-09-15",
    is_remote: "False",
    status: "",
    status_updated_at: "",
    first_seen_at: "2026-09-15T13:00:00Z",
    last_seen_at: "2026-09-15T13:00:00Z",
    closed_at: "",
    closed_reason: "",
    ...overrides,
  };
}

let jobs: ReturnType<typeof job>[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  jobs = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return { ok: true, status: 200, json: async () => jobs };
    })
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Jobs New marker", () => {
  const CRAWL = "2026-09-15T13:00:00Z";

  it("marks a job first seen in the latest crawl as New", async () => {
    jobs = [
      job({ first_seen_at: CRAWL, last_seen_at: CRAWL }),
      job({ job_id: "job-2", title: "Old Job", first_seen_at: "2026-09-14T13:00:00Z", last_seen_at: CRAWL }),
    ];

    render(<JobsPage />);

    const newRow = (await screen.findByText("New Job")).closest("tr")!;
    const oldRow = screen.getByText("Old Job").closest("tr")!;
    expect(within(newRow).getByText("NEW")).toBeInTheDocument();
    expect(within(oldRow).queryByText("NEW")).not.toBeInTheDocument();
    expect(within(newRow).getByText("Untriaged")).toHaveClass("sr-only");
  });

  it("marks nothing as New when the latest crawl found nothing new", async () => {
    jobs = [job({ first_seen_at: "2026-09-14T13:00:00Z", last_seen_at: CRAWL })];

    render(<JobsPage />);

    const row = (await screen.findByText("New Job")).closest("tr")!;
    expect(within(row).queryByText("NEW")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New 0" })).toBeInTheDocument();
  });

  it("shows no status chip for an untriaged row", async () => {
    jobs = [job({ first_seen_at: CRAWL, last_seen_at: CRAWL })];

    render(<JobsPage />);

    const row = (await screen.findByText("New Job")).closest("tr")!;
    const label = within(row).getByText("Untriaged");
    expect(label).not.toHaveClass("status-chip");
    expect(within(row).getByText("NEW")).toBeInTheDocument();
  });

  it("keeps the chip for a row with a real status", async () => {
    jobs = [job({ status: "applied" })];

    render(<JobsPage />);

    await userEvent.click(await screen.findByRole("button", { name: /^All/ }));
    const row = (await screen.findByText("New Job")).closest("tr")!;
    expect(within(row).getByText("Applied")).toHaveClass("status-chip");
  });

  it("filters to jobs first seen in the latest crawl", async () => {
    jobs = [
      job({ first_seen_at: CRAWL, last_seen_at: CRAWL }),
      job({ job_id: "job-3", title: "Week Job", first_seen_at: "2026-09-10T00:00:00Z", last_seen_at: CRAWL }),
      job({ job_id: "job-2", title: "Old Job", first_seen_at: "2026-08-01T00:00:00Z", last_seen_at: CRAWL }),
    ];

    render(<JobsPage />);

    await screen.findByText("New Job");
    await userEvent.click(screen.getByRole("button", { name: "New 1" }));
    expect(screen.getByText("New Job")).toBeInTheDocument();
    expect(screen.queryByText("Week Job")).not.toBeInTheDocument();
    expect(screen.queryByText("Old Job")).not.toBeInTheDocument();
  });
});
