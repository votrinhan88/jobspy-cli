"use client";

import { useEffect, useState } from "react";
import type { Job } from "@/lib/csv";

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

function JobDrawer({
  job,
  onClose,
  onShortlist,
  shortlisting,
}: {
  job: Job;
  onClose: () => void;
  onShortlist: (id: string) => void;
  shortlisting: boolean;
}) {
  const salary = formatSalary(job);
  const isRemote = job.is_remote === "True" || job.is_remote === "true" || job.is_remote === "1";

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <a
              href={job.job_url}
              target="_blank"
              rel="noopener noreferrer"
              className="drawer-title-link"
            >
              {job.title || "—"} ↗
            </a>
            <p className="drawer-company">{job.company || "—"}</p>
          </div>
          <button className="icon-btn drawer-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="drawer-body">
          {job.location && (
            <div className="drawer-field">
              <span className="drawer-label">Location</span>
              <span>{job.location}</span>
            </div>
          )}

          <div className="drawer-field">
            <span className="drawer-label">Posted</span>
            <span className="mono">{job.date_posted || "—"}</span>
          </div>

          <div className="drawer-field">
            <span className="drawer-label">Source</span>
            <span className="count-badge">{(job as Record<string,string>)["site"] || "—"}</span>
            {isRemote && <span className="count-badge" style={{ marginLeft: 6 }}>Remote</span>}
          </div>

          {salary && (
            <div className="drawer-field">
              <span className="drawer-label">Salary</span>
              <span className="salary-display">{salary}</span>
            </div>
          )}

          {(job as Record<string,string>)["job_type"] && (
            <div className="drawer-field">
              <span className="drawer-label">Type</span>
              <span>{(job as Record<string,string>)["job_type"]}</span>
            </div>
          )}

          {(job as Record<string,string>)["job_level"] && (
            <div className="drawer-field">
              <span className="drawer-label">Level</span>
              <span>{(job as Record<string,string>)["job_level"]}</span>
            </div>
          )}

          {(job as Record<string,string>)["company_industry"] && (
            <div className="drawer-field">
              <span className="drawer-label">Industry</span>
              <span>{(job as Record<string,string>)["company_industry"]}</span>
            </div>
          )}

          <div className="drawer-actions">
            {(job as Record<string,string>)["job_url_direct"] && (
              <a
                href={(job as Record<string,string>)["job_url_direct"]}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-sm"
              >
                Apply directly ↗
              </a>
            )}
            {!job.status && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => onShortlist(job.job_id)}
                disabled={shortlisting}
              >
                {shortlisting ? "Shortlisting…" : "Shortlist"}
              </button>
            )}
            {job.status && (
              <span className={`status-chip status-chip--${job.status}`}>{job.status}</span>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noProfile, setNoProfile] = useState(false);
  const [filter, setFilter] = useState("");
  const [shortlisting, setShortlisting] = useState<Set<string>>(new Set());
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
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

  async function shortlist(jobId: string) {
    setShortlisting((s) => new Set(s).add(jobId));
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "shortlisted" }),
      });
      if (!res.ok) return;
      const updated: Job = await res.json();
      setJobs((prev) => prev.map((j) => (j.job_id === jobId ? updated : j)));
      if (selectedJob?.job_id === jobId) setSelectedJob(updated);
    } finally {
      setShortlisting((s) => { const n = new Set(s); n.delete(jobId); return n; });
    }
  }

  const query = filter.trim().toLowerCase();
  const visible = query
    ? jobs.filter((j) =>
        j.title?.toLowerCase().includes(query) ||
        j.company?.toLowerCase().includes(query)
      )
    : jobs;

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
          <p className="page-subtitle">
            All scraped postings.{" "}
            {!loading && <span className="count-badge">{visible.length} shown</span>}
          </p>
        </div>
        <div className="header-actions">
          <input
            className="input input--search"
            type="search"
            placeholder="Filter by title or company"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <a href="/api/jobs/export" download="jobs.csv" className="btn btn-secondary btn-sm">
            Export CSV
          </a>
        </div>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading-row">Loading...</div>
      ) : visible.length === 0 ? (
        <p className="empty-state">
          {jobs.length === 0
            ? "No jobs yet. Run a scrape to populate this list."
            : "No jobs match that filter."}
        </p>
      ) : (
        <div className="table-wrap">
          <table className="jobs-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Company</th>
                <th>Location</th>
                <th>Posted</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((job) => (
                <tr
                  key={job.job_id}
                  className={`job-row job-row--${job.status || "none"}${selectedJob?.job_id === job.job_id ? " job-row--selected" : ""}`}
                >
                  <td className="job-title-cell">
                    <button
                      className="job-link"
                      onClick={() => setSelectedJob(job)}
                    >
                      {job.title || "—"}
                    </button>
                  </td>
                  <td>{job.company || "—"}</td>
                  <td className="muted">{job.location || "—"}</td>
                  <td className="muted mono">{job.date_posted || "—"}</td>
                  <td>
                    {job.status ? (
                      <span className={`status-chip status-chip--${job.status}`}>{job.status}</span>
                    ) : (
                      <span className="status-chip status-chip--none">new</span>
                    )}
                  </td>
                  <td className="action-cell">
                    {!job.status && (
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => shortlist(job.job_id)}
                        disabled={shortlisting.has(job.job_id)}
                      >
                        Shortlist
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedJob && (
        <JobDrawer
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onShortlist={shortlist}
          shortlisting={shortlisting.has(selectedJob.job_id)}
        />
      )}
    </div>
  );
}
