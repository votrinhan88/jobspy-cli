import type { NextRequest } from "next/server";
import { getActiveProfile, jobsCsvPath } from "@/lib/profile";
import { readJobs } from "@/lib/csv";
import { listResumes, type ResumeMeta } from "@/lib/resumes/library";
import { isValidTag } from "@/lib/tag";
import { readSubmitted, writeSubmitted } from "@/lib/submitted";

type Context = { params: Promise<{ jobId: string }> };

const NO_JOB = { error: "Job not found" };
const NO_RESUME = { error: "Resume not found" };

async function jobExists(profile: string, jobId: string): Promise<boolean> {
  return (await readJobs(jobsCsvPath(profile))).some((row) => row.job_id === jobId);
}

async function findMeta(profile: string, tag: string): Promise<ResumeMeta | undefined> {
  return (await listResumes(profile)).find((item) => item.tag === tag);
}

export async function GET(_request: NextRequest, { params }: Context) {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }

  const { jobId } = await params;
  if (!(await jobExists(profile, jobId))) {
    return Response.json(NO_JOB, { status: 404 });
  }

  const submitted = await readSubmitted(profile, jobId);
  if (!submitted) {
    return Response.json({ submitted: null, changed: false });
  }

  const meta = await findMeta(profile, submitted.tag);
  const changed = !meta || meta.textHash !== submitted.textHash;
  return Response.json({ submitted, changed });
}

export async function PUT(request: NextRequest, { params }: Context) {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (typeof body !== "object" || body === null || !("tag" in body)) {
    return Response.json({ error: "Send a tag, or null to clear." }, { status: 400 });
  }
  const tag = body.tag;
  if (tag !== null && (typeof tag !== "string" || !isValidTag(tag))) {
    return Response.json({ error: "Pick a valid resume tag." }, { status: 400 });
  }

  const { jobId } = await params;
  if (!(await jobExists(profile, jobId))) {
    return Response.json(NO_JOB, { status: 404 });
  }

  if (tag === null) {
    await writeSubmitted(profile, jobId, null);
    return Response.json({ submitted: null, changed: false });
  }

  const meta = await findMeta(profile, tag);
  if (!meta) return Response.json(NO_RESUME, { status: 404 });

  const submitted = await writeSubmitted(profile, jobId, {
    tag,
    version: meta.version,
    textHash: meta.textHash,
  });
  return Response.json({ submitted, changed: false });
}
