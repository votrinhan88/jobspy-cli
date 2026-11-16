"use client";

import { useEffect, useRef } from "react";
import type { Job, JobStatus } from "@/lib/csv";
import { isRemote, statusLabel } from "@/lib/status";
import { formatLastSeen, isClosed, isStale } from "@/lib/lifecycle";
import { firstSeenDays, isReposted } from "@/lib/posting-signals";
import { formatLocation } from "@/lib/jobs-view";
import { StatusMenu } from "@/components/status-menu";
import { ResumeFit } from "@/app/jobs/_components/resume-fit";

export function formatSalary(job: Job): string | null {
  const min = job.min_amount ? parseFloat(job.min_amount) : null;
  const max = job.max_amount ? parseFloat(job.max_amount) : null;
  if (!min && !max) return null;
  const cur = job.currency || "";
  const iv = job.interval ? ` / ${job.interval}` : "";
  if (min && max) return `${cur} ${min.toLocaleString()} – ${max.toLocaleString()}${iv}`;
  if (min) return `${cur} ${min.toLocaleString()}+${iv}`;
  return `${cur} up to ${max!.toLocaleString()}${iv}`;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function StatusChip({ status }: { status: JobStatus }) {
  return (
    <span className={`status-chip status-chip--${status || "none"}`}>{statusLabel(status)}</span>
  );
}

export function TriageButtons({
  job,
  busy,
  onChange,
}: {
  job: Job;
  busy: boolean;
  onChange: (job: Job, next: JobStatus) => void;
}) {
  if (job.status) return null;
  return (
    <>
      <button
        type="button"
        className="btn btn-sm row-action-btn status-chip--shortlisted"
        onClick={() => onChange(job, "shortlisted")}
        disabled={busy}
      >
        Shortlist
      </button>
      <button
        type="button"
        className="btn btn-sm row-action-btn status-chip--skipped"
        onClick={() => onChange(job, "skipped")}
        disabled={busy}
      >
        Skip
      </button>
    </>
  );
}

export function JobDialog({
  job,
  busy,
  onClose,
  onChange,
}: {
  job: Job;
  busy: boolean;
  onClose: () => void;
  onChange: (job: Job, next: JobStatus) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = `job-dialog-title-${job.job_id}`;
  const salary = formatSalary(job);
  const remote = isRemote(job.is_remote);
  const extra = job as Record<string, string>;
  const ageDays = firstSeenDays(job.first_seen_at);
  const reposted = isReposted(job.first_seen_at, job.date_posted);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !dialogRef.current) return;
    const nodes = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (n) => n.offsetParent !== null || n === document.activeElement
    );
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <div className="drawer-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id={titleId} className="drawer-title">
              <a href={job.job_url} target="_blank" rel="noopener noreferrer" className="drawer-title-link">
                {job.title || "—"}
                <span className="sr-only"> (opens in a new tab)</span>
                <svg className="drawer-title-icon" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M4.5 2.5h5v5M9.5 2.5l-7 7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </a>
            </h2>
            <p className="drawer-company">{job.company || "—"}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="icon-btn drawer-close"
            onClick={onClose}
            aria-label="Close job details"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="drawer-body">
          <div className="drawer-field">
            <span className="drawer-label">Status</span>
            <StatusChip status={job.status} />
          </div>

          {job.location && (
            <div className="drawer-field">
              <span className="drawer-label">Location</span>
              <span>{formatLocation(job)}</span>
            </div>
          )}

          <div className="drawer-field">
            <span className="drawer-label">Posted</span>
            <span className="mono">{job.date_posted || "—"}</span>
          </div>

          <div className="drawer-field">
            <span className="drawer-label">First seen</span>
            <span className="mono">{formatLastSeen(job.first_seen_at)}</span>
            {ageDays !== null && (
              <span className="muted">
                {ageDays === 1 ? "1 day ago" : `${ageDays} days ago`}
              </span>
            )}
          </div>

          {reposted && (
            <div className="drawer-field">
              <span className="drawer-label">Board date</span>
              <span>Later than the first sighting</span>
            </div>
          )}

          <div className="drawer-field">
            <span className="drawer-label">Last seen</span>
            <span className="mono">{formatLastSeen(job.last_seen_at)}</span>
            {isClosed(job.closed_at) ? (
              <span className="lifecycle-badge lifecycle-badge--closed">Closed</span>
            ) : isStale(job.last_seen_at) ? (
              <span className="lifecycle-badge lifecycle-badge--stale">Stale</span>
            ) : null}
          </div>

          {isClosed(job.closed_at) && (
            <div className="drawer-field">
              <span className="drawer-label">Closed</span>
              <span className="mono">
                {formatLastSeen(job.closed_at)}
                {job.closed_reason ? ` · ${job.closed_reason}` : ""}
              </span>
            </div>
          )}

          <div className="drawer-field">
            <span className="drawer-label">Source</span>
            <span className="count-badge">{extra["site"] || "—"}</span>
            {remote && <span className="count-badge" style={{ marginLeft: 6 }}>Remote</span>}
          </div>

          {salary && (
            <div className="drawer-field">
              <span className="drawer-label">Salary</span>
              <span className="salary-display">{salary}</span>
            </div>
          )}

          {extra["job_type"] && (
            <div className="drawer-field">
              <span className="drawer-label">Type</span>
              <span>{extra["job_type"]}</span>
            </div>
          )}

          {extra["job_level"] && (
            <div className="drawer-field">
              <span className="drawer-label">Level</span>
              <span>{extra["job_level"]}</span>
            </div>
          )}

          {extra["company_industry"] && (
            <div className="drawer-field">
              <span className="drawer-label">Industry</span>
              <span>{extra["company_industry"]}</span>
            </div>
          )}

          <ResumeFit jobId={job.job_id} key={job.job_id} />

          <div className="drawer-actions">
            {extra["job_url_direct"] && (
              <a
                href={extra["job_url_direct"]}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-sm"
              >
                Apply directly
              </a>
            )}
            <TriageButtons job={job} busy={busy} onChange={onChange} />
            <StatusMenu
              current={job.status}
              jobTitle={job.title || "job"}
              disabled={busy}
              onSelect={(s) => onChange(job, s)}
            />
          </div>
        </div>
      </div>
    </>
  );
}
