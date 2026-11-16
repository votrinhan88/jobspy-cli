import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JobsPage from "@/app/jobs/page";

function job(overrides: Record<string, string> = {}) {
  return {
    job_id: "job-1",
    title: "AI Engineer",
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
    min_amount: "100000",
    max_amount: "150000",
    currency: "AUD",
    interval: "yearly",
    ...overrides,
  };
}

let jobs: ReturnType<typeof job>[] = [];

beforeEach(() => {
  jobs = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/scrape/status")) {
        return { ok: true, status: 200, json: async () => ({ started_at: "2026-09-15T12:00:00Z" }) };
      }
      return { ok: true, status: 200, json: async () => jobs };
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Jobs salary column", () => {
  it("shows a salary header and value on the desktop table", async () => {
    jobs = [job()];

    render(<JobsPage />);

    const header = await screen.findByRole("columnheader", { name: "Salary" });
    expect(header).not.toHaveClass("cell-mobile-only");

    const row = screen.getByText("AI Engineer").closest("tr")!;
    const cell = within(row).getByText(/100,000/).closest("td")!;
    expect(cell).not.toHaveClass("cell-mobile-only");
    expect(cell).toHaveTextContent("AUD 100,000 – 150,000 / yearly");
  });

  it("shows a dash when the job has no salary", async () => {
    jobs = [job({ min_amount: "", max_amount: "" })];

    render(<JobsPage />);

    const row = (await screen.findByText("AI Engineer")).closest("tr")!;
    expect(within(row).getByText("—", { selector: "td[data-label='Salary']" })).toBeInTheDocument();
  });

  it("sorts by salary when the header is clicked", async () => {
    jobs = [
      job({ job_id: "lower", title: "Lower", min_amount: "100000", max_amount: "120000" }),
      job({ job_id: "higher", title: "Higher", min_amount: "180000", max_amount: "220000" }),
    ];

    render(<JobsPage />);
    await screen.findByText("Lower");
    const salary = screen.getByRole("button", { name: /Salary/ });

    await userEvent.click(salary);
    expect(screen.getByRole("columnheader", { name: "Salary" })).toHaveAttribute(
      "aria-sort",
      "descending"
    );
    let rows = screen.getAllByRole("row").filter((row) => /Lower|Higher/.test(row.textContent ?? ""));
    expect(rows[0]).toHaveTextContent("Higher");

    await userEvent.click(salary);
    expect(screen.getByRole("columnheader", { name: "Salary" })).toHaveAttribute(
      "aria-sort",
      "ascending"
    );
    rows = screen.getAllByRole("row").filter((row) => /Lower|Higher/.test(row.textContent ?? ""));
    expect(rows[0]).toHaveTextContent("Lower");
  });

  it("sorts by last seen when the header is clicked", async () => {
    jobs = [
      job({ job_id: "older", title: "Older", last_seen_at: "2026-09-01T13:00:00Z" }),
      job({ job_id: "newer", title: "Newer", last_seen_at: "2026-09-20T13:00:00Z" }),
    ];

    render(<JobsPage />);
    await screen.findByText("Older");
    await userEvent.click(screen.getByRole("button", { name: /Last seen/ }));

    const rows = screen.getAllByRole("row").filter((row) => /Older|Newer/.test(row.textContent ?? ""));
    expect(rows[0]).toHaveTextContent("Newer");
    expect(screen.getByRole("columnheader", { name: "Last seen" })).toHaveAttribute(
      "aria-sort",
      "descending"
    );
  });

  it("keeps the body cells in the header order", async () => {
    jobs = [job({ status: "applied" })];

    render(<JobsPage />);
    await screen.findByText("AI Engineer");

    const row = screen.getByText("AI Engineer").closest("tr")!;
    const labels = within(row)
      .getAllByRole("cell")
      .map((cell) => cell.getAttribute("data-label"));
    expect(labels).toEqual([
      "Title",
      "Company",
      "Location",
      "Posted",
      "Status",
      "Last seen",
      "Salary",
      null,
    ]);
  });
});
