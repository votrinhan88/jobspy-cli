import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResumePage from "@/app/resume/page";

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
const meta = (tag: string, over: Record<string, unknown> = {}) => ({
  tag,
  ext: "md",
  importedAt: "2026-11-02T10:00:00.000Z",
  version: 1,
  textHash: "h",
  ...over,
});

beforeEach(() => {
  const routes: Record<string, unknown> = {
    "/api/resumes": { resumes: [meta("backend"), meta("backend-ml", { parent: "backend" }), meta("notes")] },
    "/api/resumes/backend": { meta: meta("backend"), text: "Backend text" },
    "/api/resumes/backend-ml": { meta: meta("backend-ml"), text: "ML text" },
    "/api/resumes/notes": { meta: meta("notes"), text: "Notes text" },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (!(url in routes)) throw new Error(`Unexpected request: ${url}`);
      return json(200, routes[url]);
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Resume fork graph view", () => {
  it("switches between the table and the graph", async () => {
    render(<ResumePage />);
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "Graph" }));
    const graph = screen.getByRole("group", { name: "Resume forks" });
    expect(within(graph).getAllByRole("button")).toHaveLength(3);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "List" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("opens a resume when its node is clicked", async () => {
    render(<ResumePage />);
    await screen.findByRole("table");
    await userEvent.click(screen.getByRole("button", { name: "Graph" }));
    const graph = screen.getByRole("group", { name: "Resume forks" });
    await userEvent.click(within(graph).getByRole("button", { name: "notes" }));
    expect(await screen.findByRole("heading", { name: "notes" })).toBeInTheDocument();
    expect(within(graph).getByRole("button", { name: "notes" })).toHaveAttribute("aria-current", "true");
  });
});
