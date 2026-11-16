export interface GraphInput {
  tag: string;
  parent?: string;
  importedAt: string;
  version?: number;
}

export interface GraphNode {
  tag: string;
  row: number;
  lane: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  fromRow: number;
  fromLane: number;
  toRow: number;
  toLane: number;
}

export interface ForkGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  lanes: number;
  rows: number;
}

// One tree: a row for each resume, newest first, and a fork always sits above its parent. A fork continues
// its parent's lane when it is the first fork met from the top. Later forks of the same parent get a lane
// of their own and join the parent's lane at the parent's row, which then frees the lane.
function layoutTree(items: GraphInput[]): ForkGraph {
  const byTag = new Map(items.map((item) => [item.tag, item]));
  const parentOf = (item: GraphInput): GraphInput | undefined => {
    const parent = item.parent && item.parent !== item.tag ? byTag.get(item.parent) : undefined;
    return parent;
  };
  const waiting = new Map<string, number>();
  for (const item of items) waiting.set(item.tag, 0);
  for (const item of items) {
    const parent = parentOf(item);
    if (parent) waiting.set(parent.tag, waiting.get(parent.tag)! + 1);
  }

  const newestFirst = (a: GraphInput, b: GraphInput) => b.importedAt.localeCompare(a.importedAt) || a.tag.localeCompare(b.tag);
  const remaining = new Set(items.map((item) => item.tag));
  const order: GraphInput[] = [];
  while (remaining.size > 0) {
    const left = [...remaining].map((tag) => byTag.get(tag)!).sort(newestFirst);
    // A parent cycle leaves no resume ready, so the newest one goes next.
    const next = left.find((item) => waiting.get(item.tag) === 0) ?? left[0];
    remaining.delete(next.tag);
    order.push(next);
    const parent = parentOf(next);
    if (parent) waiting.set(parent.tag, waiting.get(parent.tag)! - 1);
  }

  const rowOf = new Map(order.map((item, row) => [item.tag, row]));
  const active = new Set<number>();
  const reserved = new Map<string, number>();
  const merging = new Map<string, number[]>();
  const nodes: GraphNode[] = [];
  const parents = new Map<string, string>();
  let lanes = 0;

  order.forEach((item, row) => {
    let lane = reserved.get(item.tag);
    if (lane === undefined) {
      lane = 0;
      while (active.has(lane)) lane++;
    }
    active.add(lane);
    lanes = Math.max(lanes, lane + 1);
    for (const ended of merging.get(item.tag) ?? []) active.delete(ended);
    nodes.push({ tag: item.tag, row, lane });

    const parent = parentOf(item);
    if (parent && rowOf.get(parent.tag)! > row) {
      parents.set(item.tag, parent.tag);
      if (!reserved.has(parent.tag)) reserved.set(parent.tag, lane);
      else merging.set(parent.tag, [...(merging.get(parent.tag) ?? []), lane]);
    } else {
      active.delete(lane);
    }
  });

  const laneOf = new Map(nodes.map((n) => [n.tag, n]));
  const edges: GraphEdge[] = [];
  for (const [from, to] of parents) {
    const a = laneOf.get(from)!;
    const b = laneOf.get(to)!;
    edges.push({ from, to, fromRow: a.row, fromLane: a.lane, toRow: b.row, toLane: b.lane });
  }
  edges.sort((x, y) => x.fromRow - y.fromRow);

  return { nodes, edges, lanes, rows: order.length };
}

// A resume has at most one parent, so the resumes form separate trees. Each tree is one block of rows
// with its own lanes, and the tree holding the newest resume comes first.
export function buildForkGraph(items: GraphInput[]): ForkGraph {
  const byTag = new Map(items.map((item) => [item.tag, item]));
  const group = new Map<string, string>(items.map((item) => [item.tag, item.tag]));
  const find = (tag: string): string => {
    while (group.get(tag) !== tag) tag = group.get(tag)!;
    return tag;
  };
  for (const item of items) {
    if (item.parent && item.parent !== item.tag && byTag.has(item.parent)) {
      group.set(find(item.tag), find(item.parent));
    }
  }
  const trees = new Map<string, GraphInput[]>();
  for (const item of items) trees.set(find(item.tag), [...(trees.get(find(item.tag)) ?? []), item]);
  const newest = (tree: GraphInput[]) => tree.map((i) => i.importedAt).sort().at(-1)!;
  const ordered = [...trees.values()].sort((a, b) => newest(b).localeCompare(newest(a)) || a[0].tag.localeCompare(b[0].tag));

  const result: ForkGraph = { nodes: [], edges: [], lanes: 0, rows: 0 };
  for (const tree of ordered) {
    const part = layoutTree(tree);
    const offset = result.rows;
    result.nodes.push(...part.nodes.map((n) => ({ ...n, row: n.row + offset })));
    result.edges.push(
      ...part.edges.map((e) => ({ ...e, fromRow: e.fromRow + offset, toRow: e.toRow + offset }))
    );
    result.lanes = Math.max(result.lanes, part.lanes);
    result.rows += part.rows;
  }
  return result;
}
