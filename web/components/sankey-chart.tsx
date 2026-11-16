"use client";

import { useMemo } from "react";
import type { FlowGraph } from "@/lib/sankey";
import { bandPath, layoutSankey, type LayoutLink } from "@/lib/sankey-layout";

const WIDTH = 720;
const MAX_HEIGHT = 320;
const LABEL_HEIGHT = 18;
const CHAR_WIDTH = 7;
const TAG_BOX = 160;

function labelWidth(text: string): number {
  return text.length * CHAR_WIDTH + 12;
}

function stageClass(id: string): string {
  return id || "scrape";
}

const SKIP_T = 0.85;
const NEAR_T = 0.5;

function curvePoint(link: LayoutLink, t: number): { x: number; y: number } {
  const mid = (link.source.x1 + link.target.x0) / 2;
  const mt = 1 - t;
  const x =
    mt * mt * mt * link.source.x1 +
    3 * mt * mt * t * mid +
    3 * mt * t * t * mid +
    t * t * t * link.target.x0;
  const y = link.y0 + (3 * t * t - 2 * t * t * t) * (link.y1 - link.y0);
  return { x, y };
}

function countPositions(links: LayoutLink[]): { link: LayoutLink; x: number; y: number }[] {
  const placed: { link: LayoutLink; x: number; y: number }[] = [];
  const candidates = links.map((link) => {
    const t = link.target.column - link.source.column > 1 ? SKIP_T : NEAR_T;
    return { link, ...curvePoint(link, t) };
  });
  candidates.sort((a, b) => a.x - b.x || a.y - b.y);
  for (const candidate of candidates) {
    const width = labelWidth(String(candidate.link.value));
    let y = candidate.y;
    const clashes = () =>
      placed.some((other) => {
        const otherWidth = labelWidth(String(other.link.value));
        return (
          Math.abs(other.x - candidate.x) < (width + otherWidth) / 2 &&
          Math.abs(other.y - y) < LABEL_HEIGHT
        );
      });
    while (clashes()) y += LABEL_HEIGHT;
    placed.push({ link: candidate.link, x: candidate.x, y });
  }
  return placed;
}

export function SankeyChart({ graph }: { graph: FlowGraph }) {
  const layout = useMemo(
    () => layoutSankey(graph, { width: WIDTH, height: MAX_HEIGHT }),
    [graph]
  );

  if (layout.nodes.length === 0) {
    return <p className="empty-state">No status changes recorded yet.</p>;
  }

  return (
    <svg
      className="sankey"
      viewBox={`0 0 ${WIDTH} ${layout.height}`}
      role="img"
      aria-label="Application flow between stages"
    >
      <title>Application flow between stages</title>
      <g>
        {layout.links.map((link) => {
          return (
            <path
              key={`${link.source.id}>${link.target.id}`}
              data-sankey-link
              className={`sankey-link sankey-link--${stageClass(link.target.id)}`}
              d={bandPath(link)}
            >
              <title>{`${link.source.label} to ${link.target.label}: ${link.value}`}</title>
            </path>
          );
        })}
      </g>
      <g>
        {layout.nodes.map((node) => {
          const tagX = node.labelAnchor === "middle" ? node.labelX - TAG_BOX / 2 : node.labelX;
          const tagY = node.labelY - TAG_BOX / 2;
          return (
            <g key={node.id} data-sankey-node>
              <rect
                className={`sankey-node sankey-node--${stageClass(node.id)}`}
                x={node.x0}
                y={node.y0}
                width={node.x1 - node.x0}
                height={Math.max(1, node.y1 - node.y0)}
                rx={2}
              />
              {node.id === "" ? (
                <text
                  className="sankey-label"
                  x={node.x0 - 6}
                  y={(node.y0 + node.y1) / 2}
                  textAnchor="end"
                  dominantBaseline="middle"
                >
                  {node.value}
                </text>
              ) : null}
              {node.id !== "" && (
                <foreignObject x={tagX} y={tagY} width={TAG_BOX} height={TAG_BOX} data-sankey-tag>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: node.labelAnchor === "middle" ? "center" : "flex-start",
                      height: "100%",
                    }}
                  >
                    <span className={`status-chip status-chip--${node.id}`}>{node.label}</span>
                  </div>
                </foreignObject>
              )}
            </g>
          );
        })}
      </g>
      <g>
        {countPositions(layout.links).map(({ link, x, y }) => {
          const width = labelWidth(String(link.value));
          return (
            <g key={`count-${link.source.id}>${link.target.id}`} data-sankey-count>
              <rect
                className="sankey-count-bg"
                x={x - width / 2}
                y={y - LABEL_HEIGHT / 2}
                width={width}
                height={LABEL_HEIGHT}
                rx={LABEL_HEIGHT / 2}
              />
              <text
                className="sankey-count"
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {link.value}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
