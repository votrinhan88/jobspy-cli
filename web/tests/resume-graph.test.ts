import { describe, expect, it } from "vitest";
import { buildForkGraph } from "@/lib/resumes/graph";

const r = (tag: string, parent?: string, importedAt = "2026-11-01T00:00:00Z") => ({ tag, parent, importedAt });
const at = (graph: ReturnType<typeof buildForkGraph>, tag: string) => graph.nodes.find((n) => n.tag === tag)!;

describe("buildForkGraph", () => {
  it("returns nothing for no resumes", () => {
    expect(buildForkGraph([])).toEqual({ nodes: [], edges: [], lanes: 0, rows: 0 });
  });

  it("lists the newest resume first, one row each", () => {
    const graph = buildForkGraph([r("old", undefined, "2026-11-01T00:00:00Z"), r("new", undefined, "2026-11-03T00:00:00Z")]);
    expect(graph.nodes.map((n) => [n.tag, n.row])).toEqual([
      ["new", 0],
      ["old", 1],
    ]);
    expect(graph.rows).toBe(2);
  });

  it("keeps a fork on its parent's lane when it is the only fork", () => {
    const graph = buildForkGraph([r("base"), r("base-ml", "base", "2026-11-02T00:00:00Z")]);
    expect(at(graph, "base-ml").row).toBe(0);
    expect(at(graph, "base").row).toBe(1);
    expect(at(graph, "base-ml").lane).toBe(at(graph, "base").lane);
    expect(graph.edges).toEqual([
      { from: "base-ml", to: "base", fromRow: 0, fromLane: 0, toRow: 1, toLane: 0 },
    ]);
    expect(graph.lanes).toBe(1);
  });

  it("opens a new lane for a second fork of the same parent", () => {
    const graph = buildForkGraph([
      r("base"),
      r("x", "base", "2026-11-02T00:00:00Z"),
      r("y", "base", "2026-11-03T00:00:00Z"),
    ]);
    expect(at(graph, "y").lane).toBe(at(graph, "base").lane);
    expect(at(graph, "x").lane).not.toBe(at(graph, "base").lane);
    expect(graph.edges).toHaveLength(2);
    expect(graph.lanes).toBe(2);
  });

  it("reuses a lane once a branch has merged back", () => {
    const graph = buildForkGraph([
      r("base", undefined, "2026-11-01T00:00:00Z"),
      r("x", "base", "2026-11-02T00:00:00Z"),
      r("y", "base", "2026-11-03T00:00:00Z"),
      r("other", undefined, "2026-11-04T00:00:00Z"),
    ]);
    expect(graph.lanes).toBe(2);
  });

  it("walks a chain of forks on one lane", () => {
    const graph = buildForkGraph([
      r("a", undefined, "2026-11-01T00:00:00Z"),
      r("b", "a", "2026-11-02T00:00:00Z"),
      r("c", "b", "2026-11-03T00:00:00Z"),
    ]);
    expect(graph.nodes.map((n) => n.tag)).toEqual(["c", "b", "a"]);
    expect(new Set(graph.nodes.map((n) => n.lane)).size).toBe(1);
    expect(graph.edges).toHaveLength(2);
  });

  it("puts a fork above its parent even when the clock says otherwise", () => {
    const graph = buildForkGraph([r("child", "base", "2026-11-01T00:00:00Z"), r("base", undefined, "2026-11-05T00:00:00Z")]);
    expect(at(graph, "child").row).toBeLessThan(at(graph, "base").row);
  });

  it("treats a parent that is not in the list as no parent", () => {
    const graph = buildForkGraph([r("orphan", "gone")]);
    expect(graph.nodes[0]).toMatchObject({ tag: "orphan", lane: 0, row: 0 });
    expect(graph.edges).toEqual([]);
  });

  it("does not loop on a parent cycle", () => {
    const graph = buildForkGraph([r("a", "b"), r("b", "a")]);
    expect(graph.nodes.map((n) => n.tag).sort()).toEqual(["a", "b"]);
    expect(graph.nodes.map((n) => n.row).sort()).toEqual([0, 1]);
  });

  it("draws every edge downward, from a fork to its parent", () => {
    const graph = buildForkGraph([
      r("a", undefined, "2026-11-01T00:00:00Z"),
      r("b", "a", "2026-11-02T00:00:00Z"),
      r("c", "a", "2026-11-03T00:00:00Z"),
      r("d", "b", "2026-11-04T00:00:00Z"),
    ]);
    for (const edge of graph.edges) expect(edge.toRow).toBeGreaterThan(edge.fromRow);
  });

  it("keeps each tree in one block of rows, the tree with the newest resume first", () => {
    const graph = buildForkGraph([
      r("a", undefined, "2026-11-01T00:00:00Z"),
      r("b", undefined, "2026-11-02T00:00:00Z"),
      r("a1", "a", "2026-11-03T00:00:00Z"),
      r("b1", "b", "2026-11-04T00:00:00Z"),
      r("a2", "a", "2026-11-05T00:00:00Z"),
    ]);
    expect(graph.nodes.map((n) => n.tag)).toEqual(["a2", "a1", "a", "b1", "b"]);
  });

  it("starts the lanes again in each tree", () => {
    const graph = buildForkGraph([
      r("a", undefined, "2026-11-01T00:00:00Z"),
      r("a1", "a", "2026-11-02T00:00:00Z"),
      r("a2", "a", "2026-11-03T00:00:00Z"),
      r("b", undefined, "2026-10-30T00:00:00Z"),
    ]);
    expect(at(graph, "b").lane).toBe(0);
    expect(graph.lanes).toBe(2);
  });
});
