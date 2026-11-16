import type { Job, JobStatus } from "@/lib/csv";
import { STATUSES, isRemote } from "@/lib/status";

export type SortKey = "posted" | "title" | "company" | "location" | "status";
export type SortDir = "asc" | "desc";

export interface JobFilters {
  query: string;
  statuses: Set<JobStatus>;
  remoteOnly: boolean;
  country?: string;
  city?: string;
  workMode?: string;
  seniority?: string;
  employmentType?: string;
}

export type StatusCounts = Record<JobStatus | "all", number>;

export interface LocationParts {
  country: string;
  region: string;
  city: string;
}

export interface RegionGroup {
  region: string;
  count: number;
  jobs: Job[];
}

export interface CountryGroup {
  country: string;
  count: number;
  regions: RegionGroup[];
}

export const DEFAULT_SORT: { key: SortKey; dir: SortDir } = { key: "posted", dir: "desc" };

const FIELD: Record<"posted" | "title" | "company", keyof Job> = {
  posted: "date_posted",
  title: "title",
  company: "company",
};

function sortValue(job: Job, key: keyof typeof FIELD | "status"): string | number {
  if (key === "status") return STATUSES.indexOf((job.status ?? "") as JobStatus);
  return (job[FIELD[key]] ?? "").trim().toLowerCase();
}

export function splitLocation(job: Job): LocationParts {
  const parts = (job.location ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    country: parts.length > 0 ? parts[parts.length - 1] : "",
    region: (job.region ?? "").trim(),
    city: parts.length >= 2 ? parts[0] : "",
  };
}

// Display only: the stored location stays "City, Country" because upsert never rewrites it.
// The order is widest place first, the same as the tiers of the Location sort and the group headers.
export function formatLocation(job: Job): string {
  const parts = (job.location ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return "";
  const region = (job.region ?? "").trim();
  const lowerRegion = region.toLowerCase();
  // A place part inside the region name counts as a repeat, as in "Hà Nội" and "Thành phố Hà Nội".
  // The country must match exactly, because "Australian Capital Territory" contains "Australia".
  const country = parts[parts.length - 1].toLowerCase();
  const repeated =
    lowerRegion === country || parts.slice(0, -1).some((part) => lowerRegion.includes(part.toLowerCase()));
  if (region && !repeated) {
    parts.splice(parts.length - 1, 0, region);
  }
  return parts.reverse().join(", ");
}

function compareTier(a: string, b: string, sign: number): number {
  const emptyA = a === "";
  const emptyB = b === "";
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
  return sign * a.toLowerCase().localeCompare(b.toLowerCase());
}

function compareLocation(a: Job, b: Job, sign: number): number {
  const pa = splitLocation(a);
  const pb = splitLocation(b);
  for (const tier of ["country", "region", "city"] as const) {
    const cmp = compareTier(pa[tier], pb[tier], sign);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

export function sortJobs(jobs: Job[], key: SortKey, dir: SortDir): Job[] {
  const sign = dir === "asc" ? 1 : -1;
  if (key === "location") return [...jobs].sort((a, b) => compareLocation(a, b, sign));
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

export function groupByLocation(jobs: Job[]): CountryGroup[] {
  const countries = new Map<string, { country: string; count: number; regions: Map<string, RegionGroup> }>();
  for (const job of jobs) {
    const { country, region } = splitLocation(job);
    const countryKey = country.toLowerCase();
    let countryGroup = countries.get(countryKey);
    if (!countryGroup) {
      countryGroup = { country, count: 0, regions: new Map() };
      countries.set(countryKey, countryGroup);
    }
    countryGroup.count++;
    const regionKey = region.toLowerCase();
    let regionGroup = countryGroup.regions.get(regionKey);
    if (!regionGroup) {
      regionGroup = { region, count: 0, jobs: [] };
      countryGroup.regions.set(regionKey, regionGroup);
    }
    regionGroup.count++;
    regionGroup.jobs.push(job);
  }
  return [...countries.values()]
    .sort((a, b) => compareTier(a.country, b.country, 1))
    .map((country) => ({
      country: country.country,
      count: country.count,
      regions: [...country.regions.values()].sort((a, b) => compareTier(a.region, b.region, 1)),
    }));
}

function matchesQuery(job: Job, words: string[]): boolean {
  if (words.length === 0) return true;
  const text = [job.title, job.company, job.location, job.region ?? ""].join("\n").toLowerCase();
  return words.every((w) => text.includes(w));
}

function queryWords(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function matchesFacets(job: Job, filters: Partial<JobFilters>): boolean {
  const pairs: [string | undefined, string][] = [
    [filters.country, job.country],
    [filters.city, job.city],
    [filters.workMode, job.work_mode],
    [filters.seniority, job.seniority],
    [filters.employmentType, job.employment_type],
  ];
  return pairs.every(([wanted, value]) => {
    const text = (wanted ?? "").trim();
    return text === "" || (value ?? "").trim() === text;
  });
}

function applyBaseFilters(
  jobs: Job[],
  filters: Pick<JobFilters, "query" | "remoteOnly"> & Partial<JobFilters>
): Job[] {
  const words = queryWords(filters.query);
  return jobs
    .filter((job) => (!filters.remoteOnly || isRemote(job.is_remote)) && matchesQuery(job, words))
    .filter((job) => matchesFacets(job, filters));
}

export function filterJobs(jobs: Job[], filters: JobFilters): Job[] {
  const narrowed = applyBaseFilters(jobs, filters);
  if (filters.statuses.size === 0) return narrowed;
  return narrowed.filter((job) => filters.statuses.has((job.status ?? "") as JobStatus));
}

export function statusCounts(
  jobs: Job[],
  filters: Pick<JobFilters, "query" | "remoteOnly"> & Partial<JobFilters> = { query: "", remoteOnly: false }
): StatusCounts {
  const counts = { all: 0 } as StatusCounts;
  for (const s of STATUSES) counts[s] = 0;
  for (const job of applyBaseFilters(jobs, filters)) {
    counts.all++;
    const s = (job.status ?? "") as JobStatus;
    if (s in counts) counts[s]++;
  }
  return counts;
}
