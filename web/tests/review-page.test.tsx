import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/jobs/_components/fit-report", () => ({
  FitReport: ({ jobId, tag }: { jobId: string; tag: string }) => <div data-testid="fit-report">{`${jobId}:${tag}`}</div>,
}));

import ReviewPage from "@/app/jobs/[jobId]/review/page";

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

const meta = (tag: string, ext = "pdf") => ({
  tag,
  ext,
  importedAt: "2026-11-02T10:00:00.000Z",
  version: 1,
  textHash: "h",
});

let routes: Record<string, () => ReturnType<typeof json>>;
const fetchMock = vi.fn();

const renderPage = () =>
  render(
    <Suspense fallback="loading">
      <ReviewPage params={Promise.resolve({ jobId: "job-1" })} />
    </Suspense>
  );

beforeEach(() => {
  vi.clearAllMocks();
  routes = {
    "/api/jobs/job-1": () => json(200, { job_id: "job-1", title: "ML Engineer", company: "Acme" }),
    "/api/resumes": () => json(200, { resumes: [meta("backend"), meta("notes", "md")] }),
    "/api/jobs/job-1/match": () =>
      json(200, {
        hasDescription: true,
        ranking: [
          { tag: "notes", score: 70, matched: [], missing: [] },
          { tag: "backend", score: 40, matched: [], missing: [] },
        ],
      }),
    "/api/resumes/notes": () => json(200, { meta: meta("notes", "md"), text: "Notes text" }),
  };
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

describe("Review page", () => {
  it("shows the job title and company with a link back to the jobs", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: /ml engineer/i })).toHaveTextContent("Acme");
    expect(screen.getByRole("link", { name: /back to jobs/i })).toHaveAttribute("href", "/jobs");
  });

  it("selects the best matching tag and shows its resume next to the fit report", async () => {
    renderPage();
    expect(await screen.findByLabelText("Resume preview")).toHaveTextContent("Notes text");
    expect(screen.getByLabelText("Resume tag")).toHaveDisplayValue(/notes/);
    expect(screen.getByTestId("fit-report")).toHaveTextContent("job-1:notes");
  });

  it("switches the resume and the report when another tag is picked", async () => {
    renderPage();
    await screen.findByLabelText("Resume preview");
    await userEvent.selectOptions(screen.getByLabelText("Resume tag"), "backend");
    expect(screen.getByTitle("Resume viewer")).toHaveAttribute("src", "/api/resumes/backend/file#toolbar=0&navpanes=0&view=FitH");
    expect(screen.getByTestId("fit-report")).toHaveTextContent("job-1:backend");
  });

  it("uses the first resume when the job has no description", async () => {
    routes["/api/jobs/job-1/match"] = () => json(200, { hasDescription: false, ranking: [] });
    renderPage();
    expect(await screen.findByLabelText("Resume tag")).toHaveDisplayValue(/backend/);
  });

  it("points to the Resume page when there are no resumes", async () => {
    routes["/api/resumes"] = () => json(200, { resumes: [] });
    renderPage();
    const link = await screen.findByRole("link", { name: /resume page/i });
    expect(link).toHaveAttribute("href", "/resume");
    expect(screen.queryByTestId("fit-report")).not.toBeInTheDocument();
  });

  it("shows a short message when the job is not found", async () => {
    routes["/api/jobs/job-1"] = () => json(404, { error: "Job not found" });
    renderPage();
    expect(await screen.findByText(/job was not found/i)).toBeInTheDocument();
  });
});
