import { describe, expect, it } from "vitest";
import { buildSankey, type FlowEntry } from "@/lib/sankey";
import type { JobStatus } from "@/lib/csv";

function path(job: string, ...stages: JobStatus[]): FlowEntry[] {
  const out: FlowEntry[] = [];
  for (let i = 0; i < stages.length - 1; i++) {
    out.push({ job_id: job, from: stages[i], to: stages[i + 1] });
  }
  return out;
}

function linkMap(entries: FlowEntry[]) {
  return Object.fromEntries(
    buildSankey(entries).links.map((l) => [`${l.source}>${l.target}`, l.value])
  );
}

describe("buildSankey", () => {
  it("counts each forward move once and labels the start as Scrape", () => {
    const graph = buildSankey(path("a", "", "shortlisted"));
    expect(graph.links).toEqual([{ source: "", target: "shortlisted", value: 1 }]);
    expect(graph.nodes.map((n) => [n.id, n.label])).toEqual([
      ["", "Scrape"],
      ["shortlisted", "Shortlisted"],
    ]);
  });

  it("drops backward moves", () => {
    expect(linkMap(path("a", "interview", "applied"))).not.toHaveProperty("interview>applied");
  });

  it("drops self moves", () => {
    expect(linkMap(path("a", "applied", "applied"))).not.toHaveProperty("applied>applied");
  });

  it("merges repeated moves across jobs", () => {
    const entries = [...path("a", "shortlisted", "applied"), ...path("b", "shortlisted", "applied")];
    expect(linkMap(entries)).toEqual({ "shortlisted>applied": 2 });
  });

  it("puts the stages in pipeline order, not log order", () => {
    const graph = buildSankey([...path("a", "applied", "interview"), ...path("b", "", "shortlisted")]);
    expect(graph.nodes.map((n) => n.id)).toEqual(["", "shortlisted", "applied", "interview"]);
  });

  it("sends a job from scrape straight to skip", () => {
    expect(linkMap(path("a", "", "skipped"))).toEqual({ ">skipped": 1 });
  });

  it("sends a shortlisted job to skip", () => {
    expect(linkMap(path("a", "", "shortlisted", "skipped"))).toEqual({
      ">shortlisted": 1,
      "shortlisted>skipped": 1,
    });
  });

  it("keeps a job that stops mid-pipeline as a pending count, not a flow", () => {
    const graph = buildSankey(path("a", "", "shortlisted", "applied", "interview"));
    expect(linkMap(path("a", "", "shortlisted", "applied", "interview"))).toEqual({
      ">shortlisted": 1,
      "shortlisted>applied": 1,
      "applied>interview": 1,
    });
    expect(graph.nodes.find((n) => n.id === "interview")!.pending).toBe(1);
  });

  it("sends an interview to reject and to skip", () => {
    expect(linkMap(path("a", "", "shortlisted", "applied", "interview", "rejected"))).toEqual({
      ">shortlisted": 1,
      "shortlisted>applied": 1,
      "applied>interview": 1,
      "interview>rejected": 1,
    });
    expect(linkMap(path("b", "", "shortlisted", "applied", "interview", "skipped"))).toEqual({
      ">shortlisted": 1,
      "shortlisted>applied": 1,
      "applied>interview": 1,
      "interview>skipped": 1,
    });
  });

  it("sends an offer to reject or to accept", () => {
    expect(
      linkMap(path("a", "", "shortlisted", "applied", "interview", "offer", "rejected"))
    ).toEqual({
      ">shortlisted": 1,
      "shortlisted>applied": 1,
      "applied>interview": 1,
      "interview>offer": 1,
      "offer>rejected": 1,
    });
    expect(
      linkMap(path("b", "", "shortlisted", "applied", "interview", "offer", "accepted"))
    ).toEqual({
      ">shortlisted": 1,
      "shortlisted>applied": 1,
      "applied>interview": 1,
      "interview>offer": 1,
      "offer>accepted": 1,
    });
  });

  it("counts a pending job at the stage of its last status only", () => {
    const graph = buildSankey(path("a", "", "shortlisted", "applied", "interview", "offer"));
    const pending = Object.fromEntries(graph.nodes.map((n) => [n.id, n.pending]));
    expect(pending).toEqual({ "": 0, shortlisted: 0, applied: 0, interview: 0, offer: 1 });
  });

  it("drops a job reset to Scrape, so no flow is left without a pending job", () => {
    const entries = [
      ...path("a", "", "shortlisted", "applied"),
      { job_id: "a", from: "applied" as JobStatus, to: "" as JobStatus },
    ];
    expect(linkMap(entries)).toEqual({});
  });

  it("truncates the path when a job returns to a stage it left, so flows balance with pending", () => {
    const entries = [
      ...path("a", "", "shortlisted", "interview", "applied"),
      { job_id: "a", from: "applied" as JobStatus, to: "shortlisted" as JobStatus },
    ];
    expect(linkMap(entries)).toEqual({ ">shortlisted": 1 });
  });

  it("cancels a move that is undone, so a job counts once from Scrape", () => {
    expect(linkMap([
      { job_id: "a", from: "", to: "skipped" },
      { job_id: "a", from: "skipped", to: "" },
      { job_id: "a", from: "", to: "shortlisted" },
    ])).toEqual({ ">shortlisted": 1 });
  });

  it("cancels an undone pipeline move and keeps the stage the job is in", () => {
    expect(linkMap([
      { job_id: "a", from: "", to: "shortlisted" },
      { job_id: "a", from: "shortlisted", to: "applied" },
      { job_id: "a", from: "applied", to: "shortlisted" },
    ])).toEqual({ ">shortlisted": 1 });
  });

  it("ignores a repeated move that starts from a stage the job already left", () => {
    expect(linkMap([
      { job_id: "a", from: "", to: "skipped" },
      { job_id: "a", from: "", to: "skipped" },
    ])).toEqual({ ">skipped": 1 });
  });

  it("labels each outcome and orders them after the pipeline", () => {
    const graph = buildSankey([
      ...path("a", "", "shortlisted", "applied", "interview", "offer", "accepted"),
      ...path("b", "", "rejected"),
      ...path("c", "", "skipped"),
      ...path("d", "", "shortlisted", "applied"),
    ]);
    const outcomes = graph.nodes.filter((n) => n.column === 5);
    expect(outcomes.map((n) => [n.id, n.label])).toEqual([
      ["accepted", "Accepted"],
      ["rejected", "Rejected"],
      ["skipped", "Skipped"],
    ]);
  });
});
