"use client";

import { useEffect, useState } from "react";
import type { Job, JobStatus } from "@/lib/csv";

const STATUS_ORDER: JobStatus[] = [
  "shortlisted",
  "applied",
  "interview",
  "offer",
  "rejected",
  "skipped",
];

const NEXT_STATUSES: Record<JobStatus, JobStatus[]> = {
  shortlisted: ["applied", "skipped"],
  applied: ["interview", "rejected", "skipped"],
  interview: ["offer", "rejected", "skipped"],
  offer: ["rejected"],
  rejected: [],
  skipped: [],
  "": [],
};

type View = "table" | "kanban";

export default function ApplicationsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [noProfile, setNoProfile] = useState(false);
  const [view, setView] = useState<View>("kanban");
  const [transitioning, setTransitioning] = useState<Set<string>>(new Set());

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/jobs");
      if (res.status === 400) { setNoProfile(true); return; }
      if (!res.ok) return;
      const data: Job[] = await res.json();
      setJobs(data.filter((j) => j.status !== ""));
    } finally {
      setLoading(false);
    }
  }

  async function transition(jobId: string, status: JobStatus) {
    setTransitioning((s) => new Set(s).add(jobId));
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) return;
      const updated: Job = await res.json();
      setJobs((prev) => prev.map((j) => (j.job_id === jobId ? updated : j)));
    } finally {
      setTransitioning((s) => { const n = new Set(s); n.delete(jobId); return n; });
    }
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

  const byStatus = STATUS_ORDER.reduce<Record<JobStatus, Job[]>>((acc, s) => {
    acc[s] = jobs.filter((j) => j.status === s);
    return acc;
  }, {} as Record<JobStatus, Job[]>);

  return (
    <div className="page-content page-content--wide">
      <header className="page-header page-header--row">
        <div>
          <h1 className="page-title">Applications</h1>
          <p className="page-subtitle">
            {loading ? "" : `${jobs.length} active application${jobs.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="view-toggle">
          <button
            className={`view-btn${view === "kanban" ? " view-btn--active" : ""}`}
            onClick={() => setView("kanban")}
          >Kanban</button>
          <button
            className={`view-btn${view === "table" ? " view-btn--active" : ""}`}
            onClick={() => setView("table")}
          >Table</button>
        </div>
      </header>

      {loading ? (
        <p className="loading-row">Loading…</p>
      ) : jobs.length === 0 ? (
        <div className="empty-card">
          <p className="empty-card-text">No applications yet.</p>
          <p className="empty-card-sub">Shortlist jobs from the <a href="/jobs" className="link">Jobs</a> page to start tracking.</p>
        </div>
      ) : view === "kanban" ? (
        <KanbanView byStatus={byStatus} transitioning={transitioning} onTransition={transition} />
      ) : (
        <TableView jobs={jobs} transitioning={transitioning} onTransition={transition} />
      )}
    </div>
  );
}

function KanbanView({
  byStatus,
  transitioning,
  onTransition,
}: {
  byStatus: Record<JobStatus, Job[]>;
  transitioning: Set<string>;
  onTransition: (id: string, status: JobStatus) => void;
}) {
  const active = STATUS_ORDER.filter((s) => s !== "rejected" && s !== "skipped");
  const archive = STATUS_ORDER.filter((s) => s === "rejected" || s === "skipped");

  return (
    <div>
      <div className="kanban-board">
        {active.map((col) => (
          <KanbanColumn
            key={col}
            status={col}
            jobs={byStatus[col]}
            transitioning={transitioning}
            onTransition={onTransition}
          />
        ))}
      </div>
      {archive.some((s) => byStatus[s].length > 0) && (
        <div className="kanban-archive">
          <p className="section-title">Archived</p>
          <div className="kanban-board">
            {archive.map((col) => (
              <KanbanColumn
                key={col}
                status={col}
                jobs={byStatus[col]}
                transitioning={transitioning}
                onTransition={onTransition}
              />
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
  transitioning,
  onTransition,
}: {
  status: JobStatus;
  jobs: Job[];
  transitioning: Set<string>;
  onTransition: (id: string, s: JobStatus) => void;
}) {
  return (
    <div className="kanban-col">
      <div className="kanban-col-header">
        <span className={`status-chip status-chip--${status}`}>{status}</span>
        <span className="kanban-count">{jobs.length}</span>
      </div>
      <div className="kanban-cards">
        {jobs.length === 0 ? (
          <p className="kanban-empty">—</p>
        ) : (
          jobs.map((job) => (
            <JobCard
              key={job.job_id}
              job={job}
              transitioning={transitioning.has(job.job_id)}
              onTransition={onTransition}
            />
          ))
        )}
      </div>
    </div>
  );
}

function JobCard({
  job,
  transitioning,
  onTransition,
}: {
  job: Job;
  transitioning: boolean;
  onTransition: (id: string, s: JobStatus) => void;
}) {
  const nexts = NEXT_STATUSES[job.status as JobStatus] ?? [];

  return (
    <div className="job-card">
      <a
        href={job.job_url}
        target="_blank"
        rel="noopener noreferrer"
        className="job-card-title"
      >
        {job.title}
      </a>
      <p className="job-card-company">{job.company}</p>
      {job.location && <p className="job-card-location">{job.location}</p>}
      {nexts.length > 0 && (
        <div className="job-card-actions">
          {nexts.map((s) => (
            <button
              key={s}
              className="btn btn-sm btn-secondary"
              onClick={() => onTransition(job.job_id, s)}
              disabled={transitioning}
            >
              {actionLabel(job.status as JobStatus, s)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TableView({
  jobs,
  transitioning,
  onTransition,
}: {
  jobs: Job[];
  transitioning: Set<string>;
  onTransition: (id: string, s: JobStatus) => void;
}) {
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
          {jobs.map((job) => {
            const nexts = NEXT_STATUSES[job.status as JobStatus] ?? [];
            return (
              <tr key={job.job_id}>
                <td className="job-title-cell">
                  <a href={job.job_url} target="_blank" rel="noopener noreferrer" className="job-link">
                    {job.title}
                  </a>
                </td>
                <td>{job.company}</td>
                <td className="muted">{job.location || "—"}</td>
                <td>
                  <span className={`status-chip status-chip--${job.status}`}>{job.status}</span>
                </td>
                <td className="muted mono">
                  {job.status_updated_at
                    ? new Date(job.status_updated_at).toLocaleDateString()
                    : "—"}
                </td>
                <td>
                  <div className="row-actions">
                    {nexts.map((s) => (
                      <button
                        key={s}
                        className="btn btn-sm btn-secondary"
                        onClick={() => onTransition(job.job_id, s)}
                        disabled={transitioning.has(job.job_id)}
                      >
                        {actionLabel(job.status as JobStatus, s)}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function actionLabel(from: JobStatus, to: JobStatus): string {
  if (to === "applied") return "Mark applied";
  if (to === "interview") return "Interview";
  if (to === "offer") return "Offer";
  if (to === "rejected") return "Reject";
  if (to === "skipped") return "Skip";
  return to;
}
