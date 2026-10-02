import type { JobStatus } from "@/lib/csv";

export interface StatusPatchBody {
  status: JobStatus;
  status_updated_at: string;
}

export function undoPatchBody(previous: {
  status: JobStatus;
  status_updated_at?: string;
}): StatusPatchBody {
  return { status: previous.status, status_updated_at: previous.status_updated_at ?? "" };
}
