import { spawn } from "child_process";
import { openSync, closeSync, writeFileSync, readFileSync } from "fs";
import path from "path";
import type { NextRequest } from "next/server";
import { getActiveProfile, profileDir, scrapeLogPath } from "@/lib/profile";
import { readConfig } from "@/lib/config";
import { writeScrapeStatus, readScrapeStatus, appendScrapeHistory } from "@/lib/scrape-status";

const REPO_ROOT = path.resolve(process.cwd(), "..");

export async function POST(_request: NextRequest) {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }

  const current = await readScrapeStatus(profile);
  if (current.status === "running") {
    return Response.json({ error: "Scrape already running" }, { status: 409 });
  }

  const config = await readConfig(profile);
  const savePath = path.join(REPO_ROOT, "data", profile, "jobs.csv");

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

  child.on("close", async (code) => {
    if (code === 0) {
      const counts = parseCountsFromLog(logPath);
      const final = { status: "done" as const, finished_at: new Date().toISOString(), ...counts };
      await writeScrapeStatus(profile, final);
      await appendScrapeHistory(profile, await readScrapeStatus(profile));
    } else {
      const final = { status: "error" as const, finished_at: new Date().toISOString(), error: `Process exited with code ${code}` };
      await writeScrapeStatus(profile, final);
      await appendScrapeHistory(profile, await readScrapeStatus(profile));
    }
  });

  child.unref();

  return Response.json({ status: "running" }, { status: 202 });
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
