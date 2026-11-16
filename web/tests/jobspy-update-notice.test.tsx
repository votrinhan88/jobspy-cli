import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { JobspyUpdateNotice } from "@/app/scrape/_components/jobspy-update-notice";

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("JobspyUpdateNotice", () => {
  it("warns with both versions and the update commands when JobSpy is outdated", async () => {
    fetchMock.mockResolvedValue(json(200, { installed: "1.4.1", latest: "1.6.0", outdated: true }));
    render(<JobspyUpdateNotice />);
    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("1.4.1");
    expect(notice).toHaveTextContent("1.6.0");
    expect(notice).toHaveTextContent("uv lock --upgrade-package python-jobspy");
    expect(notice).toHaveTextContent("uv sync");
    expect(fetchMock).toHaveBeenCalledWith("/api/jobspy-version");
  });

  it("shows nothing when JobSpy is current", async () => {
    fetchMock.mockResolvedValue(json(200, { installed: "1.6.0", latest: "1.6.0", outdated: false }));
    const { container } = render(<JobspyUpdateNotice />);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing when the request fails", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const { container } = render(<JobspyUpdateNotice />);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing when the server answers with an error", async () => {
    fetchMock.mockResolvedValue(json(500, { error: "boom" }));
    const { container } = render(<JobspyUpdateNotice />);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
