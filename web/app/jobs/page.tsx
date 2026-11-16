"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Job, JobStatus } from "@/lib/csv";
import { STATUSES, isRemote, statusLabel } from "@/lib/status";
import {
  DEFAULT_SORT,
  filterJobs,
  formatLocation,
  groupByLocation,
  sortJobs,
  statusCounts,
  type SortDir,
  type SortKey,
} from "@/lib/jobs-view";
import { StatusMenu } from "@/components/status-menu";
import { useChangeStatus } from "@/components/use-change-status";
import { ResumeFit } from "@/app/jobs/_components/resume-fit";
import { LocationGroupRow } from "@/app/jobs/_components/location-group-row";

function formatSalary(job: Job): string | null {
  const min = job.min_amount ? parseFloat(job.min_amount) : null;
  const max = job.max_amount ? parseFloat(job.max_amount) : null;
  if (!min && !max) return null;
  const cur = job.currency || "";
  const iv = job.interval ? ` / ${job.interval}` : "";
  if (min && max) return `${cur} ${min.toLocaleString()} – ${max.toLocaleString()}${iv}`;
  if (min) return `${cur} ${min.toLocaleString()}+${iv}`;
  return `${cur} up to ${max!.toLocaleString()}${iv}`;
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "company", label: "Company" },
  { key: "location", label: "Location" },
  { key: "posted", label: "Posted" },
  { key: "status", label: "Status" },
];

const TABLE_COLUMNS = COLUMNS.length + 2;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function StatusChip({ status }: { status: JobStatus }) {
  return (
    <span className={`status-chip status-chip--${status || "none"}`}>{statusLabel(status)}</span>
  );
}

function TriageButtons({
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
        className="btn btn-sm btn-secondary"
        onClick={() => onChange(job, "shortlisted")}
        disabled={busy}
      >
        Shortlist
      </button>
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        onClick={() => onChange(job, "skipped")}
        disabled={busy}
      >
        Skip
      </button>
    </>
  );
}

