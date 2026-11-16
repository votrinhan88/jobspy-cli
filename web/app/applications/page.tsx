"use client";

import { useCallback, useEffect, useState } from "react";
import type { Job, JobStatus } from "@/lib/csv";
import { formatLocation } from "@/lib/jobs-view";
import { STATUSES, isActiveStatus, isArchivedStatus, isTrackedStatus, statusLabel } from "@/lib/status";
import type { StatusLogEntry } from "@/lib/status-log";
import { buildGanttRows, type GanttData } from "@/lib/gantt";
import { StatusMenu } from "@/components/status-menu";
import { useChangeStatus } from "@/components/use-change-status";

const COLUMNS = STATUSES.filter((s) => s !== "");

const VIEWS = ["kanban", "table", "gantt"] as const;
type View = (typeof VIEWS)[number];
const VIEW_LABELS: Record<View, string> = { kanban: "Kanban", table: "Table", gantt: "Gantt" };
const VIEW_KEY = "applications_view";

function readStoredView(): View | null {
  try {
    const value = window.localStorage.getItem(VIEW_KEY);
    return (VIEWS as readonly string[]).includes(value ?? "") ? (value as View) : null;
  } catch {
    return null;
  }
}

function storeView(view: View): void {
  try {
    window.localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Storage can be blocked. The view then resets on reload, which is acceptable.
  }
}

// A shortcut for the usual next step only. Every other move is in the status menu.
function primaryAction(status: JobStatus): { to: JobStatus; label: string } | null {
  if (status === "shortlisted") return { to: "applied", label: "Mark applied" };
  if (status === "applied") return { to: "interview", label: "Move to interview" };
  if (status === "interview") return { to: "offer", label: "Got offer" };
  return null;
}

type ChangeStatus = (job: Job, next: JobStatus) => void;

export default function ApplicationsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [noProfile, setNoProfile] = useState(false);
  const [view, setView] = useState<View>("kanban");
  const [log, setLog] = useState<{ entries: StatusLogEntry[]; now: number } | null>(null);

  const onUpdated = useCallback((updated: Job) => {
    setJobs((prev) => prev.map((j) => (j.job_id === updated.job_id ? updated : j)));
  }, []);
  const { changeStatus, pending } = useChangeStatus(onUpdated);

  useEffect(() => {
    async function load() {
      const stored = readStoredView();
      if (stored) setView(stored);
      try {
        const res = await fetch("/api/jobs");
        if (res.status === 400) { setNoProfile(true); return; }
        if (!res.ok) return;
        setJobs(await res.json());
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (view !== "gantt") return;
    let cancelled = false;
    async function loadLog() {
      const res = await fetch("/api/jobs/log");
      if (!res.ok || cancelled) return;
      const entries: StatusLogEntry[] = await res.json();
      if (!cancelled) setLog({ entries, now: Date.now() });
    }
    loadLog();
    return () => {
      cancelled = true;
    };
  }, [view, jobs]);

  function selectView(next: View) {
    setView(next);
    storeView(next);
  }

  if (noProfile) {
    return (
      <div className="page-content">
        <header className="page-header"><h1 className="page-title">Applications</h1></header>
        <div className="empty-card">
          <p className="empty-card-text">No active profile.</p>
          <a href="/profile" className="btn btn-primary">Create a profile</a>
        </div>
      </div>
    );
  }

  const tracked = jobs.filter((j) => isTrackedStatus(j.status));
  const activeCount = tracked.filter((j) => isActiveStatus(j.status)).length;
  const rejectedCount = tracked.filter((j) => j.status === "rejected").length;
  const byStatus = Object.fromEntries(
    COLUMNS.map((s) => [s, tracked.filter((j) => j.status === s)])
  ) as Record<JobStatus, Job[]>;

  return (
    <div className="page-content page-content--wide">
      <header className="page-header page-header--row">
        <div>
          <h1 className="page-title">Applications</h1>
          <p className="page-subtitle">
            {loading
              ? ""
              : `${activeCount} active application${activeCount !== 1 ? "s" : ""}, ${rejectedCount} rejected`}
          </p>
        </div>
        <div className="view-toggle" role="group" aria-label="View">
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              className={`view-btn${view === v ? " view-btn--active" : ""}`}
              aria-pressed={view === v}
              onClick={() => selectView(v)}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <p className="loading-row">Loading…</p>
      ) : tracked.length === 0 ? (
        <div className="empty-card">
          <p className="empty-card-text">No applications yet.</p>
          <p className="empty-card-sub">Shortlist jobs from the <a href="/jobs" className="link">Jobs</a> page to start tracking.</p>
        </div>
      ) : view === "kanban" ? (
        <KanbanView byStatus={byStatus} pending={pending} onChange={changeStatus} />
      ) : view === "table" ? (
        <TableView jobs={tracked} pending={pending} onChange={changeStatus} />
      ) : log ? (
        <GanttView data={buildGanttRows(log.entries, tracked, log.now)} />
      ) : (
        <p className="loading-row">Loading…</p>
      )}
    </div>
  );
}

