"use client";

import { useEffect, useState } from "react";
import type { ResumeMeta } from "@/lib/resumes/library";
import { ResumeViewer } from "@/app/resume/_components/resume-viewer";
import { FitReport } from "@/app/jobs/_components/fit-report";

type JobSummary = { job_id: string; title: string; company: string };
type MatchResponse = { hasDescription: boolean; ranking: { tag: string }[] };
type Loaded = { job: JobSummary; resumes: ResumeMeta[]; bestTag: string | null };
type PageState = Loaded | "missing" | "failed" | null;

async function getJson<T>(url: string): Promise<{ ok: boolean; status: number; body: T | null }> {
  try {
    const res = await fetch(url);
    const body = res.ok ? ((await res.json()) as T) : null;
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: null };
  }
}

export default function ReviewPage({ params }: { params: Promise<{ jobId: string }> }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [state, setState] = useState<PageState>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [editedTags, setEditedTags] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);

  // Unwrapping with use() suspends forever under the test renderer, so the promise is awaited in an effect.
  useEffect(() => {
    let cancelled = false;
    params.then((p) => {
      if (!cancelled) setJobId(p.jobId);
    });
    return () => {
      cancelled = true;
    };
  }, [params]);

  useEffect(() => {
    if (jobId === null) return;
    let cancelled = false;
    async function load() {
      const [jobRes, resumesRes, matchRes] = await Promise.all([
        getJson<JobSummary>(`/api/jobs/${jobId}`),
        getJson<{ resumes: ResumeMeta[] }>("/api/resumes"),
        getJson<MatchResponse>(`/api/jobs/${jobId}/match`),
      ]);
      if (cancelled) return;
      if (jobRes.status === 404) return setState("missing");
      if (!jobRes.body || !resumesRes.body) return setState("failed");

      const resumes = resumesRes.body.resumes;
      const names = new Set(resumes.map((r) => r.tag));
      const best = matchRes.body?.hasDescription ? matchRes.body.ranking[0]?.tag : undefined;
      setState({
        job: jobRes.body,
        resumes,
        bestTag: best !== undefined && names.has(best) ? best : null,
      });
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  function markEdited(tag: string) {
    setEditedTags((list) => (list.includes(tag) ? list : [...list, tag]));
    setRevision((n) => n + 1);
  }

  if (jobId === null || state === null) {
    return <div className="page-content"><p className="loading-row">Loading…</p></div>;
  }
  if (state === "missing") return <div className="page-content"><p className="hint">This job was not found.</p></div>;
  if (state === "failed") {
    return (
      <div className="page-content">
        <div role="alert" className="alert alert-error">The job could not be loaded.</div>
      </div>
    );
  }

  const { job, resumes, bestTag } = state;
  const chosen = resumes.find((r) => r.tag === (picked ?? bestTag)) ?? resumes[0] ?? null;

  return (
    <div className="page-content page-content--wide">
      <a href="/jobs" className="btn btn-sm btn-secondary">Back to jobs</a>
      <header className="page-header page-header--row">
        <h1 className="page-title">
          {job.title} <span className="page-subtitle">{job.company}</span>
        </h1>
        {chosen && (
          <select
            aria-label="Resume tag"
            className="input"
            value={chosen.tag}
            onChange={(e) => setPicked(e.target.value)}
          >
            {resumes.map((r) => (
              <option key={r.tag} value={r.tag}>
                {r.tag}
              </option>
            ))}
          </select>
        )}
      </header>

      {chosen ? (
        <div className="review-layout">
          <section>
            <ResumeViewer tag={chosen.tag} ext={chosen.ext} edited={chosen.edited || editedTags.includes(chosen.tag)} revision={revision} />
          </section>
          <section>
            <FitReport jobId={jobId} tag={chosen.tag} onApplied={() => markEdited(chosen.tag)} />
          </section>
        </div>
      ) : (
        <p className="hint">
          Import a resume on the <a href="/resume">Resume page</a> to review this job.
        </p>
      )}
    </div>
  );
}
