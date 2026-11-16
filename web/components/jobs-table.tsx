import type { ReactNode } from "react";
import type { Job } from "@/lib/csv";
import { formatLocation, type SortDir, type SortKey, type groupByLocation } from "@/lib/jobs-view";
import { abbreviateRegion } from "@/lib/regions";
import { isClosed, isNew, isStale } from "@/lib/lifecycle";
import { statusLabel } from "@/lib/status";
import { StatusChip, formatSalary } from "@/components/job-dialog";
import { LocationGroupRow } from "@/app/jobs/_components/location-group-row";

export type JobsSort = { key: SortKey; dir: SortDir };

const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "company", label: "Company" },
  { key: "location", label: "Location" },
  { key: "posted", label: "Posted" },
  { key: "status", label: "Status" },
  { key: "salary", label: "Salary" },
];
const TABLE_COLUMNS = SORT_COLUMNS.length + 1;

export function nextSort(previous: JobsSort, key: SortKey): JobsSort {
  if (previous.key === key) return { key, dir: previous.dir === "asc" ? "desc" : "asc" };
  return { key, dir: key === "posted" || key === "salary" ? "desc" : "asc" };
}

function SortIcon({ dir }: { dir: SortDir | null }) {
  return (
    <svg className="sort-icon" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      {dir !== "desc" && <path d="M2.5 4.5L5 2l2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.3" opacity={dir ? 1 : 0.35} />}
      {dir !== "asc" && <path d="M2.5 5.5L5 8l2.5-2.5" fill="none" stroke="currentColor" strokeWidth="1.3" opacity={dir ? 1 : 0.35} />}
    </svg>
  );
}

function SortHeader({
  label,
  sortKey,
  active,
  dir,
  onToggle,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: SortDir | null;
  onToggle: (key: SortKey) => void;
}) {
  return (
    <th aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="sort-btn" onClick={() => onToggle(sortKey)}>
        {label}
        <SortIcon dir={active ? dir : null} />
      </button>
    </th>
  );
}

function JobRow({
  job,
  crawlAt,
  selected,
  onOpen,
  actions,
}: {
  job: Job;
  crawlAt: number | null;
  selected: boolean;
  onOpen: (job: Job, opener: HTMLElement) => void;
  actions: ReactNode;
}) {
  const salary = formatSalary(job);
  const closed = isClosed(job.closed_at);
  const stale = !closed && isStale(job.last_seen_at);
  return (
    <tr className={`job-row job-row--${job.status || "none"}${selected ? " job-row--selected" : ""}`}>
      <td className="job-title-cell" data-label="Title">
        <button type="button" className="job-link" onClick={(e) => onOpen(job, e.currentTarget)}>
          {job.title || "—"}
        </button>
      </td>
      <td className="job-company-cell" data-label="Company">{job.company || "—"}</td>
      <td className="muted" data-label="Location">{formatLocation(job) || "—"}</td>
      <td className="muted mono" data-label="Posted">{job.date_posted || "—"}</td>
      <td data-label="Status">
        {job.status ? <StatusChip status={job.status} /> : <span className="sr-only">{statusLabel("")}</span>}
        {isNew(job.first_seen_at, crawlAt) && <span className="lifecycle-badge lifecycle-badge--new">NEW</span>}
        {closed ? (
          <span className="lifecycle-badge lifecycle-badge--closed">Closed</span>
        ) : stale ? (
          <span className="lifecycle-badge lifecycle-badge--stale">Stale</span>
        ) : null}
      </td>
      <td className="salary-display" data-label="Salary">{salary || "—"}</td>
      <td className="action-cell">
        <div className="row-actions row-actions--end">{actions}</div>
      </td>
    </tr>
  );
}

export function JobsTable({
  jobs,
  groups,
  sort,
  onSort,
  crawlAt,
  selectedId,
  onOpen,
  renderActions,
}: {
  jobs: Job[];
  groups: ReturnType<typeof groupByLocation> | null;
  sort: JobsSort;
  onSort: (key: SortKey) => void;
  crawlAt: number | null;
  selectedId: string | null;
  onOpen: (job: Job, opener: HTMLElement) => void;
  renderActions: (job: Job) => ReactNode;
}) {
  const row = (job: Job) => (
    <JobRow
      key={job.job_id}
      job={job}
      crawlAt={crawlAt}
      selected={selectedId === job.job_id}
      onOpen={onOpen}
      actions={renderActions(job)}
    />
  );
  return (
    <div className="table-wrap table-wrap--cards">
      <table className="jobs-table jobs-table--cards">
        <thead>
          <tr>
            {SORT_COLUMNS.map(({ key, label }) => (
              <SortHeader
                key={key}
                sortKey={key}
                label={label}
                active={sort.key === key}
                dir={sort.dir}
                onToggle={onSort}
              />
            ))}
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {groups
            ? groups.flatMap((country) => [
                <LocationGroupRow
                  key={`country:${country.country}`}
                  level="country"
                  label={country.country}
                  count={country.count}
                  colSpan={TABLE_COLUMNS}
                />,
                ...country.regions.flatMap((region) => [
                  <LocationGroupRow
                    key={`region:${country.country}|${region.region}`}
                    level="region"
                    label={abbreviateRegion(region.region, country.country)}
                    count={region.count}
                    colSpan={TABLE_COLUMNS}
                  />,
                  ...region.jobs.map(row),
                ]),
              ])
            : jobs.map(row)}
        </tbody>
      </table>
    </div>
  );
}
