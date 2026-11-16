import { useEffect, useRef } from "react";
import type { ScrapeStatus } from "@/lib/scrape-status";

export function StatusBanner({ status }: { status: ScrapeStatus | null }) {
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
        <strong>Done.</strong> {status.new_jobs ?? 0} new &middot; {status.total_jobs ?? 0} total
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

export function ScrapeProgress({ log, isRunning }: { log: string; isRunning: boolean }) {
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

export function LogSpoiler({ log, isRunning }: { log: string; isRunning: boolean }) {
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
