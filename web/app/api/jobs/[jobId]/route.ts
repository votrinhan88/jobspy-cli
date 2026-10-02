import type { NextRequest } from "next/server";
import { getActiveProfile, jobsCsvPath } from "@/lib/profile";
import { updateJob } from "@/lib/csv";
import { isStatus } from "@/lib/status";
import { appendStatusLog } from "@/lib/status-log";

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

function isIsoTimestamp(value: string): boolean {
  if (!ISO_8601.test(value)) return false;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    !Number.isNaN(Date.parse(value)) &&
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }

  const { jobId } = await params;
  const body = await request.json().catch(() => null);
  const status = body?.status;

  if (!isStatus(status)) {
    return Response.json({ error: "Invalid status" }, { status: 422 });
  }

  let statusUpdatedAt = new Date().toISOString();
  if (body && "status_updated_at" in body) {
    const value = body.status_updated_at;
    // An empty value is allowed so that undo can return a job to "new" with no timestamp.
    if (typeof value !== "string" || (value !== "" && !isIsoTimestamp(value))) {
      return Response.json(
        { error: "status_updated_at must be an ISO 8601 date and time, or empty" },
        { status: 422 }
      );
    }
    statusUpdatedAt = value;
  }

  const result = await updateJob(jobsCsvPath(profile), jobId, {
    status,
    status_updated_at: statusUpdatedAt,
  });

  if (!result) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  await appendStatusLog(profile, {
    job_id: jobId,
    from: result.before.status ?? "",
    to: status,
    // The log needs a point in time even when undo clears the stored timestamp.
    at: statusUpdatedAt || new Date().toISOString(),
  });

  return Response.json(result.after);
}
