import fs from "fs/promises";
import path from "path";
import { assertJobHeader } from "./jobs-schema";

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
  first_seen_at: string;
  last_seen_at: string;
  closed_at: string;
  closed_reason: string;
  country: string;
  city: string;
  work_mode: string;
  seniority: string;
  employment_type: string;
  [key: string]: string;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let rowHasContent = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const endRow = () => {
    row.push(field);
    const blank = row.length === 1 && row[0] === "" && !rowHasContent;
    if (!blank) rows.push(row);
    row = [];
    field = "";
    rowHasContent = false;
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
      } else if (ch === '"') {
        inQuotes = false;
        i++;
      } else {
        field += ch;
        i++;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      rowHasContent = true;
      i++;
    } else if (ch === ",") {
      row.push(field);
      field = "";
      rowHasContent = true;
      i++;
    } else if (ch === "\r" || ch === "\n") {
      endRow();
      i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
    } else {
      field += ch;
      rowHasContent = true;
      i++;
    }
  }
  if (rowHasContent || field !== "") endRow();
  return rows;
}

function toCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
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

  const [headers, ...records] = parseCsv(content);
  if (!headers) return [];
  assertJobHeader(headers);
  return records.map((values) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = values[i] ?? "";
    });
    return obj as Job;
  });
}

function columnUnion(jobs: Job[]): string[] {
  const seen = new Set<string>();
  for (const job of jobs) {
    for (const key of Object.keys(job)) seen.add(key);
  }
  return [...seen];
}

// Windows can refuse a rename for a moment while another process (an editor, a scrape) holds the file.
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt >= 5 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) throw err;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}

export async function writeJobs(csvPath: string, jobs: Job[]): Promise<void> {
  if (jobs.length === 0) return;
  const headers = columnUnion(jobs);
  const lines = [
    headers.map(toCsvField).join(","),
    ...jobs.map((job) => headers.map((h) => toCsvField(job[h] ?? "")).join(",")),
  ];
  const tmpPath = path.join(
    path.dirname(csvPath),
    `.${path.basename(csvPath)}.${process.pid}.${Date.now()}.tmp`
  );
  try {
    await fs.writeFile(tmpPath, lines.join("\n") + "\n", "utf-8");
    await renameWithRetry(tmpPath, csvPath);
  } catch (err) {
    await fs.rm(tmpPath, { force: true });
    throw err;
  }
}

export async function updateJob(
  csvPath: string,
  jobId: string,
  patch: Partial<Pick<Job, "status" | "status_updated_at">>
): Promise<{ before: Job; after: Job } | null> {
  const jobs = await readJobs(csvPath);
  const idx = jobs.findIndex((j) => j.job_id === jobId);
  if (idx === -1) return null;
  const before = jobs[idx];
  jobs[idx] = { ...before, ...patch };
  await writeJobs(csvPath, jobs);
  return { before, after: jobs[idx] };
}

export async function patchJob(
  csvPath: string,
  jobId: string,
  patch: Partial<Pick<Job, "status" | "status_updated_at">>
): Promise<Job | null> {
  return (await updateJob(csvPath, jobId, patch))?.after ?? null;
}
