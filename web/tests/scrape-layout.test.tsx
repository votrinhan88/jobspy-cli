import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScrapePage from "@/app/scrape/page";

const config = {
  job: ["A"],
  location: ["Australia"],
  results_wanted: 20,
  site_name: ["linkedin"],
  workers: 4,
  title_exclude: [],
  exclude_companies: [],
  companies: [],
  providers: [],
  schedule: null,
  fetch_linkedin_description: true,
};
const done = {
  status: "done",
  started_at: "2026-08-01T00:00:00Z",
  finished_at: "2026-08-01T00:01:00Z",
  new_jobs: 3,
  total_jobs: 9,
  error: null,
  pid: null,
  source_runs: [],
};

let calls: { url: string; method: string; body?: unknown }[];
let runStatus: Record<string, unknown>;
let boards: { entry: string; name: string; jobs: number }[];
let putOk: boolean;

beforeEach(() => {
  calls = [];
  runStatus = done;
  putOk = true;
  boards = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url === "/api/scrape/config" && method === "PUT") {
        return { ok: putOk, status: putOk ? 200 : 500, json: async () => ({ error: "disk full" }), text: async (): Promise<string> => "" };
      }
      const body =
        url === "/api/scrape/config"
          ? config
          : url === "/api/scrape/status"
            ? runStatus
            : url === "/api/scrape/history"
              ? []
              : url === "/api/boards/discovered"
                ? { boards }
                : {};
      return { ok: true, status: 200, json: async () => body, text: async (): Promise<string> => "" };
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Scrape layout", () => {
  it("encloses the settings and the run button in one frame", async () => {
    render(<ScrapePage />);
    const frame = await screen.findByRole("group", { name: "Scrape settings" });

    expect(within(frame).getByLabelText("Job titles")).toBeInTheDocument();
    expect(within(frame).getByLabelText("Locations")).toBeInTheDocument();
    expect(within(frame).getByLabelText("Results per search")).toBeInTheDocument();
    expect(within(frame).getAllByRole("button", { name: "Run scrape" })).toHaveLength(2);
  });

  it("keeps the status and the log outside the frame", async () => {
    render(<ScrapePage />);
    const frame = await screen.findByRole("group", { name: "Scrape settings" });
    const outputs = screen.getByRole("region", { name: "Scrape output" });

    expect(frame).not.toContainElement(outputs);
    expect(within(outputs).getByText(/new/i)).toBeInTheDocument();
    expect(within(outputs).getByText("Show log")).toBeInTheDocument();
  });

  it("shows the source table above the log", async () => {
    runStatus = {
      ...done,
      source_runs: [{ site: "linkedin", attempts: 1, failed: 0, skipped: 0, jobs: 5, duration_ms: 1000, error: null }],
    };
    render(<ScrapePage />);
    const outputs = await screen.findByRole("region", { name: "Scrape output" });
    const table = await within(outputs).findByRole("table", { name: "" }).catch(() => within(outputs).getAllByRole("table")[0]);
    const log = within(outputs).getByText("Show log");

    expect(table.compareDocumentPosition(log) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("puts the job sites above the job titles", async () => {
    render(<ScrapePage />);
    const frame = await screen.findByRole("group", { name: "Scrape settings" });
    const sites = within(frame).getByText("Job sites");
    const titles = within(frame).getByLabelText("Job titles");

    expect(sites.compareDocumentPosition(titles) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the run button label the same after a run", async () => {
    render(<ScrapePage />);
    expect((await screen.findAllByRole("button", { name: "Run scrape" })).length).toBe(2);
  });

  it("hides the optional settings behind an Advanced switch that shows them when on", async () => {
    const user = userEvent.setup();
    render(<ScrapePage />);
    const frame = await screen.findByRole("group", { name: "Scrape settings" });
    const toggle = within(frame).getByRole("switch", { name: /Advanced settings/ });

    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(within(frame).getByText("0 configured")).toBeInTheDocument();
    expect(within(frame).queryByRole("group", { name: "Advanced settings" })).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    const advanced = within(frame).getByRole("group", { name: "Advanced settings" });
    expect(within(advanced).getByLabelText("Company boards")).toBeInTheDocument();
    expect(within(advanced).getByLabelText("Exclude companies")).toBeInTheDocument();
    expect(within(advanced).getByText("ATS crawlers")).toBeInTheDocument();
    expect(within(advanced).getByRole("checkbox", { name: "Lever" })).toBeInTheDocument();
    expect(within(advanced).queryByText("Fetch LinkedIn descriptions")).not.toBeInTheDocument();
    expect(within(frame).getByText("Fetch LinkedIn descriptions")).toBeInTheDocument();
    expect(advanced).not.toContainElement(within(frame).getByText("Job sites"));
    expect(advanced).not.toContainElement(within(frame).getByLabelText("Job titles"));

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(within(frame).queryByRole("group", { name: "Advanced settings" })).not.toBeInTheDocument();
  });

  it("shows whether the settings are saved", async () => {
    const user = userEvent.setup();
    render(<ScrapePage />);
    const frame = await screen.findByRole("group", { name: "Scrape settings" });
    expect(within(frame).getByRole("status")).toHaveTextContent("All changes saved");

    await user.type(within(frame).getByLabelText("Locations"), "x");
    expect(within(frame).getByRole("status")).toHaveTextContent("Unsaved changes");
    await user.tab();
    await waitFor(() => expect(within(frame).getByRole("status")).toHaveTextContent("All changes saved"));
  });

  it("shows a save error with a retry", async () => {
    putOk = false;
    const user = userEvent.setup();
    render(<ScrapePage />);
    const frame = await screen.findByRole("group", { name: "Scrape settings" });

    await user.type(within(frame).getByLabelText("Locations"), "x");
    await user.tab();
    await waitFor(() => expect(within(frame).getByRole("status")).toHaveTextContent("Could not save changes"));
    expect(within(frame).getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("lists suggested boards inside Advanced and adds one", async () => {
    boards = [{ entry: "ashby:xero", name: "Xero", jobs: 3 }];
    const user = userEvent.setup();
    render(<ScrapePage />);
    const frame = await screen.findByRole("group", { name: "Scrape settings" });
    await user.click(within(frame).getByRole("switch", { name: /Advanced settings/ }));
    const suggestions = await screen.findByRole("region", { name: "Suggested company boards" });

    expect(within(frame).getByRole("group", { name: "Advanced settings" })).toContainElement(suggestions);
    expect(within(suggestions).getByText("Xero")).toBeInTheDocument();
    expect(within(suggestions).getByText("3 saved jobs · Ashby")).toBeInTheDocument();

    await user.click(within(suggestions).getByRole("button", { name: "Add Xero" }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === "PUT" && c.url === "/api/scrape/config" &&
        JSON.stringify((c.body as { companies: string[] }).companies) === JSON.stringify(["ashby:xero:Xero"]))).toBe(true)
    );
    expect(within(suggestions).queryByText("Xero")).not.toBeInTheDocument();
  });

  it("dismisses a suggestion and previews ten in two columns", async () => {
    boards = Array.from({ length: 12 }, (_, i) => ({ entry: `lever:co${i}`, name: `Co${i}`, jobs: 12 - i }));
    const user = userEvent.setup();
    render(<ScrapePage />);
    await user.click(await screen.findByRole("switch", { name: /Advanced settings/ }));
    const suggestions = await screen.findByRole("region", { name: "Suggested company boards" });

    expect(within(suggestions).getAllByRole("listitem")).toHaveLength(10);
    expect(within(suggestions).queryByText(/Companies from your saved jobs/)).not.toBeInTheDocument();
    await user.click(within(suggestions).getByRole("button", { name: "View all 12 suggestions" }));
    expect(within(suggestions).getAllByRole("listitem")).toHaveLength(12);

    await user.click(within(suggestions).getByRole("button", { name: "Dismiss Co0" }));
    expect(within(suggestions).queryByText("Co0")).not.toBeInTheDocument();
    expect(calls).toContainEqual({ url: "/api/boards/discovered", method: "POST", body: { dismiss: "lever:co0" } });
  });

  it("hides the suggestions when there are none", async () => {
    render(<ScrapePage />);
    await screen.findByRole("group", { name: "Scrape settings" });
    expect(screen.queryByRole("region", { name: "Suggested company boards" })).not.toBeInTheDocument();
  });
});
