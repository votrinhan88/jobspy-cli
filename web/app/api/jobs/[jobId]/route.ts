import type { NextRequest } from "next/server";
import { getActiveProfile, jobsCsvPath } from "@/lib/profile";
import { patchJob, type JobStatus } from "@/lib/csv";

const VALID_STATUSES: JobStatus[] = [
  "shortlisted",
  "applied",
  "interview",
  "offer",
  "rejected",
  "skipped",
  "",
];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }

  const { jobId } = await params;
  const body = await request.json();
  const status: JobStatus = body.status;

  if (!VALID_STATUSES.includes(status)) {
    return Response.json({ error: "Invalid status" }, { status: 422 });
  }

  const updated = await patchJob(jobsCsvPath(profile), jobId, {
    status,
    status_updated_at: new Date().toISOString(),
  });

  if (!updated) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  return Response.json(updated);
}
