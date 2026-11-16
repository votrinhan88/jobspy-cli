import cron, { type ScheduledTask } from "node-cron";
import { listProfiles } from "@/lib/profile";
import { readConfig } from "@/lib/config";
import { startScrape } from "@/lib/scrape-runner";

// Kept on globalThis so tasks survive Next.js dev module reloads.
const globalForScheduler = globalThis as typeof globalThis & {
  __jobspyScheduleTasks?: Map<string, ScheduledTask>;
};
const tasks = (globalForScheduler.__jobspyScheduleTasks ??= new Map<string, ScheduledTask>());

export function isValidSchedule(expr: string): boolean {
  return cron.validate(expr);
}

export function registerSchedule(profile: string, expr: string | null): void {
  unregisterSchedule(profile);
  if (expr === null) return;
  const task = cron.schedule(expr, () => runScheduledScrape(profile));
  tasks.set(profile, task);
}

export function unregisterSchedule(profile: string): void {
  const task = tasks.get(profile);
  if (!task) return;
  task.stop();
  tasks.delete(profile);
}

export function getRegisteredProfiles(): string[] {
  return [...tasks.keys()];
}

export async function registerAllSchedules(): Promise<void> {
  const profiles = await listProfiles();
  for (const profile of profiles) {
    const { schedule } = await readConfig(profile);
    if (!schedule || !isValidSchedule(schedule)) continue;
    registerSchedule(profile, schedule);
  }
}

async function runScheduledScrape(profile: string): Promise<void> {
  try {
    const result = await startScrape(profile);
    if (!result.started && result.reason === "no_keywords") {
      console.log(`Scheduled scrape skipped for ${profile}: no keywords are set.`);
    } else if (!result.started) {
      console.log(`Scheduled scrape skipped for ${profile}: a scrape is already running.`);
    }
  } catch (err) {
    console.error(`Scheduled scrape failed for ${profile}:`, err);
  }
}
