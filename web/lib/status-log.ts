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

export async function appendStatusLog(profile: string, entry: StatusLogEntry): Promise<void> {
  const line = JSON.stringify({ job_id: entry.job_id, from: entry.from, to: entry.to, at: entry.at });
  await fs.appendFile(statusLogPath(profile), line + "\n", "utf-8");
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