function JobDrawer({
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
  const titleId = `drawer-title-${job.job_id}`;
  const salary = formatSalary(job);
  const remote = isRemote(job.is_remote);
  const extra = job as Record<string, string>;

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

function SortIcon({ dir }: { dir: SortDir | null }) {
  return (
    <svg className="sort-icon" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      {dir !== "desc" && <path d="M2.5 4.5L5 2l2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.3" opacity={dir ? 1 : 0.35} />}
      {dir !== "asc" && <path d="M2.5 5.5L5 8l2.5-2.5" fill="none" stroke="currentColor" strokeWidth="1.3" opacity={dir ? 1 : 0.35} />}
    </svg>
  );
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noProfile, setNoProfile] = useState(false);
  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState<Set<JobStatus>>(new Set());
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [groupLocations, setGroupLocations] = useState(false);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const onUpdated = useCallback((updated: Job) => {
    setJobs((prev) => prev.map((j) => (j.job_id === updated.job_id ? updated : j)));
  }, []);
  const { changeStatus, pending } = useChangeStatus(onUpdated);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/jobs");
        if (res.status === 400) { setNoProfile(true); return; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setJobs(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load jobs");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filters = useMemo(() => ({ query, statuses, remoteOnly }), [query, statuses, remoteOnly]);
  const counts = useMemo(() => statusCounts(jobs, filters), [jobs, filters]);
  const visible = useMemo(
    () => sortJobs(filterJobs(jobs, filters), sort.key, sort.dir),
    [jobs, filters, sort]
  );
  const locationGroups = useMemo(
    () => (groupLocations ? groupByLocation(visible) : null),
    [groupLocations, visible]
  );
  const selectedJob = selectedId ? jobs.find((j) => j.job_id === selectedId) ?? null : null;

  function openDrawer(job: Job, opener: HTMLElement) {
    openerRef.current = opener;
    setSelectedId(job.job_id);
  }

  function closeDrawer() {
    setSelectedId(null);
    const opener = openerRef.current;
    requestAnimationFrame(() => opener?.focus());
  }

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "posted" ? "desc" : "asc" }
    );
  }

  function renderJobRow(job: Job) {
    const salary = formatSalary(job);
    return (
      <tr
        key={job.job_id}
        className={`job-row job-row--${job.status || "none"}${selectedId === job.job_id ? " job-row--selected" : ""}`}
      >
        <td className="job-title-cell" data-label="Title">
          <button
            type="button"
            className="job-link"
            onClick={(e) => openDrawer(job, e.currentTarget)}
          >
            {job.title || "—"}
          </button>
        </td>
        <td className="job-company-cell" data-label="Company">{job.company || "—"}</td>
        <td className="muted" data-label="Location">{formatLocation(job) || "—"}</td>
        <td className="muted mono" data-label="Posted">{job.date_posted || "—"}</td>
        <td data-label="Status"><StatusChip status={job.status} /></td>
        <td className="cell-mobile-only salary-display" data-label="Salary">{salary || "—"}</td>
        <td className="action-cell">
          <div className="row-actions row-actions--end">
            <TriageButtons job={job} busy={pending.has(job.job_id)} onChange={changeStatus} />
          </div>
        </td>
      </tr>
    );
  }

  function toggleStatus(status: JobStatus) {
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  if (noProfile) {
    return (
      <div className="page-content">
        <header className="page-header"><h1 className="page-title">Jobs</h1></header>
        <div className="empty-card">
          <p className="empty-card-text">No active profile.</p>
          <a href="/profile" className="btn btn-primary">Create a profile</a>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content page-content--wide">
      <header className="page-header page-header--row">
        <div>
          <h1 className="page-title">Jobs</h1>
          <p className="page-subtitle">All scraped postings.</p>
        </div>
        <div className="header-actions">
          <input
            className="input input--search"
            type="search"
            aria-label="Search jobs"
            placeholder="Title, company or location"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <a href="/api/jobs/export" download="jobs.csv" className="btn btn-secondary btn-sm">
            Export CSV
          </a>
        </div>
      </header>

      {!loading && jobs.length > 0 && (
        <div className="filter-bar">
          <div className="filter-chips" role="group" aria-label="Filter by status">
            <button
              type="button"
              className="filter-chip"
              aria-pressed={statuses.size === 0}
              onClick={() => setStatuses(new Set())}
            >
              All <span className="filter-chip-count">{counts.all}</span>
            </button>
            {STATUSES.map((s) => (
              <button
                key={s || "new"}
                type="button"
                className="filter-chip"
                aria-pressed={statuses.has(s)}
                onClick={() => toggleStatus(s)}
              >
                <span className={`status-dot status-dot--${s || "none"}`} aria-hidden="true" />
                {statusLabel(s)} <span className="filter-chip-count">{counts[s]}</span>
              </button>
            ))}
          </div>
          <div className="filter-bar-end">
            <button
              type="button"
              className="filter-chip"
              aria-pressed={remoteOnly}
              onClick={() => setRemoteOnly((r) => !r)}
            >
              Remote only
            </button>
            <button
              type="button"
              className="filter-chip"
              aria-pressed={groupLocations}
              onClick={() => setGroupLocations((g) => !g)}
            >
              Group by location
            </button>
            <span className="count-badge" aria-live="polite">
              {visible.length} of {jobs.length} jobs
            </span>
          </div>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading-row">Loading...</div>
      ) : visible.length === 0 ? (
        <p className="empty-state">
          {jobs.length === 0
            ? "No jobs yet. Run a scrape to populate this list."
            : "No jobs match these filters."}
        </p>
      ) : (
        <div className="table-wrap table-wrap--cards">
          <table className="jobs-table jobs-table--cards">
            <thead>
              <tr>
                {COLUMNS.map(({ key, label }) => {
                  const active = sort.key === key;
                  return (
                    <th
                      key={key}
                      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <button type="button" className="sort-btn" onClick={() => toggleSort(key)}>
                        {label}
                        <SortIcon dir={active ? sort.dir : null} />
                      </button>
                    </th>
                  );
                })}
                <th className="cell-mobile-only">Salary</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {locationGroups
                ? locationGroups.flatMap((country) => [
                    <LocationGroupRow
                      key={`country:${country.country}`}
                      level="country"
                      label={country.country}
                      count={country.count}
                      colSpan={TABLE_COLUMNS}
                    />,
                    ...country.regions.flatMap((region) => [
                      <LocationGroupRow
                        key={`region:${country.country}|${region.region}`}
                        level="region"
                        label={region.region}
                        count={region.count}
                        colSpan={TABLE_COLUMNS}
                      />,
                      ...region.jobs.map(renderJobRow),
                    ]),
                  ])
                : visible.map(renderJobRow)}
            </tbody>
          </table>
        </div>
      )}

      {selectedJob && (
        <JobDrawer
          job={selectedJob}
          busy={pending.has(selectedJob.job_id)}
          onClose={closeDrawer}
          onChange={changeStatus}
        />
      )}
    </div>
  );
}
