"use client";

import { type FormEvent, useState } from "react";
import type { ResumeMeta } from "@/lib/resumes/library";
import { editedTime } from "@/lib/resumes/sort";
import { useDismiss } from "@/components/use-dismiss";

const JSON_HEADERS = { "Content-Type": "application/json" };

function renameErrorMessage(status: number): string {
  if (status === 409) return "That tag already exists.";
  if (status === 400) return "Use letters, numbers and hyphens in the tag name.";
  return "The resume could not be renamed.";
}

function resumePath(tag: string): string {
  return `/api/resumes/${encodeURIComponent(tag)}`;
}

export function ResumeDetailHead({
  meta,
  tags,
  editing,
  onEdit,
  onBack,
  onRenamed,
  onForked,
  onDeleted,
}: {
  meta: ResumeMeta;
  tags: string[];
  editing: boolean;
  onEdit: () => void;
  onBack: () => void;
  onRenamed: (tag: string) => Promise<void> | void;
  onForked: (tag: string) => Promise<void> | void;
  onDeleted: () => Promise<void> | void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(meta.tag);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [forking, setForking] = useState(false);
  const [forkValue, setForkValue] = useState("");
  const [forkError, setForkError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useDismiss(menuOpen, "[data-resume-menu]", () => setMenuOpen(false));
  useDismiss(forking || deleting, ".resume-popover", () => {
    setForking(false);
    setDeleting(false);
    setDeleteError(null);
  });

  function startRename() {
    setRenaming(true);
    setMenuOpen(false);
    setRenameValue(meta.tag);
    setRenameError(null);
    setDeleting(false);
  }

  function cancelRename() {
    setRenaming(false);
    setRenameError(null);
  }

  async function saveRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRenameError(null);
    if (renameValue === meta.tag) {
      setRenaming(false);
      return;
    }
    const res = await fetch(resumePath(meta.tag), {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ tag: renameValue }),
    }).catch(() => null);
    if (!res?.ok) {
      setRenameError(renameErrorMessage(res?.status ?? 0));
      return;
    }
    const data = (await res.json()) as { tag: string };
    setRenaming(false);
    await onRenamed(data.tag);
  }

  function startFork() {
    setForking(true);
    setForkValue(`${meta.tag}-copy`);
    setForkError(null);
    setMenuOpen(false);
    setRenaming(false);
    setDeleting(false);
  }

  async function saveFork(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setForkError(null);
    if (tags.includes(forkValue)) {
      setForkError("That tag already exists.");
      return;
    }
    const source = await fetch(resumePath(meta.tag)).catch(() => null);
    const text = source?.ok ? ((await source.json()) as { text: string | null }).text : null;
    if (!text) {
      setForkError("The resume text could not be read.");
      return;
    }
    const body = new FormData();
    body.set("tag", forkValue);
    body.set("text", text);
    body.set("parent", meta.tag);
    const res = await fetch("/api/resumes", { method: "POST", body }).catch(() => null);
    if (!res?.ok) {
      setForkError("The fork could not be saved.");
      return;
    }
    setForking(false);
    await onForked(forkValue);
  }

  function startDelete() {
    setDeleting(true);
    setMenuOpen(false);
    setDeleteError(null);
    setRenaming(false);
  }

  function cancelDelete() {
    setDeleting(false);
    setDeleteError(null);
  }

  async function confirmDelete() {
    setDeleteError(null);
    const res = await fetch(resumePath(meta.tag), { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setDeleteError("The resume could not be deleted.");
      return;
    }
    setDeleting(false);
    await onDeleted();
  }

  return (
    <div className="resume-detail-head">
      <div className="resume-item-info">
        {renaming ? (
          <form className="resume-rename" onSubmit={saveRename}>
            <span className="resume-rename-sizer" data-value={renameValue}>
              <input
                autoFocus
                className="input input--sm"
                aria-label={`New tag for ${meta.tag}`}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") cancelRename();
                }}
                onBlur={cancelRename}
                onFocus={(e) => e.target.setSelectionRange(e.target.value.length, e.target.value.length)}
              />
            </span>
          </form>
        ) : (
          <h2 className="section-title">
            <button
              type="button"
              className="resume-title-button"
              title="Rename"
              onClick={startRename}
              onKeyDown={(e) => {
                if (e.key === "F2") startRename();
              }}
            >
              {meta.tag}
            </button>
          </h2>
        )}
        {renaming && renameError ? (
          <span role="alert" className="hint resume-rename-error">{renameError}</span>
        ) : (
          <span className="hint">
            {`version ${meta.version} · ${editedTime(meta).slice(0, 10)}${meta.edited ? " · edited" : ""}`}
          </span>
        )}
      </div>
      <div className="resume-actions">
        {editing ? (
          <button type="button" className="btn btn-secondary" onClick={onBack}>
            Back
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onEdit}>
            Edit
          </button>
        )}
        <div className="resume-menu" data-resume-menu>
          <button
            type="button"
            className="btn btn-secondary resume-menu-button"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {"⋯"}
          </button>
          {menuOpen && (
            <div role="menu" aria-label={`Actions for ${meta.tag}`} className="resume-menu-list">
              <a
                role="menuitem"
                className="resume-menu-item"
                href={`${resumePath(meta.tag)}/file?download=1`}
                onClick={() => setMenuOpen(false)}
              >
                Download
              </a>
              <button type="button" role="menuitem" className="resume-menu-item" onClick={startFork}>
                Fork
              </button>
              <button
                type="button"
                role="menuitem"
                className="resume-menu-item resume-menu-item--danger"
                onClick={startDelete}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
      {forking && (
        <form className="resume-popover" onSubmit={saveFork}>
          <input
            autoFocus
            className="input resume-popover-input"
            aria-label={`Fork name for ${meta.tag}`}
            value={forkValue}
            onChange={(e) => setForkValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setForking(false);
            }}
          />
          <button type="submit" className="btn btn-primary" disabled={forkValue === ""}>
            Fork
          </button>
          {forkError && <div role="alert" className="alert alert-error">{forkError}</div>}
        </form>
      )}
      {deleting && (
        <div className="resume-popover">
          <div className="resume-actions">
            <span className="resume-item-tag">{`Delete ${meta.tag}?`}</span>
            <button type="button" className="btn btn-danger" onClick={confirmDelete}>
              Yes
            </button>
            <button type="button" className="btn btn-secondary" onClick={cancelDelete}>
              Cancel
            </button>
          </div>
          {deleteError && <div role="alert" className="alert alert-error">{deleteError}</div>}
        </div>
      )}
    </div>
  );
}
