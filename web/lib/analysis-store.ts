import fs from "fs/promises";
import path from "path";
import { analysisDir, analysisPath } from "./profile";
import { parseAnalysisValue, type Analysis } from "./analysis";
import { isValidTag } from "./tag";

export interface SavedAnalysis {
  model: string;
  created_at: string;
  tag: string;
  resume_version: number;
  resume_hash: string;
  job_hash: string;
  analysis: Analysis;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSaved(value: unknown): SavedAnalysis | null {
  if (!isObject(value)) return null;
  const { model, created_at, tag, resume_version, resume_hash, job_hash } = value;
  if (
    typeof model !== "string" ||
    typeof created_at !== "string" ||
    typeof tag !== "string" ||
    typeof resume_version !== "number" ||
    typeof resume_hash !== "string" ||
    typeof job_hash !== "string"
  ) {
    return null;
  }
  const analysis = parseAnalysisValue(value.analysis);
  if (!analysis) return null;
  return { model, created_at, tag, resume_version, resume_hash, job_hash, analysis };
}

export async function readAnalysis(
  profile: string,
  jobId: string,
  tag: string
): Promise<SavedAnalysis | null> {
  let file: string;
  try {
    file = analysisPath(profile, jobId, tag);
  } catch {
    return null;
  }
  try {
    const raw = await fs.readFile(file, "utf-8");
    return parseSaved(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function writeAnalysis(
  profile: string,
  jobId: string,
  tag: string,
  saved: SavedAnalysis
): Promise<void> {
  const file = analysisPath(profile, jobId, tag);
  await fs.mkdir(analysisDir(profile), { recursive: true });
  await fs.writeFile(file, JSON.stringify(saved, null, 2), "utf-8");
}

// The suffix is matched in full so that tag "a" never picks up the files of tag "ba".
async function fileNamesForTag(profile: string, tag: string): Promise<string[]> {
  let names: string[];
  try {
    names = await fs.readdir(analysisDir(profile));
  } catch {
    return [];
  }
  const suffix = `--${tag}.json`;
  return names.filter((name) => name.endsWith(suffix));
}

export async function renameAnalyses(profile: string, from: string, to: string): Promise<void> {
  if (!isValidTag(from) || !isValidTag(to)) throw new Error("Invalid resume tag");
  if (from === to) return;
  const suffix = `--${from}.json`;
  for (const name of await fileNamesForTag(profile, from)) {
    const jobId = name.slice(0, -suffix.length);
    const saved = await readAnalysis(profile, jobId, from);
    if (!saved) continue;
    await writeAnalysis(profile, jobId, to, { ...saved, tag: to });
    await fs.rm(path.join(analysisDir(profile), name), { force: true });
  }
}

export async function deleteAnalyses(profile: string, tag: string): Promise<void> {
  if (!isValidTag(tag)) return;
  for (const name of await fileNamesForTag(profile, tag)) {
    await fs.rm(path.join(analysisDir(profile), name), { force: true });
  }
}
