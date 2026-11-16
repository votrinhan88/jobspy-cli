import type { Job, JobStatus } from "@/lib/csv";
import { STATUSES } from "@/lib/status";

export const COLUMNS = STATUSES.filter((s) => s !== "");

export type ChangeStatus = (job: Job, next: JobStatus) => void;
export type OpenJob = (job: Job, opener: HTMLElement) => void;
