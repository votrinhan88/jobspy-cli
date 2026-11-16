import type { Job } from "@/lib/csv";

function changedAt(job: Job): number {
  const time = Date.parse(job.status_updated_at);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

export function groupByStatus<S extends string>(jobs: Job[], columns: readonly S[]): Record<S, Job[]> {
  const groups = {} as Record<S, Job[]>;
  for (const column of columns) {
    groups[column] = jobs
      .filter((job) => job.status === column)
      .sort((a, b) => {
        const x = changedAt(a);
        const y = changedAt(b);
        if (x === y) return 0;
        if (x === Number.NEGATIVE_INFINITY) return 1;
        if (y === Number.NEGATIVE_INFINITY) return -1;
        return x - y;
      });
  }
  return groups;
}
