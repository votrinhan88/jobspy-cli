import type { Job, JobStatus } from "@/lib/csv";
import { STATUSES, isActiveStatus, isArchivedStatus, isRemote } from "@/lib/status";

export const STATUS_ORDER: JobStatus[] = STATUSES.filter((s) => s !== "");

export interface StatusCount {
  status: JobStatus;
  count: number;
}

export interface TimelinePoint {
  label: string;
  count: number;
}

export interface Statistics {
  total: number;
  active: number;
  remote: number;
  archived: number;
  perStatus: StatusCount[];
  timeline: TimelinePoint[];
  topCompanies: { name: string; count: number }[];
  topLocations: { name: string; count: number }[];
}

function weekKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.getDay();
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - diffToMonday);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString();
}

function weekLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function topCounts(values: string[], limit: number): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const value of values) {
    const v = value.trim();
    if (!v) continue;
    map.set(v, (map.get(v) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function computeStatistics(jobs: Job[]): Statistics {
  const perStatus: StatusCount[] = STATUS_ORDER.map((status) => ({
    status,
    count: jobs.filter((j) => j.status === status).length,
  }));
  const active = jobs.filter((j) => isActiveStatus(j.status)).length;
  const archived = jobs.filter((j) => isArchivedStatus(j.status)).length;
  const remote = jobs.filter((j) => isRemote(j.is_remote)).length;

  const weekCounts = new Map<string, number>();
  for (const job of jobs) {
    if (!job.status || !job.status_updated_at) continue;
    const key = weekKey(job.status_updated_at);
    if (!key) continue;
    weekCounts.set(key, (weekCounts.get(key) ?? 0) + 1);
  }
  const timeline: TimelinePoint[] = [...weekCounts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key, count]) => ({ label: weekLabel(key), count }));

  return {
    total: jobs.length,
    active,
    remote,
    archived,
    perStatus,
    timeline,
    topCompanies: topCounts(jobs.map((j) => j.company), 6),
    topLocations: topCounts(jobs.map((j) => j.location), 6),
  };
}
