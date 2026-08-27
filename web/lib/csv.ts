import fs from "fs/promises";
import path from "path";

export type JobStatus =
  | "shortlisted"
  | "applied"
  | "interview"
  | "offer"
  | "rejected"
  | "skipped"
  | "";

export interface Job {
  job_id: string;
  title: string;
  company: string;
  location: string;
  interval: string;
  min_amount: string;
  max_amount: string;
  currency: string;
  is_remote: string;
  date_posted: string;
  job_url: string;
  status: JobStatus;
  status_updated_at: string;
  [key: string]: string;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function toCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function readJobs(csvPath: string): Promise<Job[]> {
  let content: string;
  try {
    content = await fs.readFile(csvPath, "utf-8");
  } catch {
    return [];
  }

  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = values[i] ?? "";
    });
    return obj as Job;
  });
}

export async function writeJobs(csvPath: string, jobs: Job[]): Promise<void> {
  if (jobs.length === 0) return;
  const headers = Object.keys(jobs[0]);
  const lines = [
    headers.join(","),
    ...jobs.map((job) => headers.map((h) => toCsvField(job[h] ?? "")).join(",")),
  ];
  await fs.writeFile(csvPath, lines.join("\n"), "utf-8");
}

export async function patchJob(
  csvPath: string,
  jobId: string,
  patch: Partial<Pick<Job, "status" | "status_updated_at">>
): Promise<Job | null> {
  const jobs = await readJobs(csvPath);
  const idx = jobs.findIndex((j) => j.job_id === jobId);
  if (idx === -1) return null;
  jobs[idx] = { ...jobs[idx], ...patch };
  await writeJobs(csvPath, jobs);
  return jobs[idx];
}
