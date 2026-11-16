import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScrapePage from "@/app/scrape/page";

const config = {
  job: ["Current Role"],
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
const idle = {
  status: "idle",
  started_at: null,
  finished_at: null,
  new_jobs: null,
  total_jobs: null,
  error: null,
  pid: null,
  source_runs: [],
};

let calls: { url: string; method: string; body?: unknown }[];
let keywordsReply: { ok: boolean; status: number; body: unknown };

beforeEach(() => {
  calls = [];
  keywordsReply = { ok: true, status: 200, body: { keywords: ["Saved A", "Saved B"] } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const reply = (body: unknown, status = 200) => ({
        ok: status < 400,
        status,
        json: async () => body,
        text: async () => "",
      });
      if (url === "/api/keywords" && method === "GET") {
        return reply(keywordsReply.body, keywordsReply.status);
      }
      if (url === "/api/keywords") return reply(init?.body ? JSON.parse(String(init.body)) : { keywords: [] });
      if (url === "/api/scrape/config") return reply(config);
      if (url === "/api/scrape/status") return reply(idle);
      if (url === "/api/scrape/history") return reply([]);
      return reply({});
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Job titles save and load", () => {
  it("has no import button", async () => {
    render(<ScrapePage />);
    await screen.findByLabelText("Save job titles");
    expect(screen.queryByText(/import from keywords\.txt/i)).not.toBeInTheDocument();
  });

  it("saves the current titles through the icon", async () => {
    render(<ScrapePage />);
    await userEvent.click(await screen.findByLabelText("Save job titles"));

    const save = calls.find((c) => c.url === "/api/keywords" && c.method === "PUT");
    expect(save?.body).toEqual({ keywords: ["Current Role"] });
    expect(await screen.findByText("1 job title saved")).toBeInTheDocument();
  });

  it("loads the saved titles through the icon and keeps them in the config", async () => {
    render(<ScrapePage />);
    await userEvent.click(await screen.findByLabelText("Load job titles"));

    await waitFor(() =>
      expect(screen.getByPlaceholderText(/AI Engineer/)).toHaveValue("Saved A\nSaved B")
    );
    expect(await screen.findByText("2 job titles loaded")).toBeInTheDocument();
    await waitFor(() => {
      const put = calls.filter((c) => c.url === "/api/scrape/config" && c.method === "PUT").at(-1);
      expect((put?.body as { job: string[] }).job).toEqual(["Saved A", "Saved B"]);
    });
  });

  it("says so when the profile has no saved list, and keeps the titles", async () => {
    keywordsReply = { ok: false, status: 404, body: { error: "No saved job titles for this profile" } };
    render(<ScrapePage />);
    await userEvent.click(await screen.findByLabelText("Load job titles"));

    expect(await screen.findByText("No saved job titles")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/AI Engineer/)).toHaveValue("Current Role");
  });
});
