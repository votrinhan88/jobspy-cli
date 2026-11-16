import type { JobStatus } from "@/lib/csv";

// Any status can move to any other status. There is no transition table on purpose: undo fixes mistakes.
export const STATUSES: readonly JobStatus[] = [
  "",
  "shortlisted",
  "applied",
  "interview",
  "offer",
  "rejected",
  "skipped",
];

const LABELS: Record<JobStatus, string> = {
  "": "Untriaged",
  shortlisted: "Shortlisted",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  skipped: "Skipped",
};

export function statusLabel(status: JobStatus): string {
  return LABELS[status] ?? status;
}

export function isStatus(value: unknown): value is JobStatus {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

export function isActiveStatus(status: string): boolean {
  return status === "shortlisted" || status === "applied" || status === "interview" || status === "offer";
}

export function isArchivedStatus(status: string): boolean {
  return status === "rejected" || status === "skipped";
}

export function isSkippedStatus(status: string): boolean {
  return status === "skipped";
}

export function isTrackedStatus(status: string): boolean {
  return status !== "" && !isSkippedStatus(status);
}

export function isRemote(value: string | undefined | null): boolean {
  return /^(true|yes|1)$/i.test((value ?? "").trim());
}
