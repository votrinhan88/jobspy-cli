"use client";

import { groupByStatus } from "@/lib/kanban";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Job } from "@/lib/csv";
import { isActiveStatus, isTrackedStatus } from "@/lib/status";
import type { StatusLogEntry } from "@/lib/status-log";
import { buildGanttRows } from "@/lib/gantt";
import { latestCrawlAt } from "@/lib/lifecycle";
import { useChangeStatus } from "@/components/use-change-status";
import { JobDialog } from "@/components/job-dialog";
import { GanttView } from "@/app/applications/_components/gantt-view";
import { KanbanView } from "@/app/applications/_components/kanban-view";
import { TableView } from "@/app/applications/_components/table-view";
import { COLUMNS } from "@/app/applications/_components/types";

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const selectedJob = selectedId ? jobs.find((j) => j.job_id === selectedId) ?? null : null;

  function openJob(job: Job, opener: HTMLElement) {
    openerRef.current = opener;
    setSelectedId(job.job_id);
  }

  function closeJob() {
    setSelectedId(null);
    const opener = openerRef.current;
    requestAnimationFrame(() => opener?.focus());
  }

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
  const acceptedCount = tracked.filter((j) => j.status === "accepted").length;
  const rejectedCount = tracked.filter((j) => j.status === "rejected").length;
  const byStatus = groupByStatus(tracked, COLUMNS);

  return (
    <div className="page-content page-content--wide">
      <header className="page-header page-header--row">
        <div>
          <h1 className="page-title">Applications</h1>
          <p className="page-subtitle">
            {loading
              ? ""
              : `${activeCount} active application${activeCount !== 1 ? "s" : ""}, ${acceptedCount} accepted, ${rejectedCount} rejected`}
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
        <KanbanView byStatus={byStatus} pending={pending} onChange={changeStatus} onOpen={openJob} />
      ) : view === "table" ? (
        <TableView jobs={tracked} crawlAt={latestCrawlAt(jobs)} pending={pending} onChange={changeStatus} onOpen={openJob} />
      ) : log ? (
        <GanttView data={buildGanttRows(log.entries, tracked, log.now)} />
      ) : (
        <p className="loading-row">Loading…</p>
      )}
      {selectedJob && (
        <JobDialog
          job={selectedJob}
          busy={pending.has(selectedJob.job_id)}
          onClose={closeJob}
          onChange={changeStatus}
        />
      )}
    </div>
  );
}
