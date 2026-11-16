import { describe, expect, it } from "vitest";
import { buildSankey, type FlowEntry } from "@/lib/sankey";
import { bandPath, findBandOverlaps, layoutSankey } from "@/lib/sankey-layout";
import type { JobStatus } from "@/lib/csv";

function job(id: string, ...stages: JobStatus[]): FlowEntry[] {
  return stages.slice(0, -1).map((from, i) => ({ job_id: id, from, to: stages[i + 1] }));
}

const graph = buildSankey([...job("a", "", "shortlisted", "applied"), ...job("b", "", "shortlisted", "applied")]);

describe("layoutSankey", () => {
  it("places each stage left to right", () => {
    const layout = layoutSankey(graph, { width: 300, height: 120 });
    const xs = layout.nodes.map((n) => n.x0);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(layout.nodes[0].x0).toBe(48);
    expect(layout.nodes.at(-1)!.x1).toBeLessThanOrEqual(300 - 48);
  });

  it("sets the node value to its total flow", () => {
    const layout = layoutSankey(graph, { width: 300, height: 120 });
    expect(layout.nodes[0].value).toBe(2);
  });

  it("makes a larger link wider", () => {
    const wide = buildSankey([
      ...job("a", "", "shortlisted", "applied"),
      ...job("b", "", "shortlisted"),
      ...job("c", "", "shortlisted"),
    ]);
    const layout = layoutSankey(wide, { width: 300, height: 320 });
    const first = layout.links.find((l) => l.source.id === "" && l.target.id === "shortlisted")!;
    const second = layout.links.find((l) => l.source.id === "shortlisted" && l.target.id === "applied")!;
    expect(first.value).toBe(3);
    expect(second.value).toBe(1);
    expect(first.targetWidth).toBeGreaterThan(second.targetWidth);
  });

  it("scales the bands by the square root of the count, so a small stage stays visible next to a big one", () => {
    const skewed = buildSankey([
      ...Array.from({ length: 97 }, (_, i) => ({ job_id: `s${i}`, from: "" as JobStatus, to: "skipped" as JobStatus })),
      ...job("a", "", "shortlisted", "applied"),
      ...job("b", "", "shortlisted", "applied"),
      ...job("c", "", "shortlisted", "applied"),
    ]);
    const layout = layoutSankey(skewed, { width: 720, height: 320 });
    const skip = layout.links.find((l) => l.target.id === "skipped")!;
    const small = layout.links.find((l) => l.source.id === "shortlisted" && l.target.id === "applied")!;
    expect(skip.value).toBe(97);
    expect(small.value).toBe(3);
    expect(skip.width / small.width).toBeLessThan(10);
  });

  it("caps the band thickness when the chart is tall", () => {
    const layout = layoutSankey(graph, { width: 300, height: 1000 });
    for (const link of layout.links) {
      expect(link.width).toBeLessThanOrEqual(28 * link.value);
    }
  });

  it("keeps the canvas at the height it is given", () => {
    const layout = layoutSankey(graph, { width: 300, height: 320 });
    expect(layout.height).toBe(320);
  });

  it("pins progress stages in the top 35% and drops in the bottom 35%", () => {
    const busy = buildSankey([
      ...Array.from({ length: 97 }, (_, i) => ({ job_id: `s${i}`, from: "" as JobStatus, to: "skipped" as JobStatus })),
      ...job("a", "", "shortlisted", "applied", "interview", "offer", "accepted"),
      ...job("b", "", "shortlisted", "applied", "interview", "rejected"),
      ...job("c", "", "shortlisted", "applied", "offer", "rejected"),
    ]);
    const layout = layoutSankey(busy, { width: 720, height: 320 });
    for (const node of layout.nodes) {
      if (node.id === "rejected" || node.id === "skipped") {
        expect(node.y0, node.id).toBeGreaterThanOrEqual(320 * 0.65);
        expect(node.y1, node.id).toBeLessThanOrEqual(320);
      } else {
        expect(node.y1, node.id).toBeLessThanOrEqual(320 * 0.35);
      }
    }
  });

  it("puts the label of a single stage above the whole plot", () => {
    const layout = layoutSankey(graph, { width: 300, height: 120 });
    for (const node of layout.nodes) {
      expect(node.labelAnchor).toBe("middle");
      expect(node.labelY).toBeLessThan(node.y0);
    }
  });

  it("keeps the stage id and label on each node", () => {
    const layout = layoutSankey(graph, { width: 300, height: 120 });
    expect(layout.nodes.map((n) => [n.id, n.label])).toEqual([
      ["", "Scrape"],
      ["shortlisted", "Shortlisted"],
      ["applied", "Applied"],
    ]);
  });

  it("stacks the outcome stages in one column with labels to the right", () => {
    const outcomes = buildSankey([
      ...job("a", "", "shortlisted", "applied", "interview", "offer", "accepted"),
      ...job("b", "", "rejected"),
      ...job("c", "", "skipped"),
      ...job("d", "", "shortlisted", "applied"),
    ]);
    const layout = layoutSankey(outcomes, { width: 720, height: 320 });
    const stacked = layout.nodes.filter((n) => n.column === 5);
    expect(stacked.map((n) => n.id)).toEqual(["accepted", "rejected", "skipped"]);
    expect(new Set(stacked.map((n) => n.x0)).size).toBe(1);
    for (const node of stacked) {
      expect(node.labelAnchor).toBe("start");
      expect(node.labelX).toBeGreaterThan(node.x1);
    }
    for (let i = 1; i < stacked.length; i++) {
      expect(stacked[i].y0).toBeGreaterThanOrEqual(stacked[i - 1].y1);
    }
  });

  it("keeps the labels of a stacked column apart", () => {
    const outcomes = buildSankey([
      ...job("a", "", "rejected"),
      ...job("b", "", "skipped"),
      ...job("c", "", "accepted"),
    ]);
    const layout = layoutSankey(outcomes, { width: 720, height: 320 });
    const ys = layout.nodes.filter((n) => n.column === 5).map((n) => n.labelY);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(18);
    }
  });

  it("puts Skipped last in the outcome stack", () => {
    const outcomes = buildSankey([
      ...job("a", "", "shortlisted", "applied", "interview", "offer", "accepted"),
      ...job("b", "", "rejected"),
      ...job("c", "", "skipped"),
    ]);
    const layout = layoutSankey(outcomes, { width: 720, height: 320 });
    const stacked = layout.nodes.filter((n) => n.column === 5);
    expect(stacked.map((n) => n.id)).toEqual(["accepted", "rejected", "skipped"]);
    const [accepted, rejected, skipped] = stacked;
    expect(skipped.y0).toBeGreaterThan(rejected.y1 - 1e-6);
    expect(rejected.y0).toBeGreaterThan(accepted.y1 - 1e-6);
  });

  it("orders the branches at each node by where they go, on both sides", () => {
    const busy = buildSankey([
      ...job("a", "", "shortlisted", "applied", "interview", "offer", "accepted"),
      ...job("b", "", "shortlisted", "applied", "interview", "skipped"),
      ...job("c", "", "shortlisted", "interview"),
      ...job("d", "", "shortlisted", "applied"),
      ...job("e", "", "rejected"),
      ...job("f", "", "skipped"),
      ...job("g", "", "shortlisted", "applied", "interview", "offer", "rejected"),
    ]);
    const layout = layoutSankey(busy, { width: 720, height: 320 });
    for (const node of layout.nodes) {
      const out = layout.links.filter((l) => l.source === node);
      for (const a of out) for (const b of out) {
        if (a.target.y0 < b.target.y0) expect(a.y0).toBeLessThan(b.y0);
      }
      const inc = layout.links.filter((l) => l.target === node);
      for (const a of inc) for (const b of inc) {
        if (a.source.y0 < b.source.y0) expect(a.y1).toBeLessThan(b.y1);
      }
    }
  });

  it("keeps the branches at a node from overlapping", () => {
    const busy = buildSankey([
      ...job("a", "", "shortlisted", "applied", "interview", "offer", "accepted"),
      ...job("b", "", "shortlisted", "applied", "interview", "skipped"),
      ...job("c", "", "shortlisted", "interview"),
      ...job("d", "", "shortlisted", "applied"),
      ...job("e", "", "rejected"),
      ...job("f", "", "skipped"),
    ]);
    const layout = layoutSankey(busy, { width: 720, height: 320 });
    for (const node of layout.nodes) {
      const out = layout.links.filter((l) => l.source === node).sort((a, b) => a.y0 - b.y0);
      for (let i = 1; i < out.length; i++) {
        expect(out[i].y0 - out[i].width / 2).toBeGreaterThanOrEqual(out[i - 1].y0 + out[i - 1].width / 2 - 1e-6);
      }
      const inc = layout.links.filter((l) => l.target === node).sort((a, b) => a.y1 - b.y1);
      for (let i = 1; i < inc.length; i++) {
        expect(inc[i].y1 - inc[i].targetWidth / 2).toBeGreaterThanOrEqual(inc[i - 1].y1 + inc[i - 1].targetWidth / 2 - 1e-6);
      }
    }
  });

  it("never lets a band cross a stage it passes over", () => {
    const busy = buildSankey([
      ...Array.from({ length: 97 }, (_, i) => ({ job_id: `s${i}`, from: "" as JobStatus, to: "skipped" as JobStatus })),
      ...job("a", "", "shortlisted", "applied", "interview", "offer", "accepted"),
      ...job("b", "", "shortlisted", "applied", "interview", "skipped"),
      ...job("c", "", "shortlisted", "interview", "rejected"),
      ...job("d", "", "shortlisted", "applied", "rejected"),
      ...job("e", "", "rejected"),
      ...job("f", "", "shortlisted", "applied"),
    ]);
    const layout = layoutSankey(busy, { width: 720, height: 320 });
    expect(findBandOverlaps(layout)).toEqual([]);
  });

  it("keeps every stage box clear of the others", () => {
    const busy = buildSankey([
      ...Array.from({ length: 97 }, (_, i) => ({ job_id: `s${i}`, from: "" as JobStatus, to: "skipped" as JobStatus })),
      ...job("a", "", "shortlisted", "applied", "interview", "offer", "accepted"),
      ...job("b", "", "shortlisted", "interview", "rejected"),
      ...job("c", "", "shortlisted", "applied", "offer", "rejected"),
    ]);
    const layout = layoutSankey(busy, { width: 720, height: 320 });
    for (const a of layout.nodes) for (const b of layout.nodes) {
      if (a.id >= b.id) continue;
      const apart = a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0;
      expect(apart, `${a.id} and ${b.id}`).toBe(true);
    }
  });

  it("counts a band that crosses the lower half of a stage", () => {
    const crossing = buildSankey([
      ...job("a", "", "shortlisted", "applied", "interview"),
      ...job("b", "", "shortlisted", "interview"),
    ]);
    const layout = layoutSankey(crossing, { width: 720, height: 320 });
    expect(findBandOverlaps(layout)).toEqual([]);
  });

  it("leaves progress from the top of a stage, drops from the bottom, and pending in the middle", () => {
    const g = buildSankey([
      ...job("a", "", "shortlisted", "applied"),
      ...job("b", "", "shortlisted", "skipped"),
      ...job("c", "", "shortlisted"),
      ...job("d", "", "shortlisted"),
      ...job("e", "", "shortlisted"),
      ...job("f", "", "shortlisted"),
      ...job("g", "", "shortlisted"),
      ...job("h", "", "shortlisted"),
    ]);
    const layout = layoutSankey(g, { width: 720, height: 320 });
    const stage = layout.nodes.find((n) => n.id === "shortlisted")!;
    const forward = layout.links.find((l) => l.source.id === "shortlisted" && l.target.id === "applied")!;
    const drop = layout.links.find((l) => l.source.id === "shortlisted" && l.target.id === "skipped")!;
    expect(forward.y0 - forward.width / 2).toBeCloseTo(stage.y0);
    expect(drop.y0 + drop.width / 2).toBeCloseTo(stage.y1);
    expect(forward.y0 + forward.width / 2).toBeLessThanOrEqual(drop.y0 - drop.width / 2 + 1e-6);
  });

  it("gives an arriving band the width of its square root, and sizes a stage by the sum of its arrivals", () => {
    const g = buildSankey([
      ...job("a", "", "shortlisted", "applied"),
      ...job("b", "", "shortlisted", "applied"),
      ...job("c", "", "shortlisted", "applied"),
      ...job("d", "", "shortlisted", "applied"),
      ...job("e", "", "shortlisted", "interview"),
    ]);
    const layout = layoutSankey(g, { width: 720, height: 320 });
    for (const node of layout.nodes) {
      const incoming = layout.links.filter((l) => l.target === node);
      if (incoming.length === 0) continue;
      const filled = incoming.reduce((sum, l) => sum + l.targetWidth, 0);
      expect(filled, node.id).toBeCloseTo(node.y1 - node.y0);
      const unit = incoming[0].targetWidth / Math.sqrt(incoming[0].value);
      for (const l of incoming) expect(l.targetWidth / Math.sqrt(l.value)).toBeCloseTo(unit);
    }
  });

  it("scales the leaving bands so that together they fill the stage", () => {
    const g = buildSankey([
      ...job("a", "", "shortlisted", "applied"),
      ...job("b", "", "shortlisted", "applied"),
      ...job("c", "", "shortlisted", "applied"),
      ...job("d", "", "shortlisted", "applied"),
      ...job("e", "", "shortlisted", "interview"),
      ...job("p0", "", "shortlisted"),
      ...job("p1", "", "shortlisted"),
      ...job("p2", "", "shortlisted"),
      ...job("p3", "", "shortlisted"),
      ...job("p4", "", "shortlisted"),
      ...job("p5", "", "shortlisted"),
      ...job("p6", "", "shortlisted"),
      ...job("p7", "", "shortlisted"),
      ...job("p8", "", "shortlisted"),
      ...job("p9", "", "shortlisted"),
    ]);
    const layout = layoutSankey(g, { width: 720, height: 320 });
    const stage = layout.nodes.find((n) => n.id === "shortlisted")!;
    const leaving = layout.links.filter((l) => l.source === stage);
    expect(leaving.reduce((sum, l) => sum + l.width, 0)).toBeCloseTo(stage.y1 - stage.y0);
    const [first, second] = leaving;
    expect(first.width / second.width).toBeCloseTo(Math.sqrt(first.value) / Math.sqrt(second.value));
  });

  it("returns empty arrays for an empty graph", () => {
    expect(layoutSankey(buildSankey([]), { width: 300, height: 120 })).toEqual({
      nodes: [],
      links: [],
      height: 60,
    });
  });
});

describe("bandPath", () => {
  it("outlines a band between its two edges, closed", () => {
    const layout = layoutSankey(graph, { width: 300, height: 320 });
    const link = layout.links[0];
    const d = bandPath(link);
    expect(d.startsWith(`M${link.source.x1},${link.y0 - link.width / 2}`)).toBe(true);
    expect(d).toContain(`L${link.target.x0},${link.y1 + link.targetWidth / 2}`);
    expect(d.endsWith("Z")).toBe(true);
  });
});
