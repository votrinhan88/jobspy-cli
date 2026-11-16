import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SourceRunsTable } from "@/app/scrape/_components/source-runs-table";
import type { SourceRunStatus } from "@/lib/scrape-status";

const RUNS: SourceRunStatus[] = [
  {
    site: "linkedin",
    attempts: 2,
    succeeded: 2,
    failed: 0,
    skipped: 0,
    jobs: 20,
    duration_ms: 1500,
    error: null,
  },
  {
    site: "indeed",
    attempts: 1,
    succeeded: 0,
    failed: 1,
    skipped: 0,
    jobs: 0,
    duration_ms: 800,
    error: "blocked by the board",
  },
  {
    site: "google",
    attempts: 0,
    succeeded: 0,
    failed: 0,
    skipped: 1,
    jobs: 0,
    duration_ms: 0,
    error: null,
  },
];

describe("SourceRunsTable", () => {
  it("shows each source with its result", () => {
    render(<SourceRunsTable runs={RUNS} />);

    expect(screen.getByRole("columnheader", { name: "Source" })).toBeInTheDocument();
    expect(screen.getByText("LinkedIn")).toBeInTheDocument();
    expect(screen.getByText("Indeed")).toBeInTheDocument();
    expect(screen.getByText("Google Jobs")).toBeInTheDocument();
    expect(screen.getByText("OK")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Skipped")).toBeInTheDocument();
  });

  it("shows the job count, duration and error", () => {
    render(<SourceRunsTable runs={RUNS} />);

    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("1.5s")).toBeInTheDocument();
    expect(screen.getByText("blocked by the board")).toBeInTheDocument();
  });

  it("renders nothing when there is no run", () => {
    const { container } = render(<SourceRunsTable runs={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
