"use client";

import { useEffect, useRef, useState } from "react";

interface CvMeta {
  filename: string | null;
  size: number | null;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ResumePage() {
  const [meta, setMeta] = useState<CvMeta | null>(null);
  const [noProfile, setNoProfile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const res = await fetch("/api/resume");
    if (res.status === 400) { setNoProfile(true); return; }
    if (res.ok) setMeta(await res.json());
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSuccess(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/resume", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Upload failed"); return; }
      setMeta(data);
      setSuccess(`Uploaded ${data.filename}`);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  if (noProfile) {
    return (
      <div className="page-content">
        <header className="page-header"><h1 className="page-title">Resume</h1></header>
        <div className="empty-card">
          <p className="empty-card-text">No active profile.</p>
          <a href="/profile" className="btn btn-primary">Create a profile</a>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <header className="page-header">
        <h1 className="page-title">Resume</h1>
        <p className="page-subtitle">Upload a CV for the active profile. PDF or Markdown.</p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <section className="section">
        <h2 className="section-title">Current file</h2>
        {meta?.filename ? (
          <div className="cv-meta-card">
            <span className="cv-filename">{meta.filename}</span>
            {meta.size != null && (
              <span className="cv-size">{formatBytes(meta.size)}</span>
            )}
          </div>
        ) : (
          <p className="empty-state">No CV uploaded yet.</p>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">Upload</h2>
        <label className="upload-zone" aria-disabled={uploading}>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.md"
            className="upload-input"
            onChange={handleUpload}
            disabled={uploading}
          />
          <span className="upload-icon">↑</span>
          <span className="upload-label">
            {uploading ? "Uploading…" : "Click to choose a file"}
          </span>
          <span className="upload-hint">PDF or Markdown · replaces existing file</span>
        </label>
      </section>
    </div>
  );
}
