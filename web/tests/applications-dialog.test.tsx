import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ApplicationsPage from "@/app/applications/page";

const job = {
  job_id: "job-1",
  title: "Applied Job",
  company: "Acme",
  location: "Sydney, Australia",
  job_url: "https://example.com/job-1",
  date_posted: "2026-08-01",
  is_remote: "False",
  status: "applied",
  status_updated_at: "2026-09-01T00:00:00Z",
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => [job] })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("Applications job dialog", () => {
  it("opens the summary dialog from a card title instead of leaving the page", async () => {
    render(<ApplicationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Applied Job" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveTextContent("Acme");
  });

  it("closes with Escape and returns focus to the title", async () => {
    render(<ApplicationsPage />);
    const title = await screen.findByRole("button", { name: "Applied Job" });
    await userEvent.click(title);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await vi.waitFor(() => expect(title).toHaveFocus());
  });

  it("opens from the table view", async () => {
    window.localStorage.setItem("applications_view", "table");
    render(<ApplicationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Applied Job" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
