import fs from "fs/promises";
import { scrapeStatusPath, scrapeHistoryPath } from "./profile";

export type ScrapeStatusValue = "idle" | "running" | "done" | "error";

export interface ScrapeStatus {
  status: ScrapeStatusValue;
  started_at: string | null;
  finished_at: string | null;
  new_jobs: number | null;
  updated_jobs: number | null;
  total_jobs: number | null;
  error: string | null;
}

const IDLE: ScrapeStatus = {
  status: "idle",
  started_at: null,
  finished_at: null,
  new_jobs: null,
  updated_jobs: null,
  total_jobs: null,
  error: null,
};

export async function readScrapeStatus(profile: string): Promise<ScrapeStatus> {
  try {
    const raw = await fs.readFile(scrapeStatusPath(profile), "utf-8");
    return { ...IDLE, ...JSON.parse(raw) };
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
