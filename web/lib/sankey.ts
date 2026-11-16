import type { JobStatus } from "@/lib/csv";
import { statusLabel } from "@/lib/status";

export const PIPELINE_STAGES: JobStatus[] = [
  "",
  "shortlisted",
  "applied",
  "interview",
  "offer",
];

export const OUTCOME_STAGES = ["accepted", "rejected", "skipped"] as const;

export type FlowStage = JobStatus;

const PIPELINE_RANK = new Map<string, number>(PIPELINE_STAGES.map((s, i) => [s, i]));
const OUTCOME_RANK = new Map<string, number>(OUTCOME_STAGES.map((s, i) => [s, i]));
const OUTCOME_SET = new Set<string>(OUTCOME_STAGES);

export const OUTCOME_COLUMN = PIPELINE_STAGES.length;

export interface FlowEntry {
  job_id: string;
  from: JobStatus;
  to: JobStatus;
}

export interface FlowNode {
  id: FlowStage;
  label: string;
  column: number;
  pending: number;
}

export interface FlowLink {
  source: FlowStage;
  target: FlowStage;
  value: number;
}

export interface FlowGraph {
  nodes: FlowNode[];
  links: FlowLink[];
}

export function stageLabel(id: FlowStage): string {
  if (id === "") return "Scrape";
  return statusLabel(id);
}

export function stageColumn(id: FlowStage): number {
  if (OUTCOME_SET.has(id)) return OUTCOME_COLUMN;
  return PIPELINE_RANK.get(id) ?? OUTCOME_COLUMN;
}

function countsAsMove(from: JobStatus, to: JobStatus): boolean {
  if (from === to) return false;
  if (OUTCOME_SET.has(to)) return PIPELINE_RANK.has(from);
  const fromRank = PIPELINE_RANK.get(from);
  const toRank = PIPELINE_RANK.get(to);
  return fromRank !== undefined && toRank !== undefined && toRank > fromRank;
}

export function buildSankey(entries: FlowEntry[]): FlowGraph {
  const counts = new Map<string, FlowLink>();
  const add = (source: FlowStage, target: FlowStage) => {
    const key = `${source}>${target}`;
    const link = counts.get(key);
    if (link) link.value++;
    else counts.set(key, { source, target, value: 1 });
  };

  const paths = new Map<string, FlowEntry[]>();
  const finalStatus = new Map<string, JobStatus>();
  for (const entry of entries) {
    const path = paths.get(entry.job_id) ?? [];
    const top = path.at(-1);
    finalStatus.set(entry.job_id, entry.to);
    if (top && entry.from !== top.to) continue;
    const back = path.findIndex((step) => step.from === entry.to);
    if (back >= 0) path.splice(back);
    else path.push(entry);
    paths.set(entry.job_id, path);
  }
  for (const path of paths.values()) {
    for (const { from, to } of path) {
      if (countsAsMove(from, to)) add(from, to);
    }
  }

  const pending = new Map<JobStatus, number>();
  for (const status of finalStatus.values()) {
    if (status !== "" && PIPELINE_RANK.has(status)) {
      pending.set(status, (pending.get(status) ?? 0) + 1);
    }
  }

  const links = [...counts.values()];
  const used = new Set<FlowStage>();
  for (const link of links) {
    used.add(link.source);
    used.add(link.target);
  }

  const order = (id: FlowStage) => PIPELINE_RANK.get(id) ?? OUTCOME_RANK.get(id) ?? 0;
  const orderedIds: FlowStage[] = [...PIPELINE_STAGES, ...OUTCOME_STAGES];

  return {
    nodes: orderedIds
      .filter((id) => used.has(id) || pending.has(id))
      .map((id) => ({
        id,
        label: stageLabel(id),
        column: stageColumn(id),
        pending: pending.get(id) ?? 0,
      })),
    links: links.sort(
      (a, b) =>
        stageColumn(a.source) - stageColumn(b.source) ||
        order(a.source) - order(b.source) ||
        stageColumn(a.target) - stageColumn(b.target) ||
        order(a.target) - order(b.target)
    ),
  };
}
