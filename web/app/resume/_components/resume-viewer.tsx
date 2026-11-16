"use client";

import { useEffect, useState } from "react";

type TextResult = { tag: string; text: string | null };

export function ResumeViewer({ tag, ext }: { tag: string; ext: string }) {
  if (ext === "pdf") {
    return (
      <iframe
        title="Resume viewer"
        src={`/api/resumes/${encodeURIComponent(tag)}/file`}
        className="resume-frame"
      />
    );
  }
  return <ResumeText tag={tag} />;
}

function ResumeText({ tag }: { tag: string }) {
  const [result, setResult] = useState<TextResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/resumes/${encodeURIComponent(tag)}`)
      .then(async (res) => {
        const text = res.ok ? ((await res.json()) as { text: string }).text : null;
        if (!cancelled) setResult({ tag, text });
      })
      .catch(() => {
        if (!cancelled) setResult({ tag, text: null });
      });
    return () => {
      cancelled = true;
    };
  }, [tag]);

  // A result for an older tag never matches, so the old text disappears while the new one loads.
  const current = result?.tag === tag ? result : null;

  if (current === null) {
    return <p className="loading-row">Loading…</p>;
  }
  if (current.text === null) {
    return <div role="alert" className="alert alert-error">The resume could not be opened.</div>;
  }
  return (
    <pre aria-label="Resume text" className="resume-text">
      {current.text}
    </pre>
  );
}
