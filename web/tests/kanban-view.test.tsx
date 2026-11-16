import { describe, expect, it, vi } from "vitest";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { KanbanView } from "@/app/applications/_components/kanban-view";
import type { Job } from "@/lib/csv";
import { COLUMNS } from "@/app/applications/_components/types";

function job(id: string, status: Job["status"]): Job {
  return { job_id: id, title: `Title ${id}`, company: `Co ${id}`, status } as Job;
}

function byStatus(jobs: Job[]) {
  const out = Object.fromEntries(COLUMNS.map((c) => [c, [] as Job[]])) as Record<(typeof COLUMNS)[number], Job[]>;
  for (const j of jobs) out[j.status as (typeof COLUMNS)[number]].push(j);
  return out;
}

function transfer() {
  const data = new Map<string, string>();
  return { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? "", dropEffect: "", effectAllowed: "" };
}

function drag(target: Element, type: "dragStart" | "dragOver" | "dragLeave" | "dragEnd" | "drop", dataTransfer: ReturnType<typeof transfer>) {
  fireEvent(target, Object.assign(createEvent[type](target), { dataTransfer }));
}

function setup() {
  const onChange = vi.fn();
  const view = render(
    <KanbanView
      byStatus={byStatus([job("a", "shortlisted"), job("b", "applied")])}
      pending={new Set()}
      onChange={onChange}
      onOpen={() => {}}
    />
  );
  const card = view.container.querySelector('[data-job-id="a"]')!;
  const column = (name: RegExp) => screen.getByRole("region", { name });
  return { card, column, onChange, view };
}

describe("KanbanView drop cue", () => {
  it("shows no drop box until a card is dragged over another column", () => {
    const { view } = setup();
    expect(view.container.querySelector("[data-drop-slot]")).toBeNull();
  });

  it("shows one empty box at the bottom of the column under the card, and not in the source column", () => {
    const { card, column } = setup();
    const dt = transfer();
    drag(card, "dragStart", dt);
    drag(column(/^Applied/), "dragOver", dt);
    const slot = column(/^Applied/).querySelector("[data-drop-slot]");
    expect(slot).not.toBeNull();
    expect(column(/^Applied/).querySelector(".kanban-cards")!.lastElementChild).toBe(slot);
    expect(column(/^Applied/).querySelector(".kanban-cards")!.classList).toContain("kanban-cards--over");
    drag(column(/^Shortlisted/), "dragOver", dt);
    expect(column(/^Shortlisted/).querySelector("[data-drop-slot]")).toBeNull();
  });

  it("dims the dragged card and clears every cue when the drag ends", () => {
    const { card, column, view } = setup();
    const dt = transfer();
    drag(card, "dragStart", dt);
    expect(card).toHaveClass("job-card--dragging");
    drag(column(/^Applied/), "dragOver", dt);
    drag(card, "dragEnd", dt);
    expect(card).not.toHaveClass("job-card--dragging");
    expect(view.container.querySelector("[data-drop-slot]")).toBeNull();
  });

  it("changes the status on drop and clears the cue", () => {
    const { card, column, onChange, view } = setup();
    const dt = transfer();
    drag(card, "dragStart", dt);
    drag(column(/^Applied/), "dragOver", dt);
    drag(column(/^Applied/), "drop", dt);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ job_id: "a" }), "applied");
    expect(view.container.querySelector("[data-drop-slot]")).toBeNull();
  });
});
