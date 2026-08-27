"use client";

import { useEffect, useRef, useState } from "react";
import type { ScrapeConfig } from "@/lib/config";
import type { ScrapeStatus } from "@/lib/scrape-status";

const SITES: { id: string; label: string; blocked?: string }[] = [
  { id: "linkedin",      label: "LinkedIn" },
  { id: "indeed",        label: "Indeed" },
  { id: "google",        label: "Google Jobs" },
  { id: "zip_recruiter", label: "ZipRecruiter" },
  { id: "glassdoor",     label: "Glassdoor", blocked: "Blocked upstream — HTTP 400 from JobSpy (speedyapply/JobSpy#270)" },
];

function LinesInput({
  label,
  values,
  onChange,
  onFlush,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  onFlush?: () => void;
  placeholder?: string;
}) {
  function handleChange(raw: string) {
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    onChange(lines);
  }

  return (
    <div className="form-field">
      <label className="form-label">{label}</label>
      <textarea
        className="input input--textarea"
        rows={10}
        value={values.join("\n")}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={onFlush}
        placeholder={placeholder ?? "One per line"}
      />
    </div>
  );
}

function StatusBanner({ status }: { status: ScrapeStatus | null }) {
  if (!status || status.status === "idle") return null;

  if (status.status === "running") {
    return (
      <div className="status-banner status-banner--running">
        <span className="spinner" /> Scrape running…
      </div>
    );
  }

  if (status.status === "done") {
    return (
      <div className="status-banner status-banner--done">
        <strong>Done.</strong> {status.new_jobs ?? 0} new &middot;{" "}
        {status.updated_jobs ?? 0} updated &middot; {status.total_jobs ?? 0} total
        {status.finished_at && (
          <span className="status-ts">
            {" "}&mdash; finished {new Date(status.finished_at).toLocaleTimeString()}
          </span>
        )}
      </div>
    );
  }

  if (status.status === "error") {
    return (
      <div className="status-banner status-banner--error">
        <strong>Error:</strong> {status.error ?? "Unknown error"}
      </div>
    );
  }

  return null;
}

