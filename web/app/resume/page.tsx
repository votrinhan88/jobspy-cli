"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ResumeMeta } from "@/lib/resumes/library";
import { ResumeViewer } from "@/app/resume/_components/resume-viewer";
import { ResumeEditor } from "@/app/resume/_components/resume-editor";
import { Chip } from "@/components/chip";
import { ResumeDetailHead } from "@/app/resume/_components/resume-detail-head";
import { ResumeTable } from "@/app/resume/_components/resume-table";
import { ResumeGraph } from "@/app/resume/_components/resume-graph";
import { ResumeNew } from "@/app/resume/_components/resume-new";
import { SORT_KEYS, type Sort, type SortKey, nextSort, sortResumes } from "@/lib/resumes/sort";
import { hasAllTags, topTags } from "@/lib/resumes/tags";

export default function ResumePage() {
  const [resumes, setResumes] = useState<ResumeMeta[] | null>(null);
  const [noProfile, setNoProfile] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [viewingTag, setViewingTag] = useState<string | null>(null);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [adding, setAdding] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [sort, setSort] = useState<Sort>({ key: "name", dir: "asc" });
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [view, setView] = useState<"list" | "graph">("list");

  const viewed = resumes?.find((item) => item.tag === viewingTag) ?? resumes?.[0] ?? null;
  const showTagBar = (resumes?.length ?? 0) > 6;
  const shown = useMemo(
    () => (resumes ?? []).filter((item) => hasAllTags(item, showTagBar ? activeTags : [])),
    [resumes, activeTags, showTagBar]
  );
  const ordered = useMemo(() => sortResumes(shown, sort), [shown, sort]);
  const tagBar = useMemo(() => topTags(resumes ?? []), [resumes]);

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
      const [key, dir] = (localStorage.getItem("resume_sort") ?? "").split(":");
      if (SORT_KEYS.includes(key as SortKey) && (dir === "asc" || dir === "desc")) setSort({ key: key as SortKey, dir });
      await loadResumes();
    }
    load();
  }, [loadResumes]);

  async function handleCreated(created: string, edit: boolean) {
    setAdding(false);
    setViewingTag(created);
    setEditingTag(edit ? created : null);
    await loadResumes();
  }

  const header = (
    <header className="page-header">
      <h1 className="page-title">Resume</h1>
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

  function select(next: string) {
    if (next === viewed?.tag && editingTag === null) return;
    if (editingTag !== null && dirty && !window.confirm("Discard unsaved changes?")) return;
    setViewingTag(next);
    setEditingTag(null);
  }

  function chooseSort(key: SortKey) {
    const next = nextSort(sort, key);
    setSort(next);
    localStorage.setItem("resume_sort", `${next.key}:${next.dir}`);
  }

  function toggleTag(tag: string) {
    setActiveTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  }

  const editing = viewed !== null && editingTag === viewed.tag;

  return (
    <div className="page-content page-content--wide">
      {header}

      <div className={editing ? "resume-workspace resume-workspace--editing" : "resume-workspace"}>
        {!editing && (
        <div className="resume-main resume-library">
          {resumes && resumes.length > 0 && (
            <div className="resume-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>
                Create
              </button>
              <div className="view-toggle" role="group" aria-label="View">
                {(["list", "graph"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`view-btn${view === option ? " view-btn--active" : ""}`}
                    aria-pressed={view === option}
                    onClick={() => setView(option)}
                  >
                    {option === "list" ? "List" : "Graph"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {resumes?.length === 0 && (
            <ResumeNew resumes={resumes} onCancel={null} onCreated={handleCreated} />
          )}
          {adding && resumes && resumes.length > 0 && (
            <>
              <div className="drawer-backdrop" onClick={() => setAdding(false)} aria-hidden="true" />
              <div
                className="drawer resume-new-dialog"
                role="dialog"
                aria-modal="true"
                aria-label="New resume"
                onKeyDown={(e) => {
                  if (e.key === "Escape") setAdding(false);
                }}
              >
                <ResumeNew resumes={resumes} onCancel={() => setAdding(false)} onCreated={handleCreated} />
              </div>
            </>
          )}

          {resumes === null && !loadFailed && <p className="loading-row">Loading…</p>}
          {loadFailed && <div role="alert" className="alert alert-error">The resumes could not be loaded.</div>}
          {showTagBar && view === "list" && (
            <div className="resume-tags" role="group" aria-label="Filter by tag">
              {tagBar.map(({ tag: name, count }) => (
                <Chip key={name} pressed={activeTags.includes(name)} onClick={() => toggleTag(name)}>
                  {`${name} ${count}`}
                </Chip>
              ))}
            </div>
          )}
          {view === "list" && resumes && resumes.length > 0 && shown.length === 0 && (
            <p className="hint">No match.</p>
          )}
          {view === "graph" && resumes && resumes.length > 0 && (
            <div className="resume-graph-scroll">
              <ResumeGraph items={resumes} selectedTag={viewed?.tag} onSelect={select} />
            </div>
          )}
          {view === "list" && resumes && shown.length > 0 && (
            <ResumeTable
              items={ordered}
              sort={sort}
              selectedTag={viewed?.tag}
              onSort={chooseSort}
              onSelect={select}
            />
          )}
        </div>
        )}
        <section className="resume-preview">
          {viewed ? (
            <>
              <ResumeDetailHead
                key={viewed.tag}
                meta={viewed}
                tags={resumes?.map((item) => item.tag) ?? []}
                editing={editing}
                onEdit={() => setEditingTag(viewed.tag)}
                onBack={() => select(viewed.tag)}
                onRenamed={(next) => {
                  if (viewingTag === viewed.tag) setViewingTag(next);
                  if (editingTag === viewed.tag) setEditingTag(next);
                  return loadResumes();
                }}
                onForked={(next) => {
                  setViewingTag(next);
                  setEditingTag(next);
                  return loadResumes();
                }}
                onDeleted={() => {
                  setViewingTag(null);
                  setEditingTag(null);
                  return loadResumes();
                }}
              />

              {editing ? (
                <ResumeEditor
                  tag={viewed.tag}
                  existingTags={resumes?.map((item) => item.tag) ?? []}
                  onDirtyChange={setDirty}
                  onSaved={() => {
                    setRevision((n) => n + 1);
                    loadResumes();
                  }}
                  onCopied={(copied) => {
                    setViewingTag(copied);
                    setEditingTag(copied);
                    loadResumes();
                  }}
                />
              ) : (
                <ResumeViewer tag={viewed.tag} ext={viewed.ext} edited={viewed.edited} revision={revision} />
              )}
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
