import type { FlowGraph, FlowNode } from "@/lib/sankey";

export interface LayoutSize {
  width: number;
  height: number;
}

export interface LayoutNode extends FlowNode {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  value: number;
  labelX: number;
  labelY: number;
  labelAnchor: "middle" | "start";
}

export interface LayoutLink {
  source: LayoutNode;
  target: LayoutNode;
  value: number;
  width: number;
  targetWidth: number;
  y0: number;
  y1: number;
}

export interface SankeyLayout {
  nodes: LayoutNode[];
  links: LayoutLink[];
  height: number;
}

export interface BandOverlap {
  link: LayoutLink;
  node: LayoutNode;
  push: number;
}

const NODE_WIDTH = 16;
const MARGIN_TOP = 48;
const MARGIN_BOTTOM = 12;
const MARGIN_X = 48;
const MAX_UNIT = 28;
const NODE_GAP = 12;
const LABEL_HEIGHT = 18;
const LABEL_OFFSET = 8;
const LABEL_RESERVE = 110;
const CLEARANCE = 6;
const CURVE_SAMPLES = 80;
const MAX_PASSES = 60;
const PROGRESS_END = 0.35;
const DROP_START = 0.65;
const DROPS = new Set<string>(["rejected", "skipped"]);

// The canvas has two channels. Progress stages stack from the top, inside the top 35%.
// Drops (Rejected, Skipped) stack from the bottom, inside the bottom 35%. The middle 30%
// stays empty. A stage that a band crosses is pushed down until the band passes above it.
export function layoutSankey(graph: FlowGraph, size: LayoutSize): SankeyLayout {
  if (graph.links.length === 0) {
    return { nodes: [], links: [], height: MARGIN_TOP + MARGIN_BOTTOM };
  }

  const height = size.height;
  const weight = (count: number) => Math.sqrt(count);
  const inWeight = new Map<string, number>();
  const outWeight = new Map<string, number>();
  const outCount = new Map<string, number>();
  const inCount = new Map<string, number>();
  for (const link of graph.links) {
    outWeight.set(link.source, (outWeight.get(link.source) ?? 0) + weight(link.value));
    inWeight.set(link.target, (inWeight.get(link.target) ?? 0) + weight(link.value));
    outCount.set(link.source, (outCount.get(link.source) ?? 0) + link.value);
    inCount.set(link.target, (inCount.get(link.target) ?? 0) + link.value);
  }
  // A band has a width at each end. The arriving end is sqrt(count). A node is as tall as the
  // sum of its arriving ends, or of its leaving ends when nothing arrives. The leaving ends are
  // scaled by the same factor so that together they fill the node.
  const nodeWeight = new Map<string, number>(
    graph.nodes.map((node) => [
      node.id,
      (inWeight.get(node.id) ?? 0) > 0 ? inWeight.get(node.id)! : (outWeight.get(node.id) ?? 0),
    ])
  );
  const leavingScale = (id: string) => {
    const out = outWeight.get(id) ?? 0;
    return out > 0 ? nodeWeight.get(id)! / out : 1;
  };

  const columns = new Map<number, FlowNode[]>();
  for (const node of graph.nodes) {
    const column = columns.get(node.column) ?? [];
    column.push(node);
    columns.set(node.column, column);
  }

  const topCapacity = height * PROGRESS_END - MARGIN_TOP;
  const bottomCapacity = height - MARGIN_BOTTOM - height * DROP_START;
  const isDrop = (id: string) => DROPS.has(id);
  let unit = MAX_UNIT;
  for (const members of columns.values()) {
    const progress = members.filter((n) => !isDrop(n.id));
    const drops = members.filter((n) => isDrop(n.id));
    const progressTotal = progress.reduce((sum, n) => sum + nodeWeight.get(n.id)!, 0);
    const dropTotal = drops.reduce((sum, n) => sum + nodeWeight.get(n.id)!, 0);
    const progressGaps = Math.max(0, progress.length - 1) * NODE_GAP;
    const dropGaps = Math.max(0, drops.length - 1) * NODE_GAP;
    if (progressTotal > 0) {
      unit = Math.min(unit, Math.max(0, topCapacity - progressGaps) / progressTotal);
    }
    if (dropTotal > 0) {
      unit = Math.min(unit, Math.max(0, bottomCapacity - dropGaps) / dropTotal);
    }
  }

  const maxColumn = Math.max(...graph.nodes.map((n) => n.column));
  const hasStack = [...columns.values()].some((members) => members.length > 1);
  const spanX = size.width - 2 * MARGIN_X - NODE_WIDTH - (hasStack ? LABEL_RESERVE : 0);
  const stepX = maxColumn > 0 ? spanX / maxColumn : 0;
  const headerY = MARGIN_TOP / 2;

  const build = (offsets: Map<string, number>): SankeyLayout => {
    const nodes: LayoutNode[] = [];
    for (const [column, members] of columns) {
      const stacked = members.length > 1;
      const x0 = maxColumn > 0 ? MARGIN_X + column * stepX : (size.width - NODE_WIDTH) / 2;

      const tops = new Map<string, number>();
      let dropCursor = height - MARGIN_BOTTOM;
      for (const node of [...members].reverse().filter((n) => isDrop(n.id))) {
        const nodeHeight = nodeWeight.get(node.id)! * unit;
        const top = dropCursor - nodeHeight;
        tops.set(node.id, top);
        dropCursor = top - NODE_GAP;
      }
      let progressCursor = MARGIN_TOP;
      for (const node of members.filter((n) => !isDrop(n.id))) {
        const top = progressCursor + (offsets.get(node.id) ?? 0);
        tops.set(node.id, top);
        progressCursor = top + nodeWeight.get(node.id)! * unit + NODE_GAP;
      }

      let previousLabelY = -Infinity;
      for (const node of members) {
        const nodeHeight = nodeWeight.get(node.id)! * unit;
        const top = tops.get(node.id)!;
        const center = top + nodeHeight / 2;
        const labelY = stacked ? Math.max(center, previousLabelY + LABEL_HEIGHT) : headerY;
        previousLabelY = labelY;
        nodes.push({
          id: node.id,
          label: node.label,
          column: node.column,
          pending: node.pending,
          x0,
          x1: x0 + NODE_WIDTH,
          y0: top,
          y1: top + nodeHeight,
          value: Math.max(inCount.get(node.id) ?? 0, outCount.get(node.id) ?? 0),
          labelX: stacked ? x0 + NODE_WIDTH + LABEL_OFFSET : x0 + NODE_WIDTH / 2,
          labelY,
          labelAnchor: stacked ? "start" : "middle",
        });
      }
    }

    const byId = new Map<string, LayoutNode>(nodes.map((n) => [n.id, n]));
    const drafts = graph.links.map((link, index) => ({
      source: byId.get(link.source)!,
      target: byId.get(link.target)!,
      value: link.value,
      width: weight(link.value) * leavingScale(link.source) * unit,
      targetWidth: weight(link.value) * unit,
      index,
      y0: 0,
      y1: 0,
    }));

    type Draft = (typeof drafts)[number];
    // Progress leaves from the top of a node, sorted by where it goes. Drops leave from the
    // bottom. Arrivals start at the top, sorted by where they come from.
    const stackLeaving = (groups: Map<string, Draft[]>) => {
      for (const [id, group] of groups) {
        const node = byId.get(id)!;
        const byTarget = (a: Draft, b: Draft) => a.target.y0 - b.target.y0 || a.index - b.index;
        const progress = group.filter((d) => !isDrop(d.target.id)).sort(byTarget);
        const drops = group.filter((d) => isDrop(d.target.id)).sort(byTarget);
        let top = node.y0;
        for (const d of progress) {
          d.y0 = top + d.width / 2;
          top += d.width;
        }
        let bottom = node.y1;
        for (const d of drops.reverse()) {
          bottom -= d.width;
          d.y0 = bottom + d.width / 2;
        }
      }
    };
    const stackArriving = (groups: Map<string, Draft[]>) => {
      for (const [id, group] of groups) {
        const node = byId.get(id)!;
        group.sort((a, b) => a.source.y0 - b.source.y0 || a.index - b.index);
        let top = node.y0;
        for (const d of group) {
          d.y1 = top + d.targetWidth / 2;
          top += d.targetWidth;
        }
      }
    };

    const leaving = new Map<string, Draft[]>();
    const arriving = new Map<string, Draft[]>();
    for (const d of drafts) {
      leaving.set(d.source.id, [...(leaving.get(d.source.id) ?? []), d]);
      arriving.set(d.target.id, [...(arriving.get(d.target.id) ?? []), d]);
    }
    stackLeaving(leaving);
    stackArriving(arriving);

    const links: LayoutLink[] = drafts.map(({ source, target, value, width, targetWidth, y0, y1 }) => ({
      source,
      target,
      value,
      width,
      targetWidth,
      y0,
      y1,
    }));
    return { nodes, links, height };
  };

  const offsets = new Map<string, number>();
  let layout = build(offsets);
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const overlaps = findBandOverlaps(layout).filter((o) => !isDrop(o.node.id));
    if (overlaps.length === 0) break;
    for (const o of overlaps) {
      offsets.set(o.node.id, (offsets.get(o.node.id) ?? 0) + o.push + CLEARANCE);
    }
    layout = build(offsets);
  }
  return layout;
}

