import { useEffect, useState } from "react";
import type { ScrapeStatus } from "@/lib/scrape-status";

function formatDuration(started: string | null, finished: string | null): string {
  if (!started || !finished) return "—";
  const ms = new Date(finished).getTime() - new Date(started).getTime();
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export function RunHistory() {
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
