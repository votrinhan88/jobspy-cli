import fs from "fs/promises";
import path from "path";
import { cookies } from "next/headers";

const DATA_DIR = path.resolve(process.cwd(), "..", "data");
const PROFILE_COOKIE = "active_profile";

export async function listProfiles(): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(DATA_DIR);
  } catch {
    return [];
  }
  const results: string[] = [];
  for (const entry of entries) {
    if (entry === ".gitkeep") continue;
    const stat = await fs.stat(path.join(DATA_DIR, entry));
    if (stat.isDirectory()) results.push(entry);
  }
  return results.sort();
}

export async function getActiveProfile(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(PROFILE_COOKIE)?.value ?? null;
}

export function profileDir(profile: string): string {
  return path.join(DATA_DIR, profile);
}

export function jobsCsvPath(profile: string): string {
  return path.join(DATA_DIR, profile, "jobs.csv");
}

export function scrapeConfigPath(profile: string): string {
  return path.join(DATA_DIR, profile, "scrape_config.json");
}

export function scrapeStatusPath(profile: string): string {
  return path.join(DATA_DIR, profile, "scrape_status.json");
}

export function scrapeLogPath(profile: string): string {
  return path.join(DATA_DIR, profile, "scrape.log");
}

export function scrapeHistoryPath(profile: string): string {
  return path.join(DATA_DIR, profile, "scrape_history.json");
}

export function cvPath(profile: string, ext: "pdf" | "md" = "pdf"): string {
  return path.join(DATA_DIR, profile, `cv.${ext}`);
}

export async function createProfile(name: string): Promise<void> {
  const dir = profileDir(name);
  await fs.mkdir(dir, { recursive: true });
  const configPath = scrapeConfigPath(name);
  try {
    await fs.access(configPath);
  } catch {
    const defaults = {
      job: [],
      location: [],
      results_wanted: 20,
      site_name: ["linkedin", "indeed", "google"],
      workers: 4,
      title_exclude: [],
      exclude_companies: [],
    };
    await fs.writeFile(configPath, JSON.stringify(defaults, null, 2), "utf-8");
  }
}

export function isValidProfileName(name: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(name);
}
