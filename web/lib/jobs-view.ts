import type { Job, JobStatus } from "@/lib/csv";
import { STATUSES, isRemote } from "@/lib/status";

export type SortKey = "posted" | "title" | "company" | "location" | "status";
export type SortDir = "asc" | "desc";

export interface JobFilters {
  query: string;
  statuses: Set<JobStatus>;
  remoteOnly: boolean;
}

export type StatusCounts = Record<JobStatus | "all", number>;

export const DEFAULT_SORT: { key: SortKey; dir: SortDir } = { key: "posted", dir: "desc" };

const FIELD: Record<Exclude<SortKey, "status">, keyof Job> = {
  posted: "date_posted",
  title: "title",
  company: "company",
  location: "location",
};

function sortValue(job: Job, key: SortKey): string | number {
  if (key === "status") return STATUSES.indexOf((job.status ?? "") as JobStatus);
  return (job[FIELD[key]] ?? "").trim().toLowerCase();
}

export function sortJobs(jobs: Job[], key: SortKey, dir: SortDir): Job[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...jobs].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    const emptyA = va === "";
    const emptyB = vb === "";
    if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
    if (va < vb) return -sign;
    if (va > vb) return sign;
    return 0;
  });
}

function matchesQuery(job: Job, words: string[]): boolean {
  if (words.length === 0) return true;
  const text = [job.title, job.company, job.location].join("\n").toLowerCase();
  return words.every((w) => text.includes(w));
}

function queryWords(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function applyQueryAndRemote(jobs: Job[], filters: Pick<JobFilters, "query" | "remoteOnly">): Job[] {
  const words = queryWords(filters.query);
  return jobs.filter((job) => (!filters.remoteOnly || isRemote(job.is_remote)) && matchesQuery(job, words));
}

export function filterJobs(jobs: Job[], filters: JobFilters): Job[] {
  const narrowed = applyQueryAndRemote(jobs, filters);
  if (filters.statuses.size === 0) return narrowed;
  return narrowed.filter((job) => filters.statuses.has((job.status ?? "") as JobStatus));
}

export function statusCounts(
  jobs: Job[],
  filters: Pick<JobFilters, "query" | "remoteOnly"> & Partial<JobFilters> = { query: "", remoteOnly: false }
): StatusCounts {
  const counts = { all: 0 } as StatusCounts;
  for (const s of STATUSES) counts[s] = 0;
  for (const job of applyQueryAndRemote(jobs, filters)) {
    counts.all++;
    const s = (job.status ?? "") as JobStatus;
    if (s in counts) counts[s]++;
  }
  return counts;
}
