import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TableView } from "@/app/applications/_components/table-view";
import type { Job } from "@/lib/csv";

function job(id: string, status: string, extra: Record<string, string> = {}): Job {
  return {
    job_id: id,
    title: `Title ${id}`,
    company: `Co ${id}`,
    location: "Sydney, Australia",
    date_posted: "2026-09-01",
    status,
    first_seen_at: "2026-09-02T00:00:00Z",
    last_seen_at: "2026-09-02T00:00:00Z",
    closed_at: "",
    ...extra,
  } as unknown as Job;
}

function setup(jobs: Job[], onChange = vi.fn(), crawlAt: number | null = null) {
  render(<TableView jobs={jobs} crawlAt={crawlAt} pending={new Set()} onChange={onChange} onOpen={() => {}} />);
  return onChange;
}

describe("Applications table", () => {
  it("uses the Jobs columns", () => {
    setup([job("a", "applied")]);
    for (const name of ["Title", "Company", "Location", "Posted", "Status", "Salary"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("shows the next stage name as the action and moves the job on click", async () => {
    const onChange = setup([job("a", "applied")]);
    await userEvent.click(screen.getByRole("button", { name: "Interview" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ job_id: "a" }), "interview");
  });

  it("offers Accept and Reject at the offer stage and keeps the menu", async () => {
    const onChange = setup([job("a", "offer")]);
    expect(screen.queryByRole("button", { name: /^(Apply|Interview|Offer)$/ })).not.toBeInTheDocument();
    const row = screen.getByText("Title a").closest("tr")!;
    expect(within(row).getByRole("button", { name: /^Status of/ })).toBeInTheDocument();
    await userEvent.click(within(row).getByRole("button", { name: "Accept" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ job_id: "a" }), "accepted");
    await userEvent.click(within(row).getByRole("button", { name: "Reject" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ job_id: "a" }), "rejected");
  });

  it("colours each action like the chip of the stage it moves to", () => {
    for (const [from, labels] of [
      ["shortlisted", { Apply: "applied" }],
      ["applied", { Interview: "interview" }],
      ["interview", { Offer: "offer" }],
      ["offer", { Accept: "accepted", Reject: "rejected" }],
    ] as const) {
      const { unmount } = render(<TableView jobs={[job("a", from)]} crawlAt={null} pending={new Set()} onChange={vi.fn()} onOpen={() => {}} />);
      for (const [label, target] of Object.entries(labels)) {
        expect(screen.getByRole("button", { name: label })).toHaveClass(`status-chip--${target}`);
      }
      unmount();
    }
  });

  it("shows no stage button for an accepted job", () => {
    setup([job("a", "accepted")]);
    const row = screen.getByText("Title a").closest("tr")!;
    expect(within(row).queryByRole("button", { name: /^(Apply|Interview|Offer|Accept|Reject)$/ })).not.toBeInTheDocument();
  });

  it("sorts by a column header", async () => {
    setup([job("a", "applied", { company: "Beta" }), job("b", "applied", { company: "Alpha" })]);
    await userEvent.click(screen.getByRole("button", { name: "Company" }));
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Alpha")).toBeInTheDocument();
  });

  it("marks a job New with the shared rule", () => {
    setup([job("a", "applied")], vi.fn(), Date.parse("2026-09-02T00:00:00Z"));
    expect(screen.getByText("NEW")).toBeInTheDocument();
  });
});
