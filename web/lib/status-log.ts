import fs from "fs/promises";
import type { JobStatus } from "@/lib/csv";
import { isStatus } from "@/lib/status";
import { statusLogPath } from "@/lib/profile";

export interface StatusLogEntry {
  job_id: string;
  from: JobStatus;
  to: JobStatus;
  at: string;
}

export interface StatusMove {
  job_id: string;
  from?: JobStatus;
  to: JobStatus;
  at: string;
}

const RANK: Record<string, number> = {
  "": 0,
  shortlisted: 1,
  applied: 2,
  interview: 3,
  offer: 4,
  accepted: 5,
  rejected: 5,
  skipped: 5,
};

// The saved history of one job holds forward steps only. A move forward appends a step. A
// move back cuts the steps after the last arrival at that stage, so the job's history ends
// where it now stands. The backward move itself is never written.
export function applyMove(history: StatusLogEntry[], move: StatusMove): StatusLogEntry[] {
  const current = history.at(-1)?.to ?? move.from ?? "";
  const step = { job_id: move.job_id, from: current, to: move.to, at: move.at };
  if (move.to === current) {
    // A job the log has never seen still needs one step so the log agrees with the board.
    return history.length > 0 || move.to === "" ? history : [{ ...step, from: "" }];
  }
  if (RANK[move.to] >= RANK[current]) return [...history, step];
  if (move.to === "") return [];
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].to === move.to) return history.slice(0, i + 1);
  }
  return [{ ...step, from: "" }];
}

// Replays a job's history from the start, so an existing log is rewritten to forward steps only.
export function compactHistory(entries: StatusLogEntry[]): StatusLogEntry[] {
  let history: StatusLogEntry[] = [];
  for (const entry of entries) {
    history = applyMove(history, { job_id: entry.job_id, to: entry.to, at: entry.at });
  }
  return history;
}

export async function recordStatusChange(profile: string, move: StatusMove): Promise<void> {
  const all = await readStatusLog(profile);
  const others = all.filter((entry) => entry.job_id !== move.job_id);
  const mine = all.filter((entry) => entry.job_id === move.job_id);
  const next = applyMove(mine, move);
  await writeStatusLog(profile, [...others, ...next]);
}

export async function compactStatusLog(profile: string): Promise<void> {
  const all = await readStatusLog(profile);
  const order: string[] = [];
  const byJob = new Map<string, StatusLogEntry[]>();
  for (const entry of all) {
    if (!byJob.has(entry.job_id)) {
      order.push(entry.job_id);
      byJob.set(entry.job_id, []);
    }
    byJob.get(entry.job_id)!.push(entry);
  }
  await writeStatusLog(
    profile,
    order.flatMap((id) => compactHistory(byJob.get(id)!))
  );
}

async function writeStatusLog(profile: string, entries: StatusLogEntry[]): Promise<void> {
  const file = statusLogPath(profile);
  const content = entries.map((e) => JSON.stringify(e) + "\n").join("");
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, content, "utf-8");
  await fs.rename(temp, file);
}

function isEntry(value: unknown): value is StatusLogEntry {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.job_id === "string" &&
    isStatus(v.from) &&
    isStatus(v.to) &&
    typeof v.at === "string"
  );
}

export async function readStatusLog(profile: string): Promise<StatusLogEntry[]> {
  let content: string;
  try {
    content = await fs.readFile(statusLogPath(profile), "utf-8");
  } catch {
    return [];
  }
  const entries: StatusLogEntry[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (isEntry(parsed)) entries.push(parsed);
    } catch {
      continue;
    }
  }
  return entries;
}
