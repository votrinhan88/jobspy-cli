import { useState } from "react";
import type { Job, JobStatus } from "@/lib/csv";
import { formatLocation } from "@/lib/jobs-view";
import { isArchivedStatus, isTrackedStatus, statusLabel } from "@/lib/status";
import { COLUMNS, type ChangeStatus, type OpenJob } from "@/app/applications/_components/types";

export function KanbanView({
  byStatus,
  pending,
  onChange,
  onOpen,
}: {
  byStatus: Record<(typeof COLUMNS)[number], Job[]>;
  pending: Set<string>;
  onChange: ChangeStatus;
  onOpen: OpenJob;
}) {
  const [dragging, setDragging] = useState<Job | null>(null);
  const active = COLUMNS.filter((s) => !isArchivedStatus(s));
  const archive = COLUMNS.filter((s) => isArchivedStatus(s) && isTrackedStatus(s));
  const byId = new Map<string, Job>();
  for (const list of Object.values(byStatus)) {
    for (const job of list) byId.set(job.job_id, job);
  }

  function dropJob(jobId: string, status: JobStatus) {
    const job = byId.get(jobId);
    if (job && job.status !== status) onChange(job, status);
  }

  return (
    <div>
      <div className="kanban-board" aria-label="Active applications">
        {active.map((col) => (
          <KanbanColumn
            key={col}
            status={col}
            jobs={byStatus[col]}
            pending={pending}
            dragging={dragging}
            onDragJob={setDragging}
            onDropJob={(jobId) => dropJob(jobId, col)}
            onOpen={onOpen}
          />
        ))}
      </div>
      {archive.some((s) => byStatus[s].length > 0) && (
        <div className="kanban-archive">
          <p className="section-title">Archive</p>
          <div className="kanban-board kanban-board--archive" role="group" aria-label="Archived applications">
            {archive.map((col) => (
              <KanbanColumn
                key={col}
                status={col}
                jobs={byStatus[col]}
                pending={pending}
                dragging={dragging}
                onDragJob={setDragging}
                onDropJob={(jobId) => dropJob(jobId, col)}
                onOpen={onOpen}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KanbanColumn({
  status,
  jobs,
  pending,
  dragging,
  onDragJob,
  onDropJob,
  onOpen,
}: {
  status: JobStatus;
  jobs: Job[];
  pending: Set<string>;
  dragging: Job | null;
  onDragJob: (job: Job | null) => void;
  onDropJob: (jobId: string) => void;
  onOpen: OpenJob;
}) {
  const [over, setOver] = useState(false);
  // The list is oldest first, so a moved job lands at the bottom.
  const showSlot = over && dragging !== null && dragging.status !== status;
  return (
    <section
      className={`kanban-col${over ? " kanban-col--over" : ""}`}
      aria-label={`${statusLabel(status)}, ${jobs.length}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onDragJob(null);
        const jobId = e.dataTransfer.getData("text/plain");
        if (jobId) onDropJob(jobId);
      }}
    >
      <div className="kanban-col-header">
        <span className={`status-chip status-chip--${status}`}>{statusLabel(status)}</span>
        <span className="kanban-count">{jobs.length}</span>
      </div>
      <div className={`kanban-cards${showSlot ? " kanban-cards--over" : ""}`}>
        {jobs.length === 0 ? (
          !showSlot && <p className="kanban-empty">No jobs</p>
        ) : (
          jobs.map((job) => (
            <JobCard
              key={job.job_id}
              job={job}
              busy={pending.has(job.job_id)}
              dragging={dragging?.job_id === job.job_id}
              onDragJob={onDragJob}
              onOpen={onOpen}
            />
          ))
        )}
        {showSlot && <div className="kanban-slot" data-drop-slot aria-hidden="true" />}
      </div>
    </section>
  );
}

function JobCard({
  job,
  busy,
  dragging,
  onDragJob,
  onOpen,
}: {
  job: Job;
  busy: boolean;
  dragging: boolean;
  onDragJob: (job: Job | null) => void;
  onOpen: OpenJob;
}) {
  return (
    <div
      className={`job-card${dragging ? " job-card--dragging" : ""}`}
      draggable={!busy}
      data-job-id={job.job_id}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", job.job_id);
        e.dataTransfer.effectAllowed = "move";
        onDragJob(job);
      }}
      onDragEnd={() => onDragJob(null)}
    >
      <button type="button" className="job-card-title" onClick={(e) => onOpen(job, e.currentTarget)}>
        {job.title}
      </button>
      <p className="job-card-company">{job.company}</p>
      {job.location && <p className="job-card-location">{formatLocation(job)}</p>}
    </div>
  );
}
