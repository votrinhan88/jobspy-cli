import { spawn } from "child_process";
import { openSync, closeSync, writeFileSync, readFileSync, existsSync } from "fs";
import path from "path";
import { jobsCsvPath, profileDir, scrapeLogPath } from "@/lib/profile";
import { readConfig } from "@/lib/config";
import {
  writeScrapeStatus,
  readScrapeStatus,
  appendScrapeHistory,
  type ScrapeStatus,
} from "@/lib/scrape-status";

const REPO_ROOT = path.resolve(process.cwd(), "..");

export type StartScrapeResult =
  | { started: true }
  | { started: false; reason: "already_running" }
  | { started: false; reason: "no_keywords" };

type FinalStatus = Partial<ScrapeStatus>;

export async function startScrape(profile: string): Promise<StartScrapeResult> {
  const current = await readScrapeStatus(profile);
  if (current.status === "running" && typeof current.pid === "number" && isProcessAlive(current.pid)) {
    return { started: false, reason: "already_running" };
  }

  const config = await readConfig(profile);
  if (config.job.length === 0) {
    return { started: false, reason: "no_keywords" };
  }
  const savePath = jobsCsvPath(profile);

  const args = buildArgs(config, savePath);

  const logPath = scrapeLogPath(profile);
  writeFileSync(logPath, "");
  const logFd = openSync(logPath, "a");

  await writeScrapeStatus(profile, {
    status: "running",
    started_at: new Date().toISOString(),
    finished_at: null,
    new_jobs: null,
    updated_jobs: null,
    total_jobs: null,
    error: null,
  });

  const child = spawn("uv", ["run", "python", "main.py", ...args], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });

  closeSync(logFd);

  await writeScrapeStatus(profile, { pid: child.pid ?? null });

  // A failed spawn can emit "error" and then "close" for the same child; only the first may write the final status.
  let settled = false;
  const finish = async (final: FinalStatus) => {
    if (settled) return;
    settled = true;
    await finishRun(profile, final);
  };

  child.on("error", async (err) => {
    await finish({
      status: "error",
      finished_at: new Date().toISOString(),
      error: `Process could not start: ${err.message}`,
    });
  });

  child.on("close", async (code) => {
    if (code === 0) {
      const counts = parseCountsFromLog(logPath);
      await finish({ status: "done", finished_at: new Date().toISOString(), ...counts });
    } else {
      await finish({ status: "error", finished_at: new Date().toISOString(), error: `Process exited with code ${code}` });
    }
  });

  child.unref();

  return { started: true };
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but belongs to another user, so it still counts as alive.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function finishRun(profile: string, final: FinalStatus): Promise<void> {
  // A profile deleted or renamed mid-run must not have its folder recreated by a late write.
  if (!existsSync(profileDir(profile))) return;
  await writeScrapeStatus(profile, final);
  await appendScrapeHistory(profile, await readScrapeStatus(profile));
}

function parseCountsFromLog(logPath: string): { new_jobs: number | null; total_jobs: number | null } {
  try {
    const text = readFileSync(logPath, "utf-8");
    const match = [...text.matchAll(/Appended:\s+(\d+)\s+new jobs?\s+\((\d+)\s+total\)/g)].pop();
    if (match) return { new_jobs: parseInt(match[1]), total_jobs: parseInt(match[2]) };
  } catch { /* log may not exist */ }
  return { new_jobs: null, total_jobs: null };
}

function buildArgs(config: Awaited<ReturnType<typeof readConfig>>, savePath: string): string[] {
  const args: string[] = [];

  args.push("--job", ...config.job);
  args.push("--location", ...config.location);
  args.push("--results_wanted", String(config.results_wanted));
  args.push("--site_name", ...config.site_name);
  args.push("--workers", String(config.workers));
  if (config.title_exclude.length > 0) args.push("--title_exclude", ...config.title_exclude);
  if (config.exclude_companies.length > 0) args.push("--exclude_companies", ...config.exclude_companies);
  args.push("--save_path", savePath);

  return args;
}