function KanbanView({
  byStatus,
  pending,
  onChange,
}: {
  byStatus: Record<JobStatus, Job[]>;
  pending: Set<string>;
  onChange: ChangeStatus;
}) {
  const active = COLUMNS.filter((s) => !isArchivedStatus(s));
  const archive = COLUMNS.filter((s) => isArchivedStatus(s) && isTrackedStatus(s));

  return (
    <div>
      <div className="kanban-board" aria-label="Active applications">
        {active.map((col) => (
          <KanbanColumn key={col} status={col} jobs={byStatus[col]} pending={pending} onChange={onChange} />
        ))}
      </div>
      {archive.some((s) => byStatus[s].length > 0) && (
        <div className="kanban-archive">
          <p className="section-title">Rejected</p>
          <div className="kanban-board kanban-board--archive" aria-label="Rejected applications">
            {archive.map((col) => (
              <KanbanColumn key={col} status={col} jobs={byStatus[col]} pending={pending} onChange={onChange} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KanbanColumn({
  status,
  jobs,
  pending,
  onChange,
}: {
  status: JobStatus;
  jobs: Job[];
  pending: Set<string>;
  onChange: ChangeStatus;
}) {
  return (
    <section className="kanban-col" aria-label={`${statusLabel(status)}, ${jobs.length}`}>
      <div className="kanban-col-header">
        <span className={`status-chip status-chip--${status}`}>{statusLabel(status)}</span>
        <span className="kanban-count">{jobs.length}</span>
      </div>
      <div className="kanban-cards">
        {jobs.length === 0 ? (
          <p className="kanban-empty">No jobs</p>
        ) : (
          jobs.map((job) => (
            <JobCard key={job.job_id} job={job} busy={pending.has(job.job_id)} onChange={onChange} />
          ))
        )}
      </div>
    </section>
  );
}

function CardActions({ job, busy, onChange }: { job: Job; busy: boolean; onChange: ChangeStatus }) {
  const primary = primaryAction(job.status);
  return (
    <>
      {primary && (
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => onChange(job, primary.to)}
          disabled={busy}
        >
          {primary.label}
        </button>
      )}
      <StatusMenu
        current={job.status}
        jobTitle={job.title || "job"}
        disabled={busy}
        onSelect={(s) => onChange(job, s)}
      />
    </>
  );
}

function JobCard({ job, busy, onChange }: { job: Job; busy: boolean; onChange: ChangeStatus }) {
  return (
    <div className="job-card">
      <a href={job.job_url} target="_blank" rel="noopener noreferrer" className="job-card-title">
        {job.title}
      </a>
      <p className="job-card-company">{job.company}</p>
      {job.location && <p className="job-card-location">{formatLocation(job)}</p>}
      <div className="job-card-actions">
        <CardActions job={job} busy={busy} onChange={onChange} />
      </div>
    </div>
  );
}

function TableView({ jobs, pending, onChange }: { jobs: Job[]; pending: Set<string>; onChange: ChangeStatus }) {
  return (
    <div className="table-wrap">
      <table className="jobs-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Company</th>
            <th>Location</th>
            <th>Status</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.job_id}>
              <td className="job-title-cell">
                <a href={job.job_url} target="_blank" rel="noopener noreferrer" className="job-link">
                  {job.title}
                </a>
              </td>
              <td>{job.company}</td>
              <td className="muted">{formatLocation(job) || "—"}</td>
              <td>
                <span className={`status-chip status-chip--${job.status}`}>{statusLabel(job.status)}</span>
              </td>
              <td className="muted mono">
                {job.status_updated_at ? new Date(job.status_updated_at).toLocaleDateString() : "—"}
              </td>
              <td>
                <div className="row-actions">
                  <CardActions job={job} busy={pending.has(job.job_id)} onChange={onChange} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PX_PER_DAY = 22;

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function mondayOnOrBefore(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

function GanttView({ data }: { data: GanttData }) {
  if (data.rows.length === 0 || data.min === null || data.max === null) {
    return (
      <div className="empty-card">
        <p className="empty-card-text">No status history yet.</p>
        <p className="empty-card-sub">
          Shortlist jobs from the <a href="/jobs" className="link">Jobs</a> page. Each status change adds a bar here.
        </p>
      </div>
    );
  }

  const start = mondayOnOrBefore(data.min);
  const end = Math.max(data.max, start + 7 * DAY_MS);
  const width = Math.max(640, Math.ceil(((end - start) / DAY_MS) * PX_PER_DAY));
  const x = (ms: number) => ((ms - start) / (end - start)) * width;
  const ticks: number[] = [];
  for (let t = start; t <= end; t += 7 * DAY_MS) ticks.push(t);

  return (
    <section className="gantt" aria-label="Status history by job">
      <div className="gantt-legend" aria-hidden="true">
        {COLUMNS.map((s) => (
          <span key={s} className="gantt-legend-item">
            <span className={`status-dot status-dot--${s}`} />
            {statusLabel(s)}
          </span>
        ))}
      </div>
      <div className="gantt-scroll">
        <div className="gantt-grid" style={{ ["--gantt-width" as string]: `${width}px` }}>
          <div className="gantt-axis">
            <div className="gantt-label gantt-label--axis">Job</div>
            <div className="gantt-track" aria-hidden="true">
              {ticks.map((t) => (
                <span key={t} className="gantt-tick" style={{ left: x(t) }}>
                  {shortDate(t)}
                </span>
              ))}
            </div>
          </div>
          <ul className="gantt-rows">
            {data.rows.map((row) => (
              <li key={row.job_id} className="gantt-row">
                <div className="gantt-label">
                  <span className="gantt-title">{row.title}</span>
                  <span className="gantt-company">{row.company}</span>
                </div>
                <div className="gantt-track">
                  {ticks.map((t) => (
                    <span key={t} className="gantt-gridline" style={{ left: x(t) }} aria-hidden="true" />
                  ))}
                  {row.segments.map((seg) => {
                    const label = `${statusLabel(seg.status)}, ${shortDate(seg.start)} to ${shortDate(seg.end)}`;
                    return (
                      <span
                        key={`${seg.status}-${seg.start}`}
                        role="img"
                        aria-label={label}
                        title={label}
                        className={`gantt-bar gantt-bar--${seg.status}`}
                        style={{ left: x(seg.start), width: Math.max(3, x(seg.end) - x(seg.start)) }}
                      />
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
