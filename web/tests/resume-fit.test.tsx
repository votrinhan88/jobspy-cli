import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResumeFit } from "@/app/jobs/_components/resume-fit";

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

const ranking = [
  { tag: "backend", score: 62, matched: ["python", "sql"], missing: ["docker"] },
  { tag: "frontend", score: 20, matched: ["css"], missing: ["python"] },
];

let routes: Record<string, () => ReturnType<typeof json>>;
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  routes = { "/api/jobs/job-1/match": () => json(200, { hasDescription: true, ranking }) };
  fetchMock.mockImplementation(async (url: string) => {
    const handler = routes[url];
    if (!handler) throw new Error(`Unexpected request: ${url}`);
    return handler();
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ResumeFit drawer summary", () => {
  it("shows the best tag with its score", async () => {
    render(<ResumeFit jobId="job-1" />);
    expect(await screen.findByText(/best tag: backend/i)).toHaveTextContent("62%");
  });

  it("links to the review page of the job", async () => {
    render(<ResumeFit jobId="job-1" />);
    const link = await screen.findByRole("link", { name: /open resume review/i });
    expect(link).toHaveAttribute("href", "/jobs/job-1/review");
  });

  it("makes no analysis request in the drawer", async () => {
    render(<ResumeFit jobId="job-1" />);
    await screen.findByText(/best tag/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows a short note when the job has no description", async () => {
    routes["/api/jobs/job-1/match"] = () => json(200, { hasDescription: false, ranking: [] });
    render(<ResumeFit jobId="job-1" />);
    expect(await screen.findByText(/no description/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open resume review/i })).not.toBeInTheDocument();
  });

  it("points to the Resume page when there are no resumes", async () => {
    routes["/api/jobs/job-1/match"] = () => json(200, { hasDescription: true, ranking: [] });
    render(<ResumeFit jobId="job-1" />);
    const link = await screen.findByRole("link", { name: /resume page/i });
    expect(link).toHaveAttribute("href", "/resume");
  });

  it("shows an error when the match call fails", async () => {
    routes["/api/jobs/job-1/match"] = () => json(500, { error: "boom" });
    render(<ResumeFit jobId="job-1" />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
