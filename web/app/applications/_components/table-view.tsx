import { useMemo, useState } from "react";
import type { Job } from "@/lib/csv";
import { DEFAULT_SORT, sortJobs, type SortKey } from "@/lib/jobs-view";
import { JobsTable, nextSort, type JobsSort } from "@/components/jobs-table";
import { RowActions } from "@/components/job-row-actions";
import type { ChangeStatus, OpenJob } from "@/app/applications/_components/types";

export function TableView({
  jobs,
  crawlAt,
  pending,
  onChange,
  onOpen,
}: {
  jobs: Job[];
  crawlAt: number | null;
  pending: Set<string>;
  onChange: ChangeStatus;
  onOpen: OpenJob;
}) {
  const [sort, setSort] = useState<JobsSort>(DEFAULT_SORT);
  const sorted = useMemo(() => sortJobs(jobs, sort.key, sort.dir), [jobs, sort]);
  return (
    <JobsTable
      jobs={sorted}
      groups={null}
      sort={sort}
      onSort={(key: SortKey) => setSort((previous) => nextSort(previous, key))}
      crawlAt={crawlAt}
      selectedId={null}
      onOpen={onOpen}
      renderActions={(job) => <RowActions job={job} busy={pending.has(job.job_id)} onChange={onChange} />}
    />
  );
}
