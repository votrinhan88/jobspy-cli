import type { Job, JobStatus } from "@/lib/csv";
import { StatusMenu } from "@/components/status-menu";
import type { ChangeStatus } from "@/app/applications/_components/types";

// The buttons are the usual next steps only. Every other move is in the status menu.
interface RowAction {
  status: JobStatus;
  verb: string;
}

const ACTIONS: Partial<Record<JobStatus, RowAction[]>> = {
  shortlisted: [{ status: "applied", verb: "Apply" }],
  applied: [{ status: "interview", verb: "Interview" }],
  interview: [{ status: "offer", verb: "Offer" }],
  offer: [
    { status: "accepted", verb: "Accept" },
    { status: "rejected", verb: "Reject" },
  ],
};

export function RowActions({ job, busy, onChange }: { job: Job; busy: boolean; onChange: ChangeStatus }) {
  return (
    <>
      {(ACTIONS[job.status] ?? []).map((action) => (
        <button
          key={action.status}
          type="button"
          className={`btn btn-sm row-action-btn status-chip--${action.status}`}
          onClick={() => onChange(job, action.status)}
          disabled={busy}
        >
          {action.verb}
        </button>
      ))}
      <StatusMenu
        current={job.status}
        jobTitle={job.title || "job"}
        disabled={busy}
        onSelect={(s) => onChange(job, s)}
      />
    </>
  );
}
