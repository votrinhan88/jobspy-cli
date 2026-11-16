"use client";

import { useEffect, useMemo, useState } from "react";
import type { Job } from "@/lib/csv";
import {
  computeStatistics,
  STATUS_ORDER,
  type Statistics,
} from "@/lib/statistics";

export default function StatisticsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noProfile, setNoProfile] = useState(false);

  useEffect(() => {
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
        setError(e instanceof Error ? e.message : "Failed to load statistics");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const stats: Statistics = useMemo(() => computeStatistics(jobs), [jobs]);

  if (noProfile) {
    return (
      <div className="page-content">
        <header className="page-header">
          <h1 className="page-title">Statistics</h1>
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
      <header className="page-header">
        <h1 className="page-title">Statistics</h1>
        <p className="page-subtitle">
          Application pipeline stats and timeline for the active profile.
        </p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <p className="loading-row">Loading…</p>
      ) : jobs.length === 0 ? (
        <div className="empty-card">
          <p className="empty-card-text">No data yet.</p>
          <p className="empty-card-sub">
            Run a scrape to populate this list.
          </p>
        </div>
      ) : (
        <>
          <SummaryCards stats={stats} />
          <section className="section">
            <h2 className="section-title">Pipeline</h2>
            <PipelineFunnel stats={stats} />
          </section>
          <section className="section">
            <h2 className="section-title">Timeline</h2>
            <Timeline stats={stats} />
          </section>
          <section className="section">
            <h2 className="section-title">Breakdown</h2>
            <div className="breakdown-grid">
              <TopList
                title="Top companies"
                items={stats.topCompanies}
                empty="No companies recorded."
              />
              <TopList
                title="Top locations"
                items={stats.topLocations}
                empty="No locations recorded."
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function SummaryCards({ stats }: { stats: Statistics }) {
  const cards = [
    { label: "Total jobs", value: stats.total, tone: "neutral" },
    { label: "Active", value: stats.active, tone: "accent" },
    { label: "Remote", value: stats.remote, tone: "offer" },
    { label: "Archived", value: stats.archived, tone: "rejected" },
  ];
  return (
    <div className="stat-grid">
      {cards.map((c) => (
        <div key={c.label} className={`stat-card stat-card--${c.tone}`}>
          <div className="stat-value">{c.value}</div>
          <div className="stat-label">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

function PipelineFunnel({ stats }: { stats: Statistics }) {
  const max = Math.max(1, ...stats.perStatus.map((s) => s.count));
  return (
    <div className="funnel">
      {STATUS_ORDER.map((status) => {
        const entry = stats.perStatus.find((s) => s.status === status)!;
        return (
          <div key={status} className="funnel-row">
            <span className={`status-chip status-chip--${status}`}>
              {status}
            </span>
            <div className="funnel-track">
              <div
                className={`funnel-bar funnel-bar--${status}`}
                style={{ width: `${(entry.count / max) * 100}%` }}
              />
            </div>
            <span className="funnel-count">{entry.count}</span>
          </div>
        );
      })}
    </div>
  );
}

function Timeline({ stats }: { stats: Statistics }) {
  if (stats.timeline.length === 0) {
    return <p className="empty-state">No status changes recorded yet.</p>;
  }
  const max = Math.max(1, ...stats.timeline.map((t) => t.count));
  return (
    <div className="timeline">
      {stats.timeline.map((point) => (
        <div key={point.label} className="timeline-row">
          <span className="timeline-label">{point.label}</span>
          <div className="timeline-track">
            <div
              className="timeline-bar"
              style={{ width: `${(point.count / max) * 100}%` }}
            />
          </div>
          <span className="timeline-count">{point.count}</span>
        </div>
      ))}
    </div>
  );
}

function TopList({
  title,
  items,
  empty,
}: {
  title: string;
  items: { name: string; count: number }[];
  empty: string;
}) {
  return (
    <div className="top-card">
      <h3 className="top-title">{title}</h3>
      {items.length === 0 ? (
        <p className="empty-state">{empty}</p>
      ) : (
        <ol className="top-list">
          {items.map((item) => (
            <li key={item.name} className="top-item">
              <span className="top-name" title={item.name}>
                {item.name}
              </span>
              <span className="top-count">{item.count}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
