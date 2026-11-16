import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResumeViewer } from "@/app/resume/_components/resume-viewer";

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ResumeViewer", () => {
  it("shows a pdf in a frame that points at the file route and does not fetch text", () => {
    render(<ResumeViewer tag="backend" ext="pdf" />);
    const frame = screen.getByTitle("Resume viewer");
    expect(frame).toHaveAttribute("src", "/api/resumes/backend/file");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the text of a non-pdf resume", async () => {
    fetchMock.mockResolvedValue(json(200, { meta: { tag: "notes" }, text: "Python and SQL" }));
    render(<ResumeViewer tag="notes" ext="md" />);
    expect(await screen.findByLabelText("Resume text")).toHaveTextContent("Python and SQL");
    expect(fetchMock).toHaveBeenCalledWith("/api/resumes/notes");
  });

  it("shows a short error when the text cannot be loaded", async () => {
    fetchMock.mockResolvedValue(json(404, { error: "Resume not found" }));
    render(<ResumeViewer tag="notes" ext="txt" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be opened/i);
  });

  it("loads the new text when the tag changes", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      json(200, { meta: {}, text: url.endsWith("/a") ? "Alpha text" : "Beta text" })
    );
    const { rerender } = render(<ResumeViewer tag="a" ext="txt" />);
    expect(await screen.findByText("Alpha text")).toBeInTheDocument();
    rerender(<ResumeViewer tag="b" ext="txt" />);
    expect(await screen.findByText("Beta text")).toBeInTheDocument();
  });
});
