import fs from "fs/promises";
import { scrapeStatusPath, scrapeHistoryPath } from "./profile";

export type ScrapeStatusValue = "idle" | "running" | "done" | "error";

export interface SourceRunStatus {
  site: string;
  attempts: number;
  succeeded: number;
  failed: number;
  skipped: number;
  jobs: number;
  duration_ms: number;
  error: string | null;
}

export interface ScrapeStatus {
  status: ScrapeStatusValue;
  started_at: string | null;
  finished_at: string | null;
  new_jobs: number | null;
  total_jobs: number | null;
  error: string | null;
  pid: number | null;
  source_runs: SourceRunStatus[];
}

const IDLE: ScrapeStatus = {
  status: "idle",
  started_at: null,
  finished_at: null,
  new_jobs: null,
  total_jobs: null,
  error: null,
  pid: null,
  source_runs: [],
};

export async function readScrapeStatus(profile: string): Promise<ScrapeStatus> {
  try {
    const raw = await fs.readFile(scrapeStatusPath(profile), "utf-8");
    const data = JSON.parse(raw);
    return {
      ...IDLE,
      ...data,
      source_runs: data && Array.isArray(data.source_runs) ? data.source_runs : [],
    };
  } catch {
    return { ...IDLE };
  }
}

export async function writeScrapeStatus(
  profile: string,
  status: Partial<ScrapeStatus>
): Promise<void> {
  const current = await readScrapeStatus(profile);
  await fs.writeFile(
    scrapeStatusPath(profile),
    JSON.stringify({ ...current, ...status }, null, 2),
    "utf-8"
  );
}

const HISTORY_MAX = 20;

export async function readScrapeHistory(profile: string): Promise<ScrapeStatus[]> {
  try {
    const raw = await fs.readFile(scrapeHistoryPath(profile), "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function appendScrapeHistory(profile: string, entry: ScrapeStatus): Promise<void> {
  const history = await readScrapeHistory(profile);
  history.unshift(entry);
  await fs.writeFile(
    scrapeHistoryPath(profile),
    JSON.stringify(history.slice(0, HISTORY_MAX), null, 2),
    "utf-8"
  );
}
