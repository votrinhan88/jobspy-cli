import { describe, expect, it } from "vitest";
import type { Job, JobStatus } from "@/lib/csv";
import type { StatusLogEntry } from "@/lib/status-log";
import { buildGanttRows } from "@/lib/gantt";

const T = (day: number) => Date.UTC(2026, 8, day);
const iso = (day: number) => new Date(T(day)).toISOString();
const NOW = T(30);

function job(id: string, status: JobStatus, updatedDay?: number): Job {
  return {
    job_id: id,
    title: `Title ${id}`,
    company: `Company ${id}`,
    status,
    status_updated_at: updatedDay ? iso(updatedDay) : "",
  } as unknown as Job;
}

function entry(id: string, from: JobStatus, to: JobStatus, day: number): StatusLogEntry {
  return { job_id: id, from, to, at: iso(day) };
}

const plain = (segments: { status: string; start: number; end: number }[]) =>
  segments.map((s) => [s.status, s.start, s.end]);

describe("buildGanttRows", () => {
  it("a job with log entries gets segments in time order", () => {
    const { rows } = buildGanttRows(
      [entry("a", "", "shortlisted", 1), entry("a", "shortlisted", "applied", 5), entry("a", "applied", "interview", 9)],
      [job("a", "interview", 9)],
      NOW
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].segments.map((s) => s.status)).toEqual(["shortlisted", "applied", "interview"]);
    expect(rows[0]).toMatchObject({ job_id: "a", title: "Title a", company: "Company a" });
  });

  it("each segment ends where the next one starts, and the last one ends at now", () => {
    const { rows } = buildGanttRows(
      [entry("a", "", "shortlisted", 1), entry("a", "shortlisted", "applied", 5)],
      [job("a", "applied", 5)],
      NOW
    );
    expect(plain(rows[0].segments)).toEqual([
      ["shortlisted", T(1), T(5)],
      ["applied", T(5), NOW],
    ]);
  });

  it("repeated same-status entries merge into one segment", () => {
    const { rows } = buildGanttRows(
      [entry("a", "", "applied", 2), entry("a", "applied", "applied", 4), entry("a", "applied", "applied", 6)],
      [job("a", "applied", 6)],
      NOW
    );
    expect(plain(rows[0].segments)).toEqual([["applied", T(2), NOW]]);
  });

  it("an applied, interview, applied sequence gives three segments", () => {
    const { rows } = buildGanttRows(
      [entry("a", "", "applied", 2), entry("a", "applied", "interview", 4), entry("a", "interview", "applied", 6)],
      [job("a", "applied", 6)],
      NOW
    );
    expect(plain(rows[0].segments)).toEqual([
      ["applied", T(2), T(4)],
      ["interview", T(4), T(6)],
      ["applied", T(6), NOW],
    ]);
  });

  it("a job with a status and no log gets one segment from its status_updated_at", () => {
    const { rows } = buildGanttRows([], [job("a", "offer", 12)], NOW);
    expect(plain(rows[0].segments)).toEqual([["offer", T(12), NOW]]);
  });

  it("a job with the empty status and no log is left out", () => {
    const { rows } = buildGanttRows([], [job("a", ""), job("b", "applied", 3)], NOW);
    expect(rows.map((r) => r.job_id)).toEqual(["b"]);
  });

  it("a job that was moved back to new is left out", () => {
    const { rows } = buildGanttRows(
      [entry("a", "", "shortlisted", 3), entry("a", "shortlisted", "", 4)],
      [job("a", "")],
      NOW
    );
    expect(rows).toEqual([]);
  });

  it("log entries for unknown job ids are ignored", () => {
    const { rows } = buildGanttRows(
      [entry("ghost", "", "applied", 1), entry("a", "", "applied", 3)],
      [job("a", "applied", 3)],
      NOW
    );
    expect(rows.map((r) => r.job_id)).toEqual(["a"]);
  });

  it("an undo entry with an earlier time removes the undone segment", () => {
    const { rows } = buildGanttRows(
      [entry("a", "", "shortlisted", 3), entry("a", "shortlisted", "applied", 20), entry("a", "applied", "shortlisted", 3)],
      [job("a", "shortlisted", 3)],
      NOW
    );
    expect(plain(rows[0].segments)).toEqual([["shortlisted", T(3), NOW]]);
  });

  it("an empty status in the log ends the segment before it, with a gap until the next status", () => {
    const { rows } = buildGanttRows(
      [entry("a", "", "shortlisted", 1), entry("a", "shortlisted", "", 2), entry("a", "", "applied", 5)],
      [job("a", "applied", 5)],
      NOW
    );
    expect(plain(rows[0].segments)).toEqual([
      ["shortlisted", T(1), T(2)],
      ["applied", T(5), NOW],
    ]);
  });

  it("rows sort by most recent activity first", () => {
    const { rows } = buildGanttRows(
      [entry("a", "", "applied", 4), entry("b", "", "applied", 10)],
      [job("a", "applied", 4), job("b", "applied", 10), job("c", "offer", 7)],
      NOW
    );
    expect(rows.map((r) => r.job_id)).toEqual(["b", "c", "a"]);
  });

  it("min and max times cover all segments", () => {
    const { rows, min, max } = buildGanttRows(
      [entry("a", "", "applied", 4)],
      [job("a", "applied", 4), job("b", "rejected", 2)],
      NOW
    );
    const all = rows.flatMap((r) => r.segments);
    expect(min).toBe(Math.min(...all.map((s) => s.start)));
    expect(max).toBe(Math.max(...all.map((s) => s.end)));
    expect([min, max]).toEqual([T(2), NOW]);
  });

  it("returns no rows and null bounds when there is no data", () => {
    expect(buildGanttRows([], [], NOW)).toEqual({ rows: [], min: null, max: null });
  });
});
