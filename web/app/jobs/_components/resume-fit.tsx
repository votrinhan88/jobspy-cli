"use client";

import { useEffect, useState } from "react";

type RankedTag = { tag: string; score: number };
type MatchResponse = { hasDescription: boolean; ranking: RankedTag[] };

export function ResumeFit({ jobId }: { jobId: string }) {
  const [match, setMatch] = useState<MatchResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/jobs/${jobId}/match`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: MatchResponse = await res.json();
        if (!cancelled) setMatch(data);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  if (failed) {
    return (
      <div className="fit-section">
        <div role="alert" className="alert alert-error">Could not load the match.</div>
      </div>
    );
  }

  if (!match) {
    return <p className="hint">Loading match…</p>;
  }

  if (!match.hasDescription) {
    return (
      <div className="fit-section">
        <h3 className="fit-title">Resume fit</h3>
        <p className="hint">This job has no description. Run a scrape with descriptions on.</p>
      </div>
    );
  }

  const best = match.ranking[0] ?? null;
  if (!best) {
    return (
      <div className="fit-section">
        <h3 className="fit-title">Resume fit</h3>
        <p className="hint">
          Import a resume on the <a href="/resume">Resume page</a> to see matches.
        </p>
      </div>
    );
  }

  return (
    <div className="fit-section">
      <h3 className="fit-title">Resume fit</h3>
      <p className="fit-words">Best tag: {best.tag} {best.score}%</p>
      <a href={`/jobs/${jobId}/review`}>Open resume review</a>
    </div>
  );
}
