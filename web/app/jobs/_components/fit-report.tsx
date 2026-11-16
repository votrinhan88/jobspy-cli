"use client";

import { useEffect, useState } from "react";
import type { Verdict } from "@/lib/analysis";
import type { SavedAnalysis } from "@/lib/analysis-store";
import type { SubmittedEntry } from "@/lib/submitted";

type RankedTag = { tag: string; score: number; matched: string[]; missing: string[] };
type MatchResponse = { hasDescription: boolean; ranking: RankedTag[] };
type TagAnalysis = { available: boolean; sendChars: number; saved: SavedAnalysis | null; stale: boolean };
type SubmittedState = { submitted: SubmittedEntry | null; changed: boolean };
type Rewrite = { original: string; suggested: string };
type Requirement = { requirement: string; evidence: string; verdict: Verdict; reasoning: string };

const WORD_LIMIT = 12;
const COPIED_MS = 2000;
const JSON_HEADERS = { "Content-Type": "application/json" };

function wordList(words: string[]): string {
  if (words.length === 0) return "none";
  const shown = words.slice(0, WORD_LIMIT).join(", ");
  const extra = words.length - WORD_LIMIT;
  return extra > 0 ? `${shown}, +${extra} more` : shown;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function FitReport({ jobId, tag }: { jobId: string; tag: string }) {
  const [match, setMatch] = useState<MatchResponse | null>(null);
  const [matchFailed, setMatchFailed] = useState(false);
  const [analysis, setAnalysis] = useState<{ tag: string; data: TagAnalysis | null } | null>(null);
  const [submitted, setSubmitted] = useState<SubmittedState | null>(null);
  const [submitError, setSubmitError] = useState(false);
  const [confirmTag, setConfirmTag] = useState<string | null>(null);
  const [runningTag, setRunningTag] = useState<string | null>(null);
  const [postError, setPostError] = useState<{ tag: string; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getJson<MatchResponse>(`/api/jobs/${jobId}/match`)
      .then((data) => {
        if (!cancelled) setMatch(data);
      })
      .catch(() => {
        if (!cancelled) setMatchFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  useEffect(() => {
    let cancelled = false;
    getJson<SubmittedState>(`/api/jobs/${jobId}/submitted`)
      .then((data) => {
        if (!cancelled) setSubmitted(data);
      })
      .catch(() => {
        if (!cancelled) setSubmitted(null);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  useEffect(() => {
    let cancelled = false;
    getJson<TagAnalysis>(`/api/jobs/${jobId}/analysis?tag=${encodeURIComponent(tag)}`)
      .then((data) => {
        if (!cancelled) setAnalysis({ tag, data });
      })
      .catch(() => {
        if (!cancelled) setAnalysis({ tag, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [jobId, tag]);

  async function runAnalysis(target: string) {
    setConfirmTag(null);
    setPostError(null);
    setRunningTag(target);
    try {
      const res = await fetch(`/api/jobs/${jobId}/analysis`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ tag: target }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setPostError({ tag: target, message: body.error ?? "Could not run the analysis." });
        return;
      }
      const saved = (await res.json()) as SavedAnalysis;
      setAnalysis((prev) =>
        prev && prev.tag === target && prev.data
          ? { tag: target, data: { ...prev.data, saved, stale: false } }
          : prev
      );
    } catch {
      setPostError({ tag: target, message: "Could not run the analysis." });
    } finally {
      setRunningTag(null);
    }
  }

  async function toggleSubmitted() {
    try {
      const res = await fetch(`/api/jobs/${jobId}/submitted`, {
        method: "PUT",
        headers: JSON_HEADERS,
        body: JSON.stringify({ tag: submittedHere ? null : tag }),
      });
      if (!res.ok) {
        setSubmitError(true);
        return;
      }
      setSubmitted((await res.json()) as SubmittedState);
      setSubmitError(false);
    } catch {
      setSubmitError(true);
    }
  }

  const entry = match?.ranking.find((r) => r.tag === tag) ?? null;
  const analysisHere = analysis?.tag === tag ? analysis.data : undefined;
  const submittedHere = submitted?.submitted?.tag === tag;
  const otherTag = submitted?.submitted && !submittedHere ? submitted.submitted.tag : null;
  const changedHere = submittedHere && submitted?.changed === true;

  function renderAnalysis(data: TagAnalysis | null | undefined) {
    if (data === undefined) return <p className="hint">Loading analysis…</p>;
    if (data === null) {
      return <div role="alert" className="alert alert-error">Could not load the analysis.</div>;
    }
    if (!data.available) {
      return <p className="hint">Set ANTHROPIC_API_KEY to use gap analysis.</p>;
    }
    const running = runningTag === tag;
    return (
      <div className="fit-section">
        {data.stale && (
          <div role="status" className="alert alert-warning">
            This analysis is out of date. The resume or the job text changed since it ran.
          </div>
        )}

        {confirmTag === tag ? (
          <div className="fit-confirm">
            <p className="fit-words">
              Send resume and job text to Claude? About {data.sendChars} characters.
            </p>
            <div className="fit-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => runAnalysis(tag)}>
                Send
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmTag(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="fit-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={running}
              onClick={() => {
                setPostError(null);
                setConfirmTag(tag);
              }}
            >
              {running ? "Analysing..." : data.saved ? "Re-run analysis" : "Analyse fit"}
            </button>
          </div>
        )}

        {postError?.tag === tag && (
          <div role="alert" className="alert alert-error">{postError.message}</div>
        )}

        {data.saved && <ResultView saved={data.saved} />}
      </div>
    );
  }

  return (
    <div className="fit-section">
      {matchFailed && <div role="alert" className="alert alert-error">Could not load the match.</div>}

      {match && !match.hasDescription && (
        <p className="hint">This job has no description. Run a scrape with descriptions on.</p>
      )}

      {entry && (
        <>
          <p className="fit-words">Keyword match: {entry.score}%</p>
          <p className="fit-words">Matched: {wordList(entry.matched)}</p>
          <p className="fit-words">Missing: {wordList(entry.missing)}</p>
        </>
      )}

      {match?.hasDescription !== false && renderAnalysis(analysisHere)}

      <div className="fit-section">
        <label className="fit-check">
          <input type="checkbox" checked={submittedHere} onChange={toggleSubmitted} />
          Submitted with this resume
        </label>
        {otherTag && <p className="hint">Submitted with resume {otherTag}.</p>}
        {changedHere && <p className="hint">The resume changed after you submitted.</p>}
        {submitError && (
          <div role="alert" className="alert alert-error">Could not save the submitted record.</div>
        )}
      </div>
    </div>
  );
}

function ResultView({ saved }: { saved: SavedAnalysis }) {
  const a = saved.analysis;
  return (
    <div className="fit-result">
      <p className="fit-score">Fit score: {a.score}</p>
      <p className="hint">This score shows how well the texts align. It does not predict a hiring result.</p>
      <p className="fit-words">{a.summary}</p>

      <h4 className="fit-title">Strengths</h4>
      <ul className="fit-list">
        {a.strengths.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>

      {a.requirements.length > 0 && <RequirementTable requirements={a.requirements} />}

      {a.gaps.length > 0 && (
        <>
          <h4 className="fit-title">Gaps</h4>
          <ul className="fit-list" aria-label="Gaps">
            {a.gaps.map((g) => (
              <li key={g.gap}>
                <strong>{g.gap}</strong>
                <span className="fit-gap-fix">{g.fix}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {a.rewrites.length > 0 && <RewriteList rewrites={a.rewrites} />}

      <p className="hint">
        {saved.model} · saved {saved.created_at.slice(0, 10)} · resume version {saved.resume_version}
      </p>
    </div>
  );
}

function RequirementTable({ requirements }: { requirements: Requirement[] }) {
  return (
    <div className="table-wrap">
      <table className="fit-table" aria-label="Requirements">
        <thead>
          <tr>
            <th>Requirement</th>
            <th>Evidence</th>
            <th>Verdict</th>
            <th>Reasoning</th>
          </tr>
        </thead>
        <tbody>
          {requirements.map((r) => (
            <tr key={r.requirement}>
              <td>{r.requirement}</td>
              <td>{r.evidence || "Not shown"}</td>
              <td>
                <span className={`verdict verdict--${r.verdict}`}>{r.verdict}</span>
              </td>
              <td>{r.reasoning}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RewriteList({ rewrites }: { rewrites: Rewrite[] }) {
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy(text: string, index: number) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(index);
  }

  return (
    <>
      <h4 className="fit-title">Suggested wording</h4>
      <ul className="fit-list" aria-label="Suggested wording">
        {rewrites.map((rw, i) => (
          <li key={i} className="fit-rewrite">
            <span className="fit-rewrite-original">{rw.original}</span>
            <span className="fit-rewrite-suggested">{rw.suggested}</span>
            <div className="fit-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => copy(rw.suggested, i)}>
                Copy
              </button>
              {copied === i && <span className="hint">Copied</span>}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
