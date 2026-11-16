import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ApplicationsPage from "@/app/applications/page";

function job(overrides: Record<string, string> = {}) {
  return {
    job_id: "job-1",
    title: "Applied Job",
    company: "Acme",
    location: "Sydney, Australia",
    date_posted: "2026-08-01",
    is_remote: "False",
    status: "applied",
    status_updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return {
          ok: true,
          status: 200,
          json: async () => job({ status: "interview", status_updated_at: "2026-09-02T00:00:00Z" }),
        };
      }
      return { ok: true, status: 200, json: async () => [job()] };
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("Applications kanban drag and drop", () => {
  it("makes each card draggable and drops the actions buttons", async () => {
    render(<ApplicationsPage />);

    const title = await screen.findByText("Applied Job");
    const card = title.closest("[draggable]");
    expect(card).toHaveAttribute("draggable", "true");
    expect(screen.queryByText("Mark applied")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /change status/i })).not.toBeInTheDocument();
  });

  it("moves a card to the column where it is dropped", async () => {
    render(<ApplicationsPage />);
    await screen.findByText("Applied Job");

    const card = screen.getByText("Applied Job").closest("[draggable]")!;
    const target = screen.getByRole("region", { name: /^Interview, / });

    fireEvent.dragStart(card, {
      dataTransfer: { setData: vi.fn(), effectAllowed: "" },
    });
    fireEvent.drop(target, {
      dataTransfer: { getData: () => "job-1", dropEffect: "", types: ["text/plain"] },
    });

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/jobs/job-1",
        expect.objectContaining({ method: "PATCH" })
      )
    );
    const body = JSON.parse(
      (vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "PATCH")?.[1]
        ?.body as string) ?? "{}"
    );
    expect(body).toEqual({ status: "interview" });
  });
});
