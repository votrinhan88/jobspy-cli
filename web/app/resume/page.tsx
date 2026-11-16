"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { ResumeMeta } from "@/lib/resumes/library";
import { ResumeViewer } from "@/app/resume/_components/resume-viewer";

type InputMode = "file" | "text";

const JSON_HEADERS = { "Content-Type": "application/json" };
const IMPORT_FAILED = "The resume could not be imported.";

function renameErrorMessage(status: number): string {
  if (status === 409) return "That tag already exists.";
  if (status === 400) return "Use letters, numbers and hyphens in the tag name.";
  return "The resume could not be renamed.";
}

function resumePath(tag: string): string {
  return `/api/resumes/${encodeURIComponent(tag)}`;
}

export default function ResumePage() {
  const [resumes, setResumes] = useState<ResumeMeta[] | null>(null);
  const [noProfile, setNoProfile] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [viewingTag, setViewingTag] = useState<string | null>(null);

  const [tag, setTag] = useState("");
  const [mode, setMode] = useState<InputMode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const tagInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [renamingTag, setRenamingTag] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  const [deletingTag, setDeletingTag] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const viewed = resumes?.find((item) => item.tag === viewingTag) ?? null;
  const tagExists = resumes?.some((item) => item.tag === tag) ?? false;
  const hasInput = mode === "file" ? file !== null : text !== "";
  const canImport = tag !== "" && hasInput && !importing;

  const loadResumes = useCallback(async () => {
    const res = await fetch("/api/resumes").catch(() => null);
    if (res?.status === 400) {
      setNoProfile(true);
      return;
    }
    if (!res?.ok) {
      setLoadFailed(true);
      return;
    }
    const data = (await res.json()) as { resumes: ResumeMeta[] };
    setLoadFailed(false);
    setResumes(data.resumes);
  }, []);

  useEffect(() => {
    async function load() {
      await loadResumes();
    }
    load();
  }, [loadResumes]);

  function toggleMode() {
    setMode(mode === "file" ? "text" : "file");
    setFile(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  function replaceResume(replaced: string) {
    setTag(replaced);
    tagInput.current?.focus();
  }

  async function handleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canImport) return;

    const body = new FormData();
    body.set("tag", tag);
    if (mode === "file" && file) {
      body.set("file", file);
    } else {
      body.set("text", text);
    }

    setImporting(true);
    setImportError(null);
    const res = await fetch("/api/resumes", { method: "POST", body }).catch(() => null);
    setImporting(false);

    if (!res) {
      setImportError(IMPORT_FAILED);
      return;
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setImportError(data.error ?? IMPORT_FAILED);
      return;
    }
    setFile(null);
    setText("");
    if (fileInput.current) fileInput.current.value = "";
    await loadResumes();
  }

  function startRename(meta: ResumeMeta) {
    setRenamingTag(meta.tag);
    setRenameValue("");
    setRenameError(null);
    setDeletingTag(null);
  }

  function cancelRename() {
    setRenamingTag(null);
    setRenameError(null);
  }

  async function saveRename(event: FormEvent<HTMLFormElement>, from: string) {
    event.preventDefault();
    setRenameError(null);
    const res = await fetch(resumePath(from), {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ tag: renameValue }),
    }).catch(() => null);
    if (!res?.ok) {
      setRenameError(renameErrorMessage(res?.status ?? 0));
      return;
    }
    const data = (await res.json()) as { tag: string };
    setRenamingTag(null);
    if (viewingTag === from) setViewingTag(data.tag);
    await loadResumes();
  }

  function startDelete(meta: ResumeMeta) {
    setDeletingTag(meta.tag);
    setDeleteError(null);
    setRenamingTag(null);
  }

  function cancelDelete() {
    setDeletingTag(null);
    setDeleteError(null);
  }

  async function confirmDelete(from: string) {
    setDeleteError(null);
    const res = await fetch(resumePath(from), { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setDeleteError("The resume could not be deleted.");
      return;
    }
    setDeletingTag(null);
    if (viewingTag === from) setViewingTag(null);
    await loadResumes();
  }

  const header = (
    <header className="page-header">
      <h1 className="page-title">Resume</h1>
      <p className="page-subtitle">Import your resumes. Each one has a tag.</p>
    </header>
  );

  if (noProfile) {
    return (
      <div className="page-content">
        {header}
        <div className="empty-card">
          <p className="empty-card-text">No active profile.</p>
          <a href="/profile" className="btn btn-primary">Create a profile</a>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content page-content--wide">
      {header}

      <div className={viewed ? "resume-workspace" : undefined}>
        <div className="resume-main resume-library">
          <form className="resume-card" onSubmit={handleImport}>
            <label className="form-field">
              <span className="form-label">Tag</span>
              <input
                ref={tagInput}
                className="input input--sm"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
              />
            </label>

            {mode === "file" ? (
              <label className="form-field">
                <span className="form-label">Resume file</span>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".pdf,.tex,.md,.txt"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            ) : (
              <label className="form-field">
                <span className="form-label">Resume text</span>
                <textarea
                  className="input input--textarea"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
            )}

            <div className="resume-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={toggleMode}>
                {mode === "file" ? "Paste text instead" : "Use a file instead"}
              </button>
              <button type="submit" className="btn btn-primary" disabled={!canImport}>
                Import
              </button>
            </div>
            {tagExists && <p className="hint">Importing replaces the resume with this tag.</p>}
            {importError && <div role="alert" className="alert alert-error">{importError}</div>}
          </form>

          {resumes === null && !loadFailed && <p className="loading-row">Loading…</p>}
          {loadFailed && <div role="alert" className="alert alert-error">The resumes could not be loaded.</div>}
          {resumes?.length === 0 && (
            <div className="empty-card">
              <p className="empty-card-text">No resumes yet.</p>
            </div>
          )}
          {resumes && resumes.length > 0 && (
            <ul className="resume-list">
              {resumes.map((meta) => (
                <li key={meta.tag} aria-label={meta.tag} className="resume-item">
                  <div className="resume-item-head">
                    <div className="resume-item-info">
                      <span className="resume-item-tag">{meta.tag}</span>
                      <span className="hint">
                        {`${meta.fileName} · version ${meta.version} · ${meta.importedAt.slice(0, 10)}`}
                      </span>
                    </div>
                    <div className="resume-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setViewingTag(meta.tag)}
                      >
                        View
                      </button>
                      <a
                        className="btn btn-secondary btn-sm"
                        href={`${resumePath(meta.tag)}/file?download=1`}
                      >
                        Download
                      </a>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => replaceResume(meta.tag)}
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => startRename(meta)}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => startDelete(meta)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {renamingTag === meta.tag && (
                    <div className="resume-item-edit">
                      <form className="resume-actions" onSubmit={(e) => saveRename(e, meta.tag)}>
                        <label className="form-field">
                          <span className="form-label">{`New tag for ${meta.tag}`}</span>
                          <input
                            className="input input--sm"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                          />
                        </label>
                        <button
                          type="submit"
                          className="btn btn-primary btn-sm"
                          disabled={renameValue === ""}
                        >
                          Save
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={cancelRename}>
                          Cancel
                        </button>
                      </form>
                      {renameError && <div role="alert" className="alert alert-error">{renameError}</div>}
                    </div>
                  )}

                  {deletingTag === meta.tag && (
                    <div className="resume-item-edit">
                      <div className="resume-actions">
                        <span className="resume-item-tag">{`Delete ${meta.tag}?`}</span>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => confirmDelete(meta.tag)}
                        >
                          Yes
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={cancelDelete}>
                          Cancel
                        </button>
                      </div>
                      {deleteError && <div role="alert" className="alert alert-error">{deleteError}</div>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {viewed && (
          <section className="resume-preview">
            <h2 className="section-title">{viewed.tag}</h2>
            <ResumeViewer tag={viewed.tag} ext={viewed.ext} />
          </section>
        )}
      </div>
    </div>
  );
}
