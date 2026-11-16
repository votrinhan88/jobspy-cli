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
  fetch_linkedin_description: boolean;
}

// Google serves job results only to browsers that run JavaScript, so JobSpy gets no data (speedyapply/JobSpy#284).
const UNSUPPORTED_SITES = new Set(["google"]);

const DEFAULTS: ScrapeConfig = {
  job: [],
  location: [],
  results_wanted: 20,
  site_name: ["linkedin", "indeed"],
  workers: 4,
  title_exclude: [],
  exclude_companies: [],
  schedule: null,
  fetch_linkedin_description: true,
};

export async function readConfig(profile: string): Promise<ScrapeConfig> {
  try {
    const raw = await fs.readFile(scrapeConfigPath(profile), "utf-8");
    const config: ScrapeConfig = { ...DEFAULTS, ...JSON.parse(raw) };
    return { ...config, site_name: config.site_name.filter((site) => !UNSUPPORTED_SITES.has(site)) };
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
