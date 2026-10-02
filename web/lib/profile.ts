import fs from "fs/promises";
import path from "path";
import { cookies } from "next/headers";

export const PROFILE_COOKIE = "active_profile";
export const PROFILE_COOKIE_OPTIONS = { httpOnly: true, path: "/", sameSite: "lax" } as const;

// The data folder is runtime user data, not app source. The ignore hint stops the
// bundler from tracing the whole project into the server build because of this path.
export function dataDir(): string {
  return path.resolve(
    /*turbopackIgnore: true*/ process.env.JOBSPY_DATA_DIR || path.join(process.cwd(), "..", "data")
  );
}

export async function listProfiles(): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dataDir());
  } catch {
    return [];
  }
  const results: string[] = [];
  for (const entry of entries) {
    // Folders with other names cannot be reached safely through the path helpers.
    if (!isValidProfileName(entry)) continue;
    const stat = await fs.stat(path.join(dataDir(), entry));
    if (stat.isDirectory()) results.push(entry);
  }
  return results.sort();
}

// Server components cannot set cookies, so a stale or bad cookie is ignored here, not cleared.
export async function getActiveProfile(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(PROFILE_COOKIE)?.value;
  const profiles = await listProfiles();
  if (value && isValidProfileName(value) && profiles.includes(value)) return value;
  return profiles[0] ?? null;
}

function profilePath(profile: string, ...parts: string[]): string {
  if (!isValidProfileName(profile)) {
    throw new Error(`Invalid profile name: ${JSON.stringify(profile)}`);
  }
  const root = path.resolve(dataDir());
  const result = path.resolve(root, profile, ...parts);
  if (!result.startsWith(root + path.sep)) {
    throw new Error(`Path is outside the data directory: ${result}`);
  }
  return result;
}

export function profileDir(profile: string): string {
  return profilePath(profile);
}

export function jobsCsvPath(profile: string): string {
  return profilePath(profile, "jobs.csv");
}

export function scrapeConfigPath(profile: string): string {
  return profilePath(profile, "scrape_config.json");
}

export function scrapeStatusPath(profile: string): string {
  return profilePath(profile, "scrape_status.json");
}

export function scrapeLogPath(profile: string): string {
  return profilePath(profile, "scrape.log");
}

export function scrapeHistoryPath(profile: string): string {
  return profilePath(profile, "scrape_history.json");
}

export function statusLogPath(profile: string): string {
  return profilePath(profile, "status_log.jsonl");
}

export function cvPath(profile: string, ext: "pdf" | "md" = "pdf"): string {
  return profilePath(profile, `cv.${ext}`);
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
