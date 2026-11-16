"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chip } from "@/components/chip";
import type { Job, JobStatus } from "@/lib/csv";
import { STATUSES, isSkippedStatus, statusLabel } from "@/lib/status";
import {
  FACET_FILTERS,
  facetOptions,
  facetValueLabel,
  type FacetKey,
  type FacetSelections,
} from "@/lib/facets";
import { latestCrawlAt } from "@/lib/lifecycle";
import {
  DEFAULT_SORT,
  filterJobs,
  groupByLocation,
  sortJobs,
  statusCounts,
  type SortKey,
} from "@/lib/jobs-view";
import { useChangeStatus } from "@/components/use-change-status";
import { JobDialog, TriageButtons } from "@/components/job-dialog";
import { JobsTable, nextSort } from "@/components/jobs-table";
import { RowActions } from "@/components/job-row-actions";
import { FacetFilter } from "@/app/jobs/_components/facet-filter";

const JOB_STATUSES = STATUSES.filter((status) => !isSkippedStatus(status));

function emptyFacets(): FacetSelections {
  return { country: [], city: [], work_mode: [], seniority: [], employment_type: [] };
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noProfile, setNoProfile] = useState(false);
  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState<Set<JobStatus>>(new Set<JobStatus>([""]));
  const [newOnly, setNewOnly] = useState(false);
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [facets, setFacets] = useState<FacetSelections>(emptyFacets);
  const [groupLocations, setGroupLocations] = useState(false);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const onUpdated = useCallback((updated: Job) => {
    setJobs((prev) => prev.map((j) => (j.job_id === updated.job_id ? updated : j)));
  }, []);
  const { changeStatus, pending } = useChangeStatus(onUpdated);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/jobs");
        if (res.status === 400) { setNoProfile(true); return; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setJobs(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load jobs");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const crawlAt = useMemo(() => latestCrawlAt(jobs), [jobs]);
  const listJobs = useMemo(() => jobs.filter((job) => !isSkippedStatus(job.status)), [jobs]);
  const filters = useMemo(
    () => ({
      query,
      statuses,
      newOnly,
      crawlAt,
      remoteOnly,
      country: facets.country,
      city: facets.city,
      workMode: facets.work_mode,
      seniority: facets.seniority,
      employmentType: facets.employment_type,
    }),
    [query, statuses, newOnly, crawlAt, remoteOnly, facets]
  );
  const facetChoices = useMemo(() => {
    const choices = {} as Record<FacetKey, string[]>;
    for (const { key } of FACET_FILTERS) {
      choices[key] = facetOptions(listJobs, key, key === "city" ? { country: facets.country } : {});
    }
    return choices;
  }, [listJobs, facets]);
  const hasFacetFilters = useMemo(
    () => Object.values(facets).some((values) => values.length > 0),
    [facets]
  );
  const counts = useMemo(() => statusCounts(listJobs, filters), [listJobs, filters]);
  const visible = useMemo(
    () => sortJobs(filterJobs(listJobs, filters), sort.key, sort.dir),
    [listJobs, filters, sort]
  );
  const locationGroups = useMemo(
    () => (groupLocations ? groupByLocation(visible) : null),
    [groupLocations, visible]
  );
  const selectedJob = selectedId ? jobs.find((j) => j.job_id === selectedId) ?? null : null;

  function openDrawer(job: Job, opener: HTMLElement) {
    openerRef.current = opener;
    setSelectedId(job.job_id);
  }

  function closeDrawer() {
    setSelectedId(null);
    const opener = openerRef.current;
    requestAnimationFrame(() => opener?.focus());
  }

  function toggleSort(key: SortKey) {
    setSort((prev) => nextSort(prev, key));
  }

  function toggleStatus(status: JobStatus) {
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  function setFacet(key: FacetKey, values: string[]) {
    setFacets((prev) => {
      const next = { ...prev, [key]: values };
      if (key !== "country") return next;
      const available = facetOptions(listJobs, "city", { country: next.country });
      return { ...next, city: next.city.filter((value) => available.includes(value)) };
    });
  }

  function clearFacets() {
    setFacets(emptyFacets());
  }

  if (noProfile) {
    return (
      <div className="page-content">
        <header className="page-header"><h1 className="page-title">Jobs</h1></header>
        <div className="empty-card">
          <p className="empty-card-text">No active profile.</p>
          <a href="/profile" className="btn btn-primary">Create a profile</a>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content page-content--wide">
      <header className="page-header page-header--row">
        <div>
          <h1 className="page-title">Jobs</h1>
        </div>
        <div className="header-actions">
          <input
            className="input input--search"
            type="search"
            aria-label="Search jobs"
            placeholder="Title, company or location"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <a href="/api/jobs/export" download="jobs.csv" className="btn btn-secondary btn-sm">
            Export CSV
          </a>
        </div>
      </header>

      {!loading && listJobs.length > 0 && (
        <div className="filter-bar">
          <div className="filter-chips" role="group" aria-label="Filter by status">
            <Chip
              pressed={statuses.size === 0 && !newOnly}
              onClick={() => {
                setStatuses(new Set());
                setNewOnly(false);
              }}
            >
              All <span className="filter-chip-count">{counts.all}</span>
            </Chip>
            <Chip pressed={newOnly} onClick={() => setNewOnly((value) => !value)}>
              New <span className="filter-chip-count">{counts.new}</span>
            </Chip>
            {JOB_STATUSES.map((s) => (
              <Chip key={s || "untriaged"} pressed={statuses.has(s)} onClick={() => toggleStatus(s)}>
                <span className={`status-dot status-dot--${s || "none"}`} aria-hidden="true" />
                {statusLabel(s)} <span className="filter-chip-count">{counts[s]}</span>
              </Chip>
            ))}
          </div>
          <div className="filter-bar-end">
            <Chip pressed={remoteOnly} onClick={() => setRemoteOnly((r) => !r)}>
              Remote only
            </Chip>
            <Chip pressed={groupLocations} onClick={() => setGroupLocations((g) => !g)}>
              Group by location
            </Chip>
            <span className="count-badge" aria-live="polite">
              {visible.length} of {listJobs.length} jobs
            </span>
          </div>
        </div>
      )}

      {!loading && listJobs.length > 0 && (
        <div className="facet-bar" role="group" aria-label="Filter by facets">
          {FACET_FILTERS.map(({ key, label }) => (
            <FacetFilter
              key={key}
              label={label}
              options={facetChoices[key]}
              selected={facets[key]}
              valueLabel={(value) => facetValueLabel(key, value)}
              onChange={(values) => setFacet(key, values)}
            />
          ))}
          <button
            type="button"
            className="filter-chip"
            onClick={clearFacets}
            disabled={!hasFacetFilters}
          >
            Clear facets
          </button>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading-row">Loading...</div>
      ) : visible.length === 0 ? (
        <p className="empty-state">
          {jobs.length === 0
            ? "No jobs yet. Run a scrape to populate this list."
            : listJobs.length === 0
              ? "No active jobs. Skipped jobs are in Archived."
              : "No jobs match these filters."}
        </p>
      ) : (
        <JobsTable
          jobs={visible}
          groups={locationGroups}
          sort={sort}
          onSort={toggleSort}
          crawlAt={crawlAt}
          selectedId={selectedId}
          onOpen={openDrawer}
          renderActions={(job) => (
            <>
              <TriageButtons job={job} busy={pending.has(job.job_id)} onChange={changeStatus} />
              {job.status && <RowActions job={job} busy={pending.has(job.job_id)} onChange={changeStatus} />}
            </>
          )}
        />
      )}

      {selectedJob && (
        <JobDialog
          job={selectedJob}
          busy={pending.has(selectedJob.job_id)}
          onClose={closeDrawer}
          onChange={changeStatus}
        />
      )}
    </div>
  );
}
