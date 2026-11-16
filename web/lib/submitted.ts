import fs from "fs/promises";
import path from "path";
import { submittedPath } from "./profile";

export interface SubmittedEntry {
  tag: string;
  version: number;
  textHash: string;
  at: string;
}

type SubmittedMap = Record<string, SubmittedEntry>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEntry(value: unknown): value is SubmittedEntry {
  return (
    isObject(value) &&
    typeof value.tag === "string" &&
    typeof value.version === "number" &&
    typeof value.textHash === "string" &&
    typeof value.at === "string"
  );
}

async function readAll(profile: string): Promise<SubmittedMap> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(submittedPath(profile), "utf-8"));
    return isObject(parsed) ? (parsed as SubmittedMap) : {};
  } catch {
    return {};
  }
}

export async function readSubmitted(profile: string, jobId: string): Promise<SubmittedEntry | null> {
  const entry = (await readAll(profile))[jobId];
  return isEntry(entry) ? entry : null;
}

// Write beside the target and rename, so a crash never leaves a half-written file.
async function writeAll(profile: string, all: SubmittedMap): Promise<void> {
  const file = submittedPath(profile);
  const tmp = path.join(path.dirname(file), `.submitted.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(all, null, 2), "utf-8");
  await fs.rename(tmp, file);
}

export async function writeSubmitted(
  profile: string,
  jobId: string,
  entry: { tag: string; version: number; textHash: string } | null
): Promise<SubmittedEntry | null> {
  const all = await readAll(profile);
  if (entry === null) {
    delete all[jobId];
  } else {
    all[jobId] = { ...entry, at: new Date().toISOString() };
  }

  await writeAll(profile, all);
  return entry === null ? null : all[jobId];
}

export async function renameSubmittedTag(profile: string, from: string, to: string): Promise<void> {
  const all = await readAll(profile);
  const matches = Object.values(all).filter((entry) => isEntry(entry) && entry.tag === from);
  if (matches.length === 0) return;
  for (const entry of matches) entry.tag = to;
  await writeAll(profile, all);
}
