"use client";

import { useEffect, useState } from "react";
import { ResumeSheet } from "@/app/resume/_components/resume-sheet";

type TextResult = { tag: string; text: string | null };

type ViewerProps = { tag: string; ext: string; edited?: boolean; revision?: number };

// An edited resume has text that differs from its imported file, so the text is shown instead of the file.
export function ResumeViewer({ tag, ext, edited = false, revision = 0 }: ViewerProps) {
  if (ext === "pdf" && !edited) {
    return (
      <iframe
        title="Resume viewer"
        src={`/api/resumes/${encodeURIComponent(tag)}/file#toolbar=0&navpanes=0&view=FitH`}
        className="resume-frame"
      />
    );
  }
  return <ResumeText tag={tag} revision={revision} />;
}

function ResumeText({ tag, revision }: { tag: string; revision: number }) {
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
  }, [tag, revision]);

  // A result for an older tag never matches, so the old text disappears while the new one loads.
  const current = result?.tag === tag ? result : null;

  if (current === null) {
    return <p className="loading-row">Loading…</p>;
  }
  if (current.text === null) {
    return <div role="alert" className="alert alert-error">The resume could not be opened.</div>;
  }
  return (
    <div className="resume-viewer">
      <ResumeSheet text={current.text} />
    </div>
  );
}
