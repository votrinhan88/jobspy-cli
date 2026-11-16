import type { SourceRunStatus } from "@/lib/scrape-status";

const SITE_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  indeed: "Indeed",
  google: "Google Jobs",
  zip_recruiter: "ZipRecruiter",
  glassdoor: "Glassdoor",
};

function siteLabel(site: string): string {
  return SITE_LABELS[site] ?? site;
}

function statusLabel(run: SourceRunStatus): string {
  if (run.attempts === 0 && run.skipped > 0) return "Skipped";
  if (run.failed === 0) return "OK";
  if (run.failed === run.attempts) return "Failed";
  return "Partial";
}

function formatDuration(ms: number): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function SourceRunsTable({ runs }: { runs: SourceRunStatus[] }) {
  if (runs.length === 0) return null;

  return (
    <section style={{ marginTop: 24 }}>
      <div style={{ overflowX: "auto" }}>
        <table className="history-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Status</th>
              <th>Jobs</th>
              <th>Duration</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.site}>
                <td>{siteLabel(run.site)}</td>
                <td>{statusLabel(run)}</td>
                <td className="mono">{run.jobs}</td>
                <td className="mono">{formatDuration(run.duration_ms)}</td>
                <td
                  title={run.error ?? undefined}
                  style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {run.error ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
