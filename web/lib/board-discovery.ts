import type { Job } from "@/lib/csv";

export interface DiscoveredBoard {
  entry: string;
  name: string;
  jobs: number;
}

const URL_COLUMNS = ["job_url_direct", "job_url", "company_url_direct", "company_url"];
const BOARD_NAME = /^[A-Za-z0-9_-]+$/;
const LOCALE = /^[a-z]{2}-[A-Za-z]{2}$/;
// Board names that look like a company but are page paths of the ATS.
const RESERVED = new Set(["embed"]);

function parseUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

// The result passes the same rules as the Company boards field, so it can be added as it is.
export function extractBoard(value: string | undefined): string | null {
  const url = parseUrl(value);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);

  const simple = (provider: string): string | null => {
    const board = segments[0];
    if (!board || !BOARD_NAME.test(board) || RESERVED.has(board.toLowerCase())) return null;
    return `${provider}:${board}`;
  };

  if (/^(?:job-)?boards(?:\.eu)?\.greenhouse\.io$/.test(host)) return simple("greenhouse");
  if (/^jobs(?:\.eu)?\.lever\.co$/.test(host)) return simple("lever");
  if (host === "jobs.ashbyhq.com") return simple("ashby");

  const workday = host.match(/^([a-z0-9_-]+)\.(wd\d+)\.myworkdayjobs\.com$/);
  if (workday) {
    const site = LOCALE.test(segments[0] ?? "") ? segments[1] : segments[0];
    if (!site || !BOARD_NAME.test(site)) return null;
    return `workday:${workday[1]}.${workday[2]}/${site}`;
  }
  return null;
}

const ENTRY = /^(?:(?:greenhouse|lever|ashby):[A-Za-z0-9_-]+|workday:[A-Za-z0-9_-]+\.wd\d+\/[A-Za-z0-9_-]+)$/;

export function isBoardEntry(value: unknown): value is string {
  return typeof value === "string" && ENTRY.test(value);
}

function boardKey(entry: string): string {
  const [provider, board] = entry.split(":");
  return `${provider ?? ""}:${board ?? ""}`.toLowerCase();
}

export function discoverBoards(
  jobs: Job[],
  { existing, dismissed }: { existing: string[]; dismissed: string[] }
): DiscoveredBoard[] {
  const skip = new Set([...existing, ...dismissed].map(boardKey));
  const found = new Map<string, { entry: string; names: Map<string, number>; jobs: number }>();

  for (const job of jobs) {
    const entries = new Set<string>();
    for (const column of URL_COLUMNS) {
      const entry = extractBoard(job[column]);
      if (entry) entries.add(entry);
    }
    for (const entry of entries) {
      const key = boardKey(entry);
      if (skip.has(key)) continue;
      const record = found.get(key) ?? { entry, names: new Map<string, number>(), jobs: 0 };
      record.jobs += 1;
      const company = (job.company ?? "").trim();
      if (company) record.names.set(company, (record.names.get(company) ?? 0) + 1);
      found.set(key, record);
    }
  }

  return [...found.values()]
    .map(({ entry, names, jobs: count }) => ({
      entry,
      name: [...names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "",
      jobs: count,
    }))
    .sort((a, b) => b.jobs - a.jobs || a.entry.localeCompare(b.entry));
}