function bandPoint(link: LayoutLink, t: number): { x: number; y: number } {
  const x1 = link.source.x1;
  const x0 = link.target.x0;
  const mid = (x1 + x0) / 2;
  const mt = 1 - t;
  const x = mt * mt * mt * x1 + 3 * mt * mt * t * mid + 3 * mt * t * t * mid + t * t * t * x0;
  const y = link.y0 + (3 * t * t - 2 * t * t * t) * (link.y1 - link.y0);
  return { x, y };
}

export function bandPath(link: LayoutLink): string {
  const x0 = link.source.x1;
  const x1 = link.target.x0;
  const mid = (x0 + x1) / 2;
  const topStart = link.y0 - link.width / 2;
  const topEnd = link.y1 - link.targetWidth / 2;
  const bottomStart = link.y0 + link.width / 2;
  const bottomEnd = link.y1 + link.targetWidth / 2;
  return (
    `M${x0},${topStart} C${mid},${topStart} ${mid},${topEnd} ${x1},${topEnd} ` +
    `L${x1},${bottomEnd} C${mid},${bottomEnd} ${mid},${bottomStart} ${x0},${bottomStart} Z`
  );
}

export function bandWidth(link: LayoutLink, t: number): number {
  return link.width + (3 * t * t - 2 * t * t * t) * (link.targetWidth - link.width);
}

// A node strictly between a band's two columns must lie clear of the band wherever they
// overlap in x. The push is how far the node must move down to clear it.
export function findBandOverlaps(layout: SankeyLayout): BandOverlap[] {
  const overlaps: BandOverlap[] = [];
  for (const link of layout.links) {
    const lo = Math.min(link.source.column, link.target.column);
    const hi = Math.max(link.source.column, link.target.column);
    for (const node of layout.nodes) {
      if (node.column <= lo || node.column >= hi) continue;
      let push = 0;
      for (let i = 0; i <= CURVE_SAMPLES; i++) {
        const p = bandPoint(link, i / CURVE_SAMPLES);
        if (p.x < node.x0 - 0.5 || p.x > node.x1 + 0.5) continue;
        const half = bandWidth(link, i / CURVE_SAMPLES) / 2;
        const bottom = p.y + half;
        const top = p.y - half;
        if (bottom > node.y0 - CLEARANCE && top < node.y1 + CLEARANCE) {
          push = Math.max(push, bottom - (node.y0 - CLEARANCE));
        }
      }
      if (push > 0) overlaps.push({ link, node, push });
    }
  }
  return overlaps;
}
