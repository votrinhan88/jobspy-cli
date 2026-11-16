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

export interface ConfigValidation {
  config: ScrapeConfig;
  errors: string[];
}

// Google serves job results only to browsers that run JavaScript. Glassdoor returns HTTP 400.
const UNSUPPORTED_SITES = new Set(["google", "glassdoor"]);

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringList(
  value: unknown,
  fallback: string[],
  name: string,
  errors: string[]
): string[] {
  if (value === undefined) return [...fallback];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    errors.push(`${name} must be a list of text values.`);
    return [...fallback];
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function readInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  name: string,
  errors: string[]
): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    errors.push(`${name} must be a whole number from ${min} to ${max}.`);
    return fallback;
  }
  return value;
}

function readBoolean(value: unknown, fallback: boolean, name: string, errors: string[]): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    errors.push(`${name} must be true or false.`);
    return fallback;
  }
  return value;
}

function readSchedule(value: unknown, errors: string[]): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    errors.push("schedule must be text or null.");
    return null;
  }
  return value;
}

export function validateConfig(raw: unknown): ConfigValidation {
  const errors: string[] = [];
  if (!isRecord(raw)) {
    errors.push("The config must be a JSON object.");
  }
  const source = isRecord(raw) ? raw : {};
  let siteName = readStringList(source.site_name, DEFAULTS.site_name, "site_name", errors);
  siteName = siteName.filter((site) => !UNSUPPORTED_SITES.has(site));
  if (siteName.length === 0) siteName = [...DEFAULTS.site_name];

  const config: ScrapeConfig = {
    job: readStringList(source.job, DEFAULTS.job, "job", errors),
    location: readStringList(source.location, DEFAULTS.location, "location", errors),
    results_wanted: readInteger(source.results_wanted, DEFAULTS.results_wanted, 1, 100, "results_wanted", errors),
    site_name: siteName,
    workers: readInteger(source.workers, DEFAULTS.workers, 1, 16, "workers", errors),
    title_exclude: readStringList(source.title_exclude, DEFAULTS.title_exclude, "title_exclude", errors),
    exclude_companies: readStringList(
      source.exclude_companies,
      DEFAULTS.exclude_companies,
      "exclude_companies",
      errors
    ),
    schedule: readSchedule(source.schedule, errors),
    fetch_linkedin_description: readBoolean(
      source.fetch_linkedin_description,
      DEFAULTS.fetch_linkedin_description,
      "fetch_linkedin_description",
      errors
    ),
  };
  return { config, errors };
}

export async function readConfig(profile: string): Promise<ScrapeConfig> {
  try {
    const raw = await fs.readFile(scrapeConfigPath(profile), "utf-8");
    return validateConfig(JSON.parse(raw)).config;
  } catch {
    return { ...DEFAULTS };
  }
}

export async function writeConfig(profile: string, config: ScrapeConfig): Promise<void> {
  const checked = validateConfig(config);
  if (checked.errors.length > 0) {
    throw new Error(checked.errors.join(" "));
  }
  await fs.writeFile(scrapeConfigPath(profile), JSON.stringify(checked.config, null, 2), "utf-8");
}
