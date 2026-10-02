import type { Job, JobStatus } from "@/lib/csv";
import type { StatusLogEntry } from "@/lib/status-log";

export interface GanttSegment {
  status: JobStatus;
  start: number;
  end: number;
}

export interface GanttRow {
  job_id: string;
  title: string;
  company: string;
  segments: GanttSegment[];
  lastActivity: number;
}

export interface GanttData {
  rows: GanttRow[];
  min: number | null;
  max: number | null;
}

interface Point {
  status: JobStatus;
  at: number;
}

// Undo writes the earlier timestamp back. A log entry that is earlier than the
// entries before it therefore cancels them, so the chart shows the restored history.
function historyFor(entries: StatusLogEntry[]): Point[] {
  const kept: Point[] = [];
  for (const entry of entries) {
    const at = Date.parse(entry.at);
    if (Number.isNaN(at)) continue;
    while (kept.length > 0 && kept[kept.length - 1].at > at) kept.pop();
    kept.push({ status: entry.to, at });
  }
  return kept;
}

function segmentsFrom(points: Point[], now: number): GanttSegment[] {
  const segments: GanttSegment[] = [];
  let open: GanttSegment | null = null;
  for (let i = 0; i < points.length; i++) {
    const { status, at } = points[i];
    if (open && open.status === status) continue;
    if (open) open.end = at;
    open = { status, start: at, end: now };
    segments.push(open);
  }
  return segments.filter((s) => s.status !== "" && s.end >= s.start);
}

export function buildGanttRows(log: StatusLogEntry[], jobs: Job[], now: number): GanttData {
  const byJob = new Map<string, StatusLogEntry[]>();
  for (const entry of log) {
    const list = byJob.get(entry.job_id);
    if (list) list.push(entry);
    else byJob.set(entry.job_id, [entry]);
  }

  const rows: GanttRow[] = [];
  for (const job of jobs) {
    if (!job.status) continue;
    let points = historyFor(byJob.get(job.job_id) ?? []);
    if (points.length === 0) {
      const at = Date.parse(job.status_updated_at);
      if (Number.isNaN(at)) continue;
      points = [{ status: job.status, at }];
    }
    const segments = segmentsFrom(points, now);
    if (segments.length === 0) continue;
    rows.push({
      job_id: job.job_id,
      title: job.title,
      company: job.company,
      segments,
      lastActivity: points[points.length - 1].at,
    });
  }

  rows.sort((a, b) => b.lastActivity - a.lastActivity);

  const all = rows.flatMap((r) => r.segments);
  return {
    rows,
    min: all.length ? Math.min(...all.map((s) => s.start)) : null,
    max: all.length ? Math.max(...all.map((s) => s.end)) : null,
  };
}
