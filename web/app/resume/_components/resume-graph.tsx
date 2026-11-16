"use client";

import { useMemo } from "react";
import { buildForkGraph, type GraphInput } from "@/lib/resumes/graph";

const ROW_HEIGHT = 34;
const LANE_WIDTH = 15;
const MAX_GRAPH_WIDTH = 120;
const GUTTER = 12;
const DOT = 4.5;
const LANE_COLOURS = ["#3b82f6", "#ec4899", "#f59e0b", "#22c55e", "#a855f7", "#14b8a6"];

const colour = (lane: number) => LANE_COLOURS[lane % LANE_COLOURS.length];

export function ResumeGraph({
  items,
  selectedTag,
  onSelect,
}: {
  items: GraphInput[];
  selectedTag: string | undefined;
  onSelect: (tag: string) => void;
}) {
  const graph = useMemo(() => buildForkGraph(items), [items]);
  const byTag = new Map(items.map((item) => [item.tag, item]));
  const gaps = Math.max(graph.lanes - 1, 0);
  const laneWidth = gaps > 0 ? Math.min(LANE_WIDTH, (MAX_GRAPH_WIDTH - GUTTER * 2) / gaps) : LANE_WIDTH;
  const graphWidth = GUTTER * 2 + gaps * laneWidth;
  const x = (lane: number) => GUTTER + lane * laneWidth;
  const y = (row: number) => row * ROW_HEIGHT + ROW_HEIGHT / 2;

  return (
    <div
      className="resume-graph"
      role="group"
      aria-label="Resume forks"
      style={{ "--graph-width": `${graphWidth}px`, "--row-height": `${ROW_HEIGHT}px` } as React.CSSProperties}
    >
      <div className="resume-graph-head" aria-hidden="true">
        <span>Graph</span>
        <span>Resume</span>
        <span>Imported</span>
        <span>Version</span>
      </div>
      <div className="resume-graph-body">
        <svg
          className="resume-graph-lanes"
          width={graphWidth}
          height={graph.rows * ROW_HEIGHT}
          aria-hidden="true"
        >
          {graph.edges.map((edge) => {
            const x0 = x(edge.fromLane);
            const y0 = y(edge.fromRow);
            const x1 = x(edge.toLane);
            const y1 = y(edge.toRow);
            const d =
              x0 === x1
                ? `M${x0},${y0} L${x1},${y1}`
                : `M${x0},${y0} L${x0},${y1 - ROW_HEIGHT * 0.6} C${x0},${y1 - ROW_HEIGHT * 0.1} ${x1},${y1 - ROW_HEIGHT * 0.5} ${x1},${y1}`;
            return (
              <path
                key={`${edge.from}>${edge.to}`}
                data-graph-edge
                className="resume-graph-edge"
                stroke={colour(edge.fromLane)}
                d={d}
              />
            );
          })}
          {graph.nodes.map((node) => (
            <circle
              key={node.tag}
              data-graph-dot
              className={`resume-graph-dot${node.tag === selectedTag ? " resume-graph-dot--selected" : ""}`}
              cx={x(node.lane)}
              cy={y(node.row)}
              r={node.tag === selectedTag ? DOT + 1.5 : DOT}
              fill={colour(node.lane)}
            />
          ))}
        </svg>
        {graph.nodes.map((node) => {
          const item = byTag.get(node.tag)!;
          const selected = node.tag === selectedTag;
          return (
            <button
              key={node.tag}
              type="button"
              aria-label={node.tag}
              aria-current={selected ? "true" : undefined}
              className={`resume-graph-row${selected ? " resume-graph-row--selected" : ""}`}
              onClick={() => onSelect(node.tag)}
            >
              <span />
              <span className="resume-graph-tag" title={node.tag}>
                {node.tag}
              </span>
              <span className="resume-graph-meta">{item.importedAt.slice(0, 10)}</span>
              <span className="resume-graph-meta">{item.version === undefined ? "" : `v${item.version}`}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
