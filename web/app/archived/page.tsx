"use client";

import { useCallback, useEffect, useState } from "react";
import type { Job } from "@/lib/csv";
import { formatLocation } from "@/lib/jobs-view";
import { isSkippedStatus } from "@/lib/status";
import { useChangeStatus } from "@/components/use-change-status";

export default function ArchivedPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [noProfile, setNoProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onUpdated = useCallback((updated: Job) => {
    setJobs((prev) => prev.map((job) => (job.job_id === updated.job_id ? updated : job)));
  }, []);
  const { changeStatus, pending } = useChangeStatus(onUpdated);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/jobs");
        if (res.status === 400) {
          setNoProfile(true);
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setJobs(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load archived jobs");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const archived = jobs
    .filter((job) => isSkippedStatus(job.status))
    .sort(
      (a, b) =>
        (b.status_updated_at || "").localeCompare(a.status_updated_at || "") ||
        (a.title || "").localeCompare(b.title || "")
    );

  if (noProfile) {
    return (
      <div className="page-content">
        <header className="page-header"><h1 className="page-title">Archived</h1></header>
        <div className="empty-card">
          <p className="empty-card-text">No active profile.</p>
          <a href="/profile" className="btn btn-primary">Create a profile</a>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content page-content--wide">
      <header className="page-header">
        <h1 className="page-title">Archived</h1>
        <p className="page-subtitle">Skipped jobs. They do not appear on Jobs or Applications.</p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <p className="loading-row">Loading...</p>
      ) : archived.length === 0 ? (
        <div className="empty-card">
          <p className="empty-card-text">No archived jobs.</p>
          <p className="empty-card-sub">Use Skip on the Jobs page to move a job here.</p>
        </div>
      ) : (
        <div className="table-wrap table-wrap--cards">
          <table className="jobs-table jobs-table--cards">
            <thead>
              <tr>
                <th>Title</th>
                <th>Company</th>
                <th>Location</th>
                <th>Skipped</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {archived.map((job) => {
                const title = job.title || "job";
                return (
                  <tr key={job.job_id} className="job-row job-row--skipped">
                    <td className="job-title-cell" data-label="Title">
                      {job.job_url ? (
                        <a href={job.job_url} target="_blank" rel="noopener noreferrer" className="link">
                          {title}
                        </a>
                      ) : (
                        title
                      )}
                    </td>
                    <td className="job-company-cell" data-label="Company">{job.company || "—"}</td>
                    <td className="muted" data-label="Location">{formatLocation(job) || "—"}</td>
                    <td className="muted mono" data-label="Skipped">
                      {job.status_updated_at ? job.status_updated_at.slice(0, 10) : "—"}
                    </td>
                    <td className="action-cell">
                      <div className="row-actions row-actions--end">
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          aria-label={`Restore ${title}`}
                          disabled={pending.has(job.job_id)}
                          onClick={() => changeStatus(job, "")}
                        >
                          Restore
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
