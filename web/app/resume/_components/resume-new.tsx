"use client";

import { type FormEvent, type KeyboardEvent, useState } from "react";
import type { ResumeMeta } from "@/lib/resumes/library";
import { RESUME_TEMPLATE } from "@/lib/resumes/template";
import { isValidTag } from "@/lib/tag";

type Source = "template" | "fork" | "file";

const IMPORT_FAILED = "The resume could not be created.";

function defaultTag(existing: string[]): string {
  if (!existing.includes("resume")) return "resume";
  let n = 2;
  while (existing.includes(`resume-${n}`)) n++;
  return `resume-${n}`;
}

export function ResumeNew({
  resumes,
  onCancel,
  onCreated,
}: {
  resumes: ResumeMeta[];
  onCancel: (() => void) | null;
  onCreated: (tag: string, edit: boolean) => Promise<void> | void;
}) {
  const tags = resumes.map((item) => item.tag);
  const [source, setSource] = useState<Source>("template");
  const [tag, setTag] = useState(() => defaultTag(tags));
  const [file, setFile] = useState<File | null>(null);
  const [copyFrom, setCopyFrom] = useState(tags[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exists = tags.includes(tag);
  const valid = isValidTag(tag);
  const ready = valid && !exists && !busy && (source !== "file" || file !== null) && (source !== "fork" || copyFrom !== "");
  const options: { value: Source; label: string }[] = [
    { value: "template", label: "Template" },
    ...(tags.length > 0 ? [{ value: "fork" as const, label: "Fork" }] : []),
    { value: "file", label: "Import" },
  ];

  function choose(next: Source) {
    setSource(next);
    setError(null);
    if (next === "fork" && tag === defaultTag(tags)) setTag(`${copyFrom}-copy`);
  }

  function moveTab(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const index = options.findIndex((option) => option.value === source);
    const next = options[(index + step + options.length) % options.length];
    choose(next.value);
    const tabs = event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]');
    tabs[options.indexOf(next)]?.focus();
  }

  function chooseCopy(from: string) {
    setCopyFrom(from);
    setTag(`${from}-copy`);
  }

  async function readCopy(): Promise<string | null> {
    const res = await fetch(`/api/resumes/${encodeURIComponent(copyFrom)}`).catch(() => null);
    return res?.ok ? ((await res.json()) as { text: string | null }).text : null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);

    const body = new FormData();
    body.set("tag", tag);
    if (source === "file" && file) {
      body.set("file", file);
    } else {
      const text =
        source === "template" ? RESUME_TEMPLATE : await readCopy();
      if (!text) {
        setBusy(false);
        setError("The resume text could not be read.");
        return;
      }
      body.set("text", text);
      if (source === "fork") body.set("parent", copyFrom);
    }

    const res = await fetch("/api/resumes", { method: "POST", body }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
      setError(data?.error ?? IMPORT_FAILED);
      return;
    }
    await onCreated(tag, source !== "file");
  }

  return (
    <form className="resume-card resume-new" onSubmit={submit}>
      <div className="resume-new-tabs" role="tablist" aria-label="Start from" onKeyDown={moveTab}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={source === option.value}
            tabIndex={source === option.value ? 0 : -1}
            className="resume-new-tab"
            onClick={() => choose(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="resume-new-slot">
      {source === "file" && (
        <label className="form-field">
          <span className="form-label">Resume file</span>
          <input type="file" accept=".pdf,.tex,.md,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
      )}

      {source === "fork" && (
        <label className="form-field">
          <span className="form-label">Fork of</span>
          <select className="input input--sm" value={copyFrom} onChange={(e) => chooseCopy(e.target.value)}>
            {tags.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
      )}
      </div>

      <label className="form-field">
        <span className="form-label">Tag</span>
        <input className="input input--sm" value={tag} onChange={(e) => setTag(e.target.value)} />
      </label>
      <p className="hint resume-new-note" role="status">
        {exists ? "Tag already exists." : tag !== "" && !valid ? "Use lowercase letters, numbers and hyphens." : ""}
      </p>

      <div className="resume-actions">
        <button type="submit" className="btn btn-primary" disabled={!ready}>
          Create
        </button>
        {onCancel && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      <div className="resume-new-error">
        {error && <div role="alert" className="alert alert-error">{error}</div>}
      </div>
    </form>
  );
}
