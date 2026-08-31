"use client";

import { useEffect, useRef, useState } from "react";
import type { ScrapeConfig } from "@/lib/config";
import type { ScrapeStatus } from "@/lib/scrape-status";

function formatDuration(started: string | null, finished: string | null): string {
  if (!started || !finished) return "—";
  const ms = new Date(finished).getTime() - new Date(started).getTime();
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function RunHistory() {
  const [history, setHistory] = useState<ScrapeStatus[]>([]);

  useEffect(() => {
    fetch("/api/scrape/history")
      .then((r) => r.ok ? r.json() : [])
      .then(setHistory)
      .catch(() => {});
  }, []);

  if (history.length === 0) return null;

  return (
    <details className="log-spoiler" style={{ marginTop: 32 }}>
      <summary>
        <span className="log-chevron">&#9658;</span>
        Run history
        <span className="muted" style={{ marginLeft: 8, fontWeight: 400 }}>
          ({history.length} runs)
        </span>
      </summary>
      <div style={{ overflowX: "auto" }}>
        <table className="history-table">
          <thead>
            <tr>
              <th>Started</th>
              <th>Duration</th>
              <th>New</th>
              <th>Total</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {history.map((run, i) => (
              <tr key={i}>
                <td className="mono history-ts">
                  {run.started_at ? new Date(run.started_at).toLocaleString() : "—"}
                </td>
                <td className="history-duration">
                  {formatDuration(run.started_at, run.finished_at)}
                </td>
                <td className="mono">{run.new_jobs ?? "—"}</td>
                <td className="mono">{run.total_jobs ?? "—"}</td>
                <td>
                  <span className={`status-chip status-chip--${run.status === "done" ? "offer" : run.status === "error" ? "rejected" : "none"}`}>
                    {run.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

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

function parseProgress(log: string): { current: number; total: number } | null {
  const matches = [...log.matchAll(/\[(\d+)\/(\d+)\]/g)];
  if (!matches.length) return null;
  const last = matches[matches.length - 1];
  return { current: parseInt(last[1]), total: parseInt(last[2]) };
}

function ScrapeProgress({ log, isRunning }: { log: string; isRunning: boolean }) {
  const progress = parseProgress(log);
  if (!progress && !isRunning) return null;

  const pct = progress ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="scrape-progress">
      <div className="scrape-progress-bar-wrap">
        <div
          className="scrape-progress-bar"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="scrape-progress-label">
        {progress ? `${progress.current} / ${progress.total} pairs` : "Starting…"}
      </span>
    </div>
  );
}

function LogSpoiler({ log, isRunning }: { log: string; isRunning: boolean }) {
  const logRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  return (
    <details className="log-spoiler">
      <summary>
        <span className="log-chevron">&#9658;</span>
        Show log
        {isRunning && <span className="spinner" style={{ marginLeft: 6 }} />}
      </summary>
      <div className="log-body">
        <pre className="log-pre" ref={logRef}>
          {log || "(no output yet)"}
        </pre>
      </div>
    </details>
  );
}

export default function ScrapePage() {
  const [config, setConfig] = useState<ScrapeConfig | null>(null);
  const [status, setStatus] = useState<ScrapeStatus | null>(null);
  const [noProfile, setNoProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [log, setLog] = useState("");
  const [importNotif, setImportNotif] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const logPollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const configRef = useRef<ScrapeConfig | null>(null);

  useEffect(() => {
    loadAll();
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      if (logPollTimer.current) clearInterval(logPollTimer.current);
    };
  }, []);

  async function fetchLog() {
    const res = await fetch("/api/scrape/log");
    if (res.ok) setLog(await res.text());
  }

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
    fetchLog();
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
        stopLogPolling();
        setRunning(false);
        fetchLog();
      }
    }, 5000);

    if (logPollTimer.current) return;
    logPollTimer.current = setInterval(fetchLog, 1000);
  }

  function stopLogPolling() {
    if (logPollTimer.current) {
      clearInterval(logPollTimer.current);
      logPollTimer.current = null;
    }
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

  async function importKeywords() {
    const res = await fetch("/api/keywords");
    if (!res.ok) return;
    const { keywords } = await res.json();
    updateConfig({ job: keywords });
    flushConfig();
    setImportNotif(`${keywords.length} keywords imported`);
    setTimeout(() => setImportNotif(null), 3000);
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
      {isRunning && <ScrapeProgress log={log} isRunning={isRunning} />}

      <LogSpoiler log={log} isRunning={isRunning} />

      <div className="form-grid">
        <div className="form-field">
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <label className="form-label">Job titles</label>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              style={{ fontSize: 11, padding: "2px 8px" }}
              onClick={importKeywords}
            >
              Import from keywords.txt
            </button>
            {importNotif && <span className="saving-indicator">{importNotif}</span>}
          </div>
          <textarea
            className="input input--textarea"
            rows={10}
            value={config.job.join("\n")}
            onChange={(e) => updateConfig({ job: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean) })}
            onBlur={flushConfig}
            placeholder={"AI Engineer\nML Engineer\nData Scientist"}
          />
        </div>
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

      <RunHistory />
    </div>
  );
}
