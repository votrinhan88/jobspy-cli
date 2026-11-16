import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResumeGraph } from "@/app/resume/_components/resume-graph";

const items = [
  { tag: "base", importedAt: "2026-11-01T00:00:00Z", version: 1 },
  { tag: "base-ml", parent: "base", importedAt: "2026-11-02T00:00:00Z", version: 3 },
  { tag: "other", importedAt: "2026-11-03T00:00:00Z", version: 1 },
];

describe("ResumeGraph", () => {
  it("shows one row for each resume, newest first, and one edge for each fork", () => {
    const { container } = render(<ResumeGraph items={items} selectedTag="base" onSelect={() => {}} />);
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["other", "base-ml", "base"]);
    expect(container.querySelectorAll("[data-graph-edge]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-graph-dot]")).toHaveLength(3);
  });

  it("shows the import date and the version in each row", () => {
    render(<ResumeGraph items={items} selectedTag="base" onSelect={() => {}} />);
    const row = screen.getByRole("button", { name: "base-ml" });
    expect(row).toHaveTextContent("2026-11-02");
    expect(row).toHaveTextContent("v3");
  });

  it("marks the selected resume", () => {
    render(<ResumeGraph items={items} selectedTag="base-ml" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "base-ml" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "base" })).not.toHaveAttribute("aria-current");
  });

  it("selects a resume by click and by keyboard", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ResumeGraph items={items} selectedTag="base" onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: "other" }));
    expect(onSelect).toHaveBeenLastCalledWith("other");
    screen.getByRole("button", { name: "base-ml" }).focus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenLastCalledWith("base-ml");
  });
});