export default function ScrapePage() {
  const [config, setConfig] = useState<ScrapeConfig | null>(null);
  const [status, setStatus] = useState<ScrapeStatus | null>(null);
  const [noProfile, setNoProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const configRef = useRef<ScrapeConfig | null>(null);

  useEffect(() => {
    loadAll();
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  async function loadAll() {
    const [cfgRes, stRes] = await Promise.all([
      fetch("/api/scrape/config"),
      fetch("/api/scrape/status"),
    ]);
    if (cfgRes.status === 400 || stRes.status === 400) {
      setNoProfile(true);
      return;
    }
    if (cfgRes.ok) setConfig(await cfgRes.json());
    if (stRes.ok) {
      const st: ScrapeStatus = await stRes.json();
      setStatus(st);
      if (st.status === "running") startPolling();
    }
  }

  function startPolling() {
    if (pollTimer.current) return;
    pollTimer.current = setInterval(async () => {
      const res = await fetch("/api/scrape/status");
      if (!res.ok) return;
      const st: ScrapeStatus = await res.json();
      setStatus(st);
      if (st.status !== "running") {
        clearInterval(pollTimer.current!);
        pollTimer.current = null;
        setRunning(false);
      }
    }, 5000);
  }

  function updateConfig(patch: Partial<ScrapeConfig>) {
    if (!config) return;
    const next = { ...config, ...patch };
    setConfig(next);
    configRef.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveConfig(next), 800);
  }

  function flushConfig() {
    if (!configRef.current) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    saveConfig(configRef.current);
  }

  async function saveConfig(cfg: ScrapeConfig) {
    setSaving(true);
    try {
      await fetch("/api/scrape/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
    } finally {
      setSaving(false);
    }
  }

  async function runScrape() {
    setRunError(null);
    setRunning(true);
    const res = await fetch("/api/scrape/run", { method: "POST" });
    if (!res.ok) {
      const data = await res.json();
      setRunError(data.error ?? "Failed to start scrape");
      setRunning(false);
      return;
    }
    setStatus((s) => ({
      ...(s ?? emptyStatus()),
      status: "running",
      started_at: new Date().toISOString(),
    }));
    startPolling();
  }

  function emptyStatus(): ScrapeStatus {
    return {
      status: "idle",
      started_at: null,
      finished_at: null,
      new_jobs: null,
      updated_jobs: null,
      total_jobs: null,
      error: null,
    };
  }

  if (noProfile) {
    return (
      <div className="page-content">
        <header className="page-header">
          <h1 className="page-title">Scrape</h1>
        </header>
        <div className="empty-card">
          <p className="empty-card-text">No active profile.</p>
          <a href="/profile" className="btn btn-primary">Create a profile</a>
        </div>
      </div>
    );
  }

  if (!config) {
    return <div className="page-content"><p className="loading-row">Loading…</p></div>;
  }

  const isRunning = running || status?.status === "running";

  return (
    <div className="page-content">
      <header className="page-header page-header--row">
        <div>
          <h1 className="page-title">Scrape</h1>
          <p className="page-subtitle">Configure and trigger a job scrape.</p>
        </div>
        <div className="header-actions">
          {saving && <span className="saving-indicator">Saving…</span>}
          <button
            className="btn btn-primary"
            onClick={runScrape}
            disabled={isRunning}
          >
            {isRunning ? "Running…" : "Run scrape"}
          </button>
        </div>
      </header>

      <StatusBanner status={status} />
      {runError && <div className="alert alert-error">{runError}</div>}

      <div className="form-grid">
        <LinesInput
          label="Job titles"
          values={config.job}
          onChange={(v) => updateConfig({ job: v })}
          onFlush={flushConfig}
          placeholder={"AI Engineer\nML Engineer\nData Scientist"}
        />
        <LinesInput
          label="Locations"
          values={config.location}
          onChange={(v) => updateConfig({ location: v })}
          onFlush={flushConfig}
          placeholder={"Australia\nVietnam\nRemote"}
        />

        <div className="form-field">
          <label className="form-label">Results per search</label>
          <input
            className="input input--sm"
            type="number"
            min={1}
            max={100}
            value={config.results_wanted}
            onChange={(e) =>
              updateConfig({ results_wanted: parseInt(e.target.value) || 20 })
            }
          />
        </div>

        <div className="form-field form-field--full">
          <label className="form-label">Job sites</label>
          <div className="checkbox-group">
            {SITES.map((site) => (
              <label
                key={site.id}
                className={`checkbox-label${site.blocked ? " checkbox-label--blocked" : ""}`}
                title={site.blocked}
              >
                <input
                  type="checkbox"
                  checked={config.site_name.includes(site.id)}
                  disabled={!!site.blocked}
                  onChange={(e) => {
                    if (site.blocked) return;
                    const next = e.target.checked
                      ? [...config.site_name, site.id]
                      : config.site_name.filter((s) => s !== site.id);
                    updateConfig({ site_name: next });
                  }}
                />
                {site.label}
                {site.blocked && <span className="blocked-badge">blocked</span>}
              </label>
            ))}
          </div>
        </div>

        <LinesInput
          label="Exclude titles containing"
          values={config.title_exclude}
          onChange={(v) => updateConfig({ title_exclude: v })}
          onFlush={flushConfig}
          placeholder={"Senior\nManager\nDirector"}
        />
        <LinesInput
          label="Exclude companies"
          values={config.exclude_companies}
          onChange={(v) => updateConfig({ exclude_companies: v })}
          onFlush={flushConfig}
          placeholder={"Acme Corp\nRecruitment Agency"}
        />
      </div>
    </div>
  );
}
