"use client";

import { useEffect, useState, useTransition } from "react";
import type { Job } from "@/lib/csv";

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noProfile, setNoProfile] = useState(false);
  const [filter, setFilter] = useState("");
  const [shortlisting, setShortlisting] = useState<Set<string>>(new Set());

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs");
      if (res.status === 400) {
        setNoProfile(true);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Job[] = await res.json();
      setJobs(data);
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
    } finally {
      setShortlisting((s) => {
        const next = new Set(s);
        next.delete(jobId);
        return next;
      });
    }
  }

  const query = filter.trim().toLowerCase();
  const visible = query
    ? jobs.filter(
        (j) =>
          j.title?.toLowerCase().includes(query) ||
          j.company?.toLowerCase().includes(query)
      )
    : jobs;

  if (noProfile) {
    return (
      <div className="page-content">
        <header className="page-header">
          <h1 className="page-title">Jobs</h1>
        </header>
        <div className="empty-card">
          <p className="empty-card-text">No active profile.</p>
          <a href="/profile" className="btn btn-primary">
            Create a profile
          </a>
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
            {!loading && (
              <span className="count-badge">{visible.length} shown</span>
            )}
          </p>
        </div>
        <input
          className="input input--search"
          type="search"
          placeholder="Filter by title or company"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
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
                <tr key={job.job_id} className={`job-row job-row--${job.status || "none"}`}>
                  <td className="job-title-cell">
                    <a
                      href={job.job_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="job-link"
                    >
                      {job.title || "—"}
                    </a>
                  </td>
                  <td>{job.company || "—"}</td>
                  <td className="muted">{job.location || "—"}</td>
                  <td className="muted mono">{job.date_posted || "—"}</td>
                  <td>
                    {job.status ? (
                      <span className={`status-chip status-chip--${job.status}`}>
                        {job.status}
                      </span>
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
    </div>
  );
}
