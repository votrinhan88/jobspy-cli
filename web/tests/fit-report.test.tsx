import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FitReport } from "@/app/jobs/_components/fit-report";

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

const ranking = [
  { tag: "backend", score: 62, matched: ["python", "sql"], missing: ["docker"] },
  { tag: "frontend", score: 20, matched: ["css"], missing: ["python"] },
];

const saved = {
  model: "claude-haiku-5-5",
  created_at: "2026-11-02T10:00:00.000Z",
  tag: "backend",
  resume_version: 2,
  resume_hash: "h",
  job_hash: "j",
  analysis: {
    score: 64,
    summary: "Decent fit for the role.",
    strengths: ["Strong Python"],
    requirements: [
      { requirement: "Python", evidence: "Python engineer", verdict: "strong", reasoning: "Named directly." },
      { requirement: "Team leadership", evidence: "", verdict: "missing", reasoning: "No leadership shown." },
    ],
    gaps: [{ gap: "No Docker", fix: "Add Docker to the Skills line." }],
    rewrites: [{ original: "Built ETL jobs.", suggested: "Built and ran ETL jobs for daily reports." }],
  },
};

let routes: Record<string, (init?: RequestInit) => ReturnType<typeof json>>;
const fetchMock = vi.fn();
const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  routes = {
    "GET /api/jobs/job-1/match": () => json(200, { hasDescription: true, ranking }),
    "GET /api/jobs/job-1/analysis?tag=backend": () =>
      json(200, { available: true, sendChars: 4321, saved: null, stale: false }),
    "GET /api/jobs/job-1/submitted": () => json(200, { submitted: null, changed: false }),
  };
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url}`;
    const handler = routes[key];
    if (!handler) throw new Error(`Unexpected request: ${key}`);
    return handler(init);
  });
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const calls = (key: string) => fetchMock.mock.calls.filter(([url, init]) => `${init?.method ?? "GET"} ${url}` === key);

describe("FitReport keyword match", () => {
  it("shows the score of the chosen tag with matched and missing words", async () => {
    render(<FitReport jobId="job-1" tag="backend" />);
    expect(await screen.findByText(/keyword match/i)).toHaveTextContent("62%");
    expect(screen.getByText(/matched:/i)).toHaveTextContent("python, sql");
    expect(screen.getByText(/missing:/i)).toHaveTextContent("docker");
  });

  it("shows a short note when the job has no description", async () => {
    routes["GET /api/jobs/job-1/match"] = () => json(200, { hasDescription: false, ranking: [] });
    render(<FitReport jobId="job-1" tag="backend" />);
    expect(await screen.findByText(/no description/i)).toBeInTheDocument();
  });

  it("shows an error when the match call fails", async () => {
    routes["GET /api/jobs/job-1/match"] = () => json(500, { error: "boom" });
    render(<FitReport jobId="job-1" tag="backend" />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("reloads the analysis for another tag", async () => {
    routes["GET /api/jobs/job-1/analysis?tag=frontend"] = () =>
      json(200, { available: true, sendChars: 3000, saved: { ...saved, tag: "frontend" }, stale: false });
    const { rerender } = render(<FitReport jobId="job-1" tag="backend" />);
    await screen.findByRole("button", { name: "Analyse fit" });
    rerender(<FitReport jobId="job-1" tag="frontend" />);
    expect(await screen.findByText("Decent fit for the role.")).toBeInTheDocument();
    expect(screen.getByText(/matched:/i)).toHaveTextContent("css");
  });
});

describe("FitReport analysis", () => {
  it("hides the button and names the variable when no key is set", async () => {
    routes["GET /api/jobs/job-1/analysis?tag=backend"] = () =>
      json(200, { available: false, sendChars: 4321, saved: null, stale: false });
    render(<FitReport jobId="job-1" tag="backend" />);
    expect(await screen.findByText(/ANTHROPIC_API_KEY/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /analyse fit/i })).not.toBeInTheDocument();
  });

  it("asks for a confirmation with the size before it calls the API, and Cancel sends nothing", async () => {
    render(<FitReport jobId="job-1" tag="backend" />);
    await userEvent.click(await screen.findByRole("button", { name: "Analyse fit" }));
    expect(screen.getByText(/send resume and job text to claude/i)).toHaveTextContent("4321");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/send resume and job text/i)).not.toBeInTheDocument();
    expect(calls("POST /api/jobs/job-1/analysis")).toHaveLength(0);
  });

  it("sends the tag and shows the full result", async () => {
    routes["POST /api/jobs/job-1/analysis"] = () => json(200, saved);
    render(<FitReport jobId="job-1" tag="backend" />);
    await userEvent.click(await screen.findByRole("button", { name: "Analyse fit" }));
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Decent fit for the role.")).toBeInTheDocument();
    expect(JSON.parse(calls("POST /api/jobs/job-1/analysis")[0][1].body)).toEqual({ tag: "backend" });
    expect(screen.getByText(/fit score/i)).toHaveTextContent("64");
    expect(screen.getByText(/does not predict/i)).toBeInTheDocument();
    expect(screen.getByText("Strong Python")).toBeInTheDocument();
    const gaps = screen.getByRole("list", { name: /gaps/i });
    expect(within(gaps).getByText(/no docker/i)).toBeInTheDocument();
    expect(within(gaps).getByText(/add docker to the skills line/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-run analysis" })).toBeInTheDocument();
  });

  it("shows each requirement with its evidence, verdict and reasoning", async () => {
    routes["GET /api/jobs/job-1/analysis?tag=backend"] = () =>
      json(200, { available: true, sendChars: 1, saved, stale: false });
    render(<FitReport jobId="job-1" tag="backend" />);
    const table = await screen.findByRole("table", { name: /requirements/i });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent("Python");
    expect(rows[1]).toHaveTextContent("Python engineer");
    expect(rows[1]).toHaveTextContent(/strong/i);
    expect(rows[1]).toHaveTextContent("Named directly.");
    expect(rows[2]).toHaveTextContent("Team leadership");
    expect(rows[2]).toHaveTextContent(/missing/i);
  });

  it("shows suggested wording and copies it", async () => {
    routes["GET /api/jobs/job-1/analysis?tag=backend"] = () =>
      json(200, { available: true, sendChars: 1, saved, stale: false });
    render(<FitReport jobId="job-1" tag="backend" />);
    const list = await screen.findByRole("list", { name: /suggested wording/i });
    expect(within(list).getByText("Built ETL jobs.")).toBeInTheDocument();
    expect(within(list).getByText("Built and ran ETL jobs for daily reports.")).toBeInTheDocument();
    await userEvent.click(within(list).getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("Built and ran ETL jobs for daily reports.");
    expect(await within(list).findByText("Copied")).toBeInTheDocument();
  });

  it("warns when a saved analysis is out of date", async () => {
    routes["GET /api/jobs/job-1/analysis?tag=backend"] = () =>
      json(200, { available: true, sendChars: 1, saved, stale: true });
    render(<FitReport jobId="job-1" tag="backend" />);
    expect(await screen.findByRole("status")).toHaveTextContent(/out of date/i);
    expect(screen.getByRole("button", { name: "Re-run analysis" })).toBeInTheDocument();
  });

  it("shows no out-of-date warning for a fresh result and shows the resume version", async () => {
    routes["GET /api/jobs/job-1/analysis?tag=backend"] = () =>
      json(200, { available: true, sendChars: 1, saved, stale: false });
    render(<FitReport jobId="job-1" tag="backend" />);
    await screen.findByText("Decent fit for the role.");
    expect(screen.queryByText(/out of date/i)).not.toBeInTheDocument();
    expect(screen.getByText(/claude-haiku-5-5/)).toHaveTextContent(/version 2/i);
  });

  it("shows the error and keeps the button when the API call fails", async () => {
    routes["POST /api/jobs/job-1/analysis"] = () => json(502, { error: "invalid x-api-key" });
    render(<FitReport jobId="job-1" tag="backend" />);
    await userEvent.click(await screen.findByRole("button", { name: "Analyse fit" }));
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("invalid x-api-key");
    await waitFor(() => expect(screen.getByRole("button", { name: "Analyse fit" })).toBeEnabled());
  });
});

describe("FitReport submitted record", () => {
  it("records the tag when the user ticks the box", async () => {
    routes["PUT /api/jobs/job-1/submitted"] = () =>
      json(200, { submitted: { tag: "backend", version: 1, textHash: "h", at: "2026-11-03T00:00:00.000Z" }, changed: false });
    render(<FitReport jobId="job-1" tag="backend" />);
    const box = await screen.findByRole("checkbox", { name: "Submitted with this resume" });
    expect(box).not.toBeChecked();
    await userEvent.click(box);
    await waitFor(() => expect(box).toBeChecked());
    expect(JSON.parse(calls("PUT /api/jobs/job-1/submitted")[0][1].body)).toEqual({ tag: "backend" });
  });

  it("clears the record when the user unticks the box", async () => {
    routes["GET /api/jobs/job-1/submitted"] = () =>
      json(200, { submitted: { tag: "backend", version: 1, textHash: "h", at: "t" }, changed: false });
    routes["PUT /api/jobs/job-1/submitted"] = () => json(200, { submitted: null, changed: false });
    render(<FitReport jobId="job-1" tag="backend" />);
    const box = await screen.findByRole("checkbox", { name: "Submitted with this resume" });
    await waitFor(() => expect(box).toBeChecked());
    await userEvent.click(box);
    await waitFor(() => expect(box).not.toBeChecked());
    expect(JSON.parse(calls("PUT /api/jobs/job-1/submitted")[0][1].body)).toEqual({ tag: null });
  });

  it("says which other resume was submitted", async () => {
    routes["GET /api/jobs/job-1/submitted"] = () =>
      json(200, { submitted: { tag: "frontend", version: 1, textHash: "h", at: "t" }, changed: false });
    render(<FitReport jobId="job-1" tag="backend" />);
    expect(await screen.findByText(/submitted with resume frontend/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Submitted with this resume" })).not.toBeChecked();
  });

  it("warns when the resume changed after the submission", async () => {
    routes["GET /api/jobs/job-1/submitted"] = () =>
      json(200, { submitted: { tag: "backend", version: 1, textHash: "h", at: "t" }, changed: true });
    render(<FitReport jobId="job-1" tag="backend" />);
    expect(await screen.findByText(/resume changed after you submitted/i)).toBeInTheDocument();
  });
});
