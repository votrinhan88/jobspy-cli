import { spawn } from "child_process";
import path from "path";
import type { NextRequest } from "next/server";
import { getActiveProfile, profileDir } from "@/lib/profile";
import { readConfig } from "@/lib/config";
import { writeScrapeStatus, readScrapeStatus } from "@/lib/scrape-status";

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
    stdio: "ignore",
  });

  child.on("close", async (code) => {
    if (code === 0) {
      await writeScrapeStatus(profile, {
        status: "done",
        finished_at: new Date().toISOString(),
      });
    } else {
      await writeScrapeStatus(profile, {
        status: "error",
        finished_at: new Date().toISOString(),
        error: `Process exited with code ${code}`,
      });
    }
  });

  child.unref();

  return Response.json({ status: "running" }, { status: 202 });
}

function buildArgs(config: Awaited<ReturnType<typeof readConfig>>, savePath: string): string[] {
  const args: string[] = [];

  for (const job of config.job) {
    args.push("--job", job);
  }
  for (const loc of config.location) {
    args.push("--location", loc);
  }
  args.push("--results_wanted", String(config.results_wanted));
  for (const site of config.site_name) {
    args.push("--site_name", site);
  }
  args.push("--workers", String(config.workers));
  for (const exc of config.title_exclude) {
    args.push("--title_exclude", exc);
  }
  for (const exc of config.exclude_companies) {
    args.push("--exclude_companies", exc);
  }
  args.push("--save_path", savePath);

  return args;
}
