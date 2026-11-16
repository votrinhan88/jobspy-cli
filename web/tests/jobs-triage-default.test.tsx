import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JobsPage from "@/app/jobs/page";

function job(id: string, status: string) {
  return {
    job_id: id,
    title: `Title ${id}`,
    company: "Acme",
    location: "Sydney, Australia",
    date_posted: "2026-09-01",
    is_remote: "False",
    status,
    status_updated_at: "",
    first_seen_at: "2026-09-02T00:00:00Z",
    last_seen_at: "2026-09-02T00:00:00Z",
    closed_at: "",
    closed_reason: "",
  };
}

let patches: { url: string; body: unknown }[];

beforeEach(() => {
  patches = [];
  const jobs = [job("raw", ""), job("short", "shortlisted"), job("app", "applied"), job("off", "offer")];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        patches.push({ url: String(input), body: JSON.parse(String(init.body)) });
        return { ok: true, status: 200, json: async () => ({ ...jobs[1], status: "applied" }) };
      }
      return { ok: true, status: 200, json: async () => jobs };
    })
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("Jobs as the triage inbox", () => {
  it("shows only untriaged jobs until another filter is picked", async () => {
    render(<JobsPage />);
    await screen.findByText("Title raw");
    expect(screen.queryByText("Title short")).not.toBeInTheDocument();
    expect(screen.queryByText("Title app")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Untriaged/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows every job after the All chip", async () => {
    render(<JobsPage />);
    await userEvent.click(await screen.findByRole("button", { name: /^All/ }));
    for (const id of ["raw", "short", "app", "off"]) expect(screen.getByText(`Title ${id}`)).toBeInTheDocument();
  });

  it("gives a tracked row the next stage and the status menu, and an untriaged row Shortlist and Skip", async () => {
    render(<JobsPage />);
    await userEvent.click(await screen.findByRole("button", { name: /^All/ }));
    const raw = screen.getByText("Title raw").closest("tr")!;
    expect(within(raw).getByRole("button", { name: "Shortlist" })).toBeInTheDocument();
    const short = screen.getByText("Title short").closest("tr")!;
    expect(within(short).getByRole("button", { name: "Apply" })).toBeInTheDocument();
    expect(within(short).queryByRole("button", { name: "Shortlist" })).not.toBeInTheDocument();
    const off = screen.getByText("Title off").closest("tr")!;
    expect(within(off).queryByRole("button", { name: /^(Apply|Interview|Offer)$/ })).not.toBeInTheDocument();
    expect(within(off).getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(within(off).getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });

  it("moves a tracked job to the next stage from the row", async () => {
    render(<JobsPage />);
    await userEvent.click(await screen.findByRole("button", { name: /^All/ }));
    const short = screen.getByText("Title short").closest("tr")!;
    await userEvent.click(within(short).getByRole("button", { name: "Apply" }));
    expect(patches[0].body).toEqual(expect.objectContaining({ status: "applied" }));
  });
});
