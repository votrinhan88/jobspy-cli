"use client";

import { useCallback, useState } from "react";
import type { Job, JobStatus } from "@/lib/csv";
import { statusLabel } from "@/lib/status";
import { undoPatchBody, type StatusPatchBody } from "@/lib/undo";
import { useToast } from "@/components/toast";

async function sendPatch(jobId: string, body: Partial<StatusPatchBody>): Promise<Job> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function sentenceLabel(status: JobStatus): string {
  return statusLabel(status).toLowerCase();
}

export function useChangeStatus(onUpdated: (job: Job) => void) {
  const toast = useToast();
  const [pending, setPending] = useState<Set<string>>(new Set());

  const mark = useCallback((jobId: string, busy: boolean) => {
    setPending((prev) => {
      const next = new Set(prev);
      if (busy) next.add(jobId);
      else next.delete(jobId);
      return next;
    });
  }, []);

  const changeStatus = useCallback(
    async (job: Job, next: JobStatus) => {
      const previous = undoPatchBody({ status: job.status, status_updated_at: job.status_updated_at });
      const title = job.title || "the job";
      mark(job.job_id, true);
      try {
        const updated = await sendPatch(job.job_id, { status: next });
        onUpdated(updated);
        toast({
          message: `Moved ${title} to ${sentenceLabel(next)}.`,
          action: {
            label: "Undo",
            onAction: async () => {
              mark(job.job_id, true);
              try {
                const restored = await sendPatch(job.job_id, previous);
                onUpdated(restored);
                toast({ message: `Moved ${title} back to ${sentenceLabel(previous.status)}.` });
              } catch {
                toast({ kind: "error", message: "The undo did not work. Try again." });
              } finally {
                mark(job.job_id, false);
              }
            },
          },
        });
      } catch {
        toast({ kind: "error", message: `The status of ${title} did not change. Try again.` });
      } finally {
        mark(job.job_id, false);
      }
    },
    [mark, onUpdated, toast]
  );

  return { changeStatus, pending };
}
