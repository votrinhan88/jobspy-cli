import fs from "fs/promises";
import { scrapeRunPath } from "./profile";
import type { SourceRunStatus } from "./scrape-status";

export interface ScrapeRun {
  started_at: string | null;
  finished_at: string | null;
  new_jobs: number | null;
  total_jobs: number | null;
  sources: SourceRunStatus[];
}

export async function readScrapeRun(profile: string): Promise<ScrapeRun | null> {
  try {
    const raw = await fs.readFile(scrapeRunPath(profile), "utf-8");
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.sources)) return null;
    return data as ScrapeRun;
  } catch {
    return null;
  }
}
