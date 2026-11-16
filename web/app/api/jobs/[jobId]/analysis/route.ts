import type { NextRequest } from "next/server";
import { getActiveProfile, jobsCsvPath } from "@/lib/profile";
import { readJobs, type Job } from "@/lib/csv";
import { hashText } from "@/lib/hash";
import { listResumes, readResumeText, type ResumeMeta } from "@/lib/resumes/library";
import { isValidTag } from "@/lib/tag";
import {
  analysisAvailable,
  buildMessages,
  localModelConfig,
  resolveModel,
  runAnalysis,
} from "@/lib/analysis";
import { readAnalysis, writeAnalysis, type SavedAnalysis } from "@/lib/analysis-store";

type Context = { params: Promise<{ jobId: string }> };

const BAD_TAG = { error: "Pick a valid resume tag." };
const NO_JOB = { error: "Job not found" };
const NO_RESUME = { error: "Resume not found" };

async function findJob(profile: string, jobId: string): Promise<Job | undefined> {
  return (await readJobs(jobsCsvPath(profile))).find((row) => row.job_id === jobId);
}

async function findResume(
  profile: string,
  tag: string
): Promise<{ meta: ResumeMeta; text: string } | null> {
  const meta = (await listResumes(profile)).find((item) => item.tag === tag);
  if (!meta) return null;
  const text = await readResumeText(profile, tag);
  return text === null ? null : { meta, text };
}

export async function GET(request: NextRequest, { params }: Context) {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }

  const tag = new URL(request.url).searchParams.get("tag");
  if (tag === null || !isValidTag(tag)) {
    return Response.json(BAD_TAG, { status: 400 });
  }

  const { jobId } = await params;
  const job = await findJob(profile, jobId);
  if (!job) return Response.json(NO_JOB, { status: 404 });

  const resume = await findResume(profile, tag);
  if (!resume) return Response.json(NO_RESUME, { status: 404 });

  const description = job.description ?? "";
  const saved = await readAnalysis(profile, jobId, tag);
  const stale =
    saved !== null &&
    (saved.resume_hash !== resume.meta.textHash || saved.job_hash !== hashText(description));

  return Response.json({
    available: analysisAvailable(),
    sendChars: buildMessages(
      { title: job.title, company: job.company, description },
      resume.text
    ).user.length,
    saved,
    stale,
  });
}

export async function POST(request: NextRequest, { params }: Context) {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const tag = body?.tag;
  if (typeof tag !== "string" || !isValidTag(tag)) {
    return Response.json(BAD_TAG, { status: 400 });
  }

  const { jobId } = await params;
  const job = await findJob(profile, jobId);
  if (!job) return Response.json(NO_JOB, { status: 404 });

  const resume = await findResume(profile, tag);
  if (!resume) return Response.json(NO_RESUME, { status: 404 });

  const description = job.description ?? "";
  if (description.trim() === "") {
    return Response.json({ error: "This job has no description." }, { status: 422 });
  }

  const local = localModelConfig();
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  if (!local && !apiKey) {
    return Response.json(
      { error: "Set ANTHROPIC_API_KEY or LLM_BASE_URL to use gap analysis." },
      { status: 503 }
    );
  }

  const model = resolveModel();
  const result = await runAnalysis({
    job: { title: job.title, company: job.company, description },
    resumeText: resume.text,
    apiKey: local ? local.apiKey : apiKey,
    model,
    baseUrl: local?.baseUrl,
  });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  const saved: SavedAnalysis = {
    model,
    created_at: new Date().toISOString(),
    tag,
    resume_version: resume.meta.version,
    resume_hash: resume.meta.textHash,
    job_hash: hashText(description),
    analysis: result.analysis,
  };
  await writeAnalysis(profile, jobId, tag, saved);
  return Response.json(saved);
}
