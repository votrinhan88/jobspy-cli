import fs from "fs/promises";
import { scrapeConfigPath } from "./profile";

export interface ScrapeConfig {
  job: string[];
  location: string[];
  results_wanted: number;
  site_name: string[];
  workers: number;
  title_exclude: string[];
  exclude_companies: string[];
  schedule: string | null;
}

const DEFAULTS: ScrapeConfig = {
  job: [],
  location: [],
  results_wanted: 20,
  site_name: ["linkedin", "indeed", "google"],
  workers: 4,
  title_exclude: [],
  exclude_companies: [],
  schedule: null,
};

export async function readConfig(profile: string): Promise<ScrapeConfig> {
  try {
    const raw = await fs.readFile(scrapeConfigPath(profile), "utf-8");
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function writeConfig(
  profile: string,
  config: ScrapeConfig
): Promise<void> {
  await fs.writeFile(
    scrapeConfigPath(profile),
    JSON.stringify(config, null, 2),
    "utf-8"
  );
}
