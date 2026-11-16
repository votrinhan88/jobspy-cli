import type { NextRequest } from "next/server";
import { getActiveProfile, jobsCsvPath } from "@/lib/profile";
import { readJobs } from "@/lib/csv";
import { listResumes, readResumeText } from "@/lib/resumes/library";
import { rankTags } from "@/lib/matching";

type Context = { params: Promise<{ jobId: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }

  const { jobId } = await params;
  const job = (await readJobs(jobsCsvPath(profile))).find((row) => row.job_id === jobId);
  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  const description = job.description ?? "";
  if (description.trim() === "") {
    return Response.json({ hasDescription: false, ranking: [] });
  }

  const tagTexts = [];
  for (const { tag } of await listResumes(profile)) {
    const text = await readResumeText(profile, tag);
    if (text !== null) tagTexts.push({ tag, text });
  }
  return Response.json({ hasDescription: true, ranking: rankTags(description, tagTexts) });
}
