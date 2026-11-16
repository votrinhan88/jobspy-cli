import type { GanttData } from "@/lib/gantt";
import { statusLabel } from "@/lib/status";
import { COLUMNS } from "@/app/applications/_components/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const PX_PER_DAY = 22;

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function mondayOnOrBefore(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export function GanttView({ data }: { data: GanttData }) {
  if (data.rows.length === 0 || data.min === null || data.max === null) {
    return (
      <div className="empty-card">
        <p className="empty-card-text">No status history yet.</p>
        <p className="empty-card-sub">
          Shortlist jobs from the <a href="/jobs" className="link">Jobs</a> page. Each status change adds a bar here.
        </p>
      </div>
    );
  }

  const start = mondayOnOrBefore(data.min);
  const end = Math.max(data.max, start + 7 * DAY_MS);
  const width = Math.max(640, Math.ceil(((end - start) / DAY_MS) * PX_PER_DAY));
  const x = (ms: number) => ((ms - start) / (end - start)) * width;
  const ticks: number[] = [];
  for (let t = start; t <= end; t += 7 * DAY_MS) ticks.push(t);

  return (
    <section className="gantt" aria-label="Status history by job">
      <div className="gantt-legend" aria-hidden="true">
        {COLUMNS.map((s) => (
          <span key={s} className="gantt-legend-item">
            <span className={`status-dot status-dot--${s}`} />
            {statusLabel(s)}
          </span>
        ))}
      </div>
      <div className="gantt-scroll">
        <div className="gantt-grid" style={{ ["--gantt-width" as string]: `${width}px` }}>
          <div className="gantt-axis">
            <div className="gantt-label gantt-label--axis">Job</div>
            <div className="gantt-track" aria-hidden="true">
              {ticks.map((t) => (
                <span key={t} className="gantt-tick" style={{ left: x(t) }}>
                  {shortDate(t)}
                </span>
              ))}
            </div>
          </div>
          <ul className="gantt-rows">
            {data.rows.map((row) => (
              <li key={row.job_id} className="gantt-row">
                <div className="gantt-label">
                  <span className="gantt-title">{row.title}</span>
                  <span className="gantt-company">{row.company}</span>
                </div>
                <div className="gantt-track">
                  {ticks.map((t) => (
                    <span key={t} className="gantt-gridline" style={{ left: x(t) }} aria-hidden="true" />
                  ))}
                  {row.segments.map((seg) => {
                    const label = `${statusLabel(seg.status)}, ${shortDate(seg.start)} to ${shortDate(seg.end)}`;
                    return (
                      <span
                        key={`${seg.status}-${seg.start}`}
                        role="img"
                        aria-label={label}
                        title={label}
                        className={`gantt-bar gantt-bar--${seg.status}`}
                        style={{ left: x(seg.start), width: Math.max(3, x(seg.end) - x(seg.start)) }}
                      />
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
